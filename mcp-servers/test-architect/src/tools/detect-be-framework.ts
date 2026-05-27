import * as fs from 'fs';
import * as path from 'path';
import type { BackendFrameworkInfo } from '../types.js';

export async function detectBeFramework(projectPath: string): Promise<BackendFrameworkInfo> {
  const result = detectFrameworkCore(projectPath);

  // Enrich với DB info và OpenAPI — luôn chạy bất kể framework
  result.dbClient  = detectDbClient(projectPath, result.language);
  result.dbType    = detectDbType(projectPath, result.dbClient);

  const openApi    = findOpenApiSpec(projectPath);
  result.hasOpenApiSpec  = openApi.found;
  result.openApiSpecPath = openApi.path;

  return result;
}

// ─── Core detection ───────────────────────────────────────────────────────────

function detectFrameworkCore(projectPath: string): BackendFrameworkInfo {
  const base: BackendFrameworkInfo = {
    framework: 'unknown', language: 'unknown',
    devCommand: '', baseURL: 'http://localhost:3000',
    apiPrefix: '/api', dbClient: 'unknown', dbType: 'unknown',
    configFile: '', hasOpenApiSpec: false,
    confidence: 'low', detectionNotes: [],
  };

  // ── NestJS (kiểm tra trước Express vì nest-cli.json rất đặc trưng)
  if (fs.existsSync(path.join(projectPath, 'nest-cli.json'))) {
    return detectNestJS(projectPath, base);
  }

  // ── Laravel
  if (fs.existsSync(path.join(projectPath, 'artisan'))) {
    return detectLaravel(projectPath, base);
  }

  // ── Rails
  const gemfile = path.join(projectPath, 'Gemfile');
  if (fs.existsSync(gemfile)) {
    const content = fs.readFileSync(gemfile, 'utf-8');
    if (content.includes("gem 'rails'") || content.includes('gem "rails"')) {
      return detectRails(projectPath, base, content);
    }
  }

  // ── Spring Boot
  if (fs.existsSync(path.join(projectPath, 'pom.xml'))) {
    return detectSpring(projectPath, base, 'pom.xml');
  }
  if (fs.existsSync(path.join(projectPath, 'build.gradle'))) {
    return detectSpring(projectPath, base, 'build.gradle');
  }

  // ── Python (FastAPI / Django / Flask)
  for (const reqFile of ['requirements.txt', 'pyproject.toml']) {
    const reqPath = path.join(projectPath, reqFile);
    if (fs.existsSync(reqPath)) {
      return detectPython(projectPath, base, reqPath);
    }
  }

  // ── Node.js (NestJS không có nest-cli.json, Express, Fastify, Koa)
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    return detectNodeBackend(projectPath, base, pkgPath);
  }

  base.detectionNotes.push('Không tìm thấy file cấu hình nào — cần xác nhận thủ công');
  return base;
}

// ─── Framework detectors ──────────────────────────────────────────────────────

function detectNestJS(projectPath: string, base: BackendFrameworkInfo): BackendFrameworkInfo {
  const notes: string[] = ['nest-cli.json ✓'];
  let confidence: BackendFrameworkInfo['confidence'] = 'medium';

  const pkgPath = path.join(projectPath, 'package.json');
  let devCommand = 'npm run start:dev';
  let version = 'unknown';

  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if (deps['@nestjs/core']) {
      notes.push('@nestjs/core in package.json ✓');
      version = deps['@nestjs/core'];
      confidence = 'high';
    }
    if (pkg.scripts?.['start:dev']) devCommand = 'npm run start:dev';
    else if (pkg.scripts?.dev)      devCommand = 'npm run dev';
    else if (pkg.scripts?.start)    devCommand = 'npm run start';
  }

  if (fs.existsSync(path.join(projectPath, 'src', 'app.module.ts'))) {
    notes.push('src/app.module.ts ✓');
    confidence = 'high';
  }

  // Detect API prefix từ main.ts
  const apiPrefix = detectNestApiPrefix(projectPath);
  if (apiPrefix !== '/api') notes.push(`API prefix detected: ${apiPrefix}`);

  return {
    ...base,
    framework: 'nestjs', language: 'typescript',
    devCommand, baseURL: detectPort(projectPath, 'http://localhost:3000'),
    apiPrefix, configFile: 'nest-cli.json',
    confidence, detectionNotes: notes,
  };
}

function detectLaravel(projectPath: string, base: BackendFrameworkInfo): BackendFrameworkInfo {
  const notes: string[] = ['artisan ✓'];
  let confidence: BackendFrameworkInfo['confidence'] = 'medium';
  let version = 'unknown';

  const composerPath = path.join(projectPath, 'composer.json');
  if (fs.existsSync(composerPath)) {
    try {
      const composer = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
      if (composer.require?.['laravel/framework']) {
        version = composer.require['laravel/framework'];
        notes.push(`laravel/framework ${version} in composer.json ✓`);
        confidence = 'high';
      }
    } catch { /* ignore */ }
  }

  if (fs.existsSync(path.join(projectPath, 'routes', 'api.php'))) {
    notes.push('routes/api.php ✓');
    confidence = 'high';
  }

  return {
    ...base,
    framework: 'laravel', language: 'php',
    devCommand: 'php artisan serve',
    baseURL: 'http://localhost:8000',
    apiPrefix: '/api',
    configFile: 'artisan',
    confidence, detectionNotes: notes,
  };
}

function detectRails(projectPath: string, base: BackendFrameworkInfo, gemfileContent: string): BackendFrameworkInfo {
  const notes: string[] = ["gem 'rails' in Gemfile ✓"];
  let confidence: BackendFrameworkInfo['confidence'] = 'medium';

  if (fs.existsSync(path.join(projectPath, 'config', 'routes.rb'))) {
    notes.push('config/routes.rb ✓');
    confidence = 'high';
  }
  if (fs.existsSync(path.join(projectPath, 'app', 'controllers'))) {
    notes.push('app/controllers/ ✓');
    confidence = 'high';
  }

  // API-only app có config/application.rb với ActionController::API
  let apiPrefix = '/api';
  const appConfig = path.join(projectPath, 'config', 'application.rb');
  if (fs.existsSync(appConfig)) {
    const content = fs.readFileSync(appConfig, 'utf-8');
    if (content.includes('ActionController::API')) {
      notes.push('API-only mode (ActionController::API) ✓');
    }
    const nsMatch = content.match(/namespace\s+:(\w+)/);
    if (nsMatch) apiPrefix = `/${nsMatch[1]}`;
  }

  return {
    ...base,
    framework: 'rails', language: 'ruby',
    devCommand: 'rails server', baseURL: 'http://localhost:3000',
    apiPrefix, configFile: 'Gemfile',
    confidence, detectionNotes: notes,
  };
}

function detectSpring(projectPath: string, base: BackendFrameworkInfo, configFile: string): BackendFrameworkInfo {
  const notes: string[] = [`${configFile} ✓`];
  let confidence: BackendFrameworkInfo['confidence'] = 'medium';
  let devCommand = configFile === 'pom.xml' ? 'mvn spring-boot:run' : './gradlew bootRun';
  let baseURL = 'http://localhost:8080';

  try {
    const content = fs.readFileSync(path.join(projectPath, configFile), 'utf-8');
    if (content.includes('spring-boot')) {
      notes.push('spring-boot dependency ✓');
      confidence = 'high';
    }
    if (content.includes('spring-web') || content.includes('spring-webmvc')) {
      notes.push('spring-web ✓');
    }
  } catch { /* ignore */ }

  // Detect port từ application.properties/yml
  const port = detectSpringPort(projectPath);
  if (port) baseURL = `http://localhost:${port}`;

  // Detect context path
  const contextPath = detectSpringContextPath(projectPath);
  const apiPrefix = contextPath || '/api';
  if (contextPath) notes.push(`server.servlet.context-path: ${contextPath} ✓`);

  // Detect src/main/java (Maven standard layout)
  if (fs.existsSync(path.join(projectPath, 'src', 'main', 'java'))) {
    notes.push('src/main/java/ ✓');
    confidence = 'high';
  }

  return {
    ...base,
    framework: 'spring', language: 'java',
    devCommand, baseURL, apiPrefix, configFile,
    confidence, detectionNotes: notes,
  };
}

function detectPython(projectPath: string, base: BackendFrameworkInfo, reqFile: string): BackendFrameworkInfo {
  const content = fs.readFileSync(reqFile, 'utf-8').toLowerCase();
  const notes: string[] = [`${path.basename(reqFile)} ✓`];
  let result: BackendFrameworkInfo = { ...base, configFile: path.basename(reqFile), language: 'python' };

  if (content.includes('fastapi')) {
    notes.push('fastapi ✓');
    // Find main entry point
    const mainFile = findFastApiMain(projectPath);
    const mainModule = mainFile ? path.basename(mainFile, '.py') + ':app' : 'main:app';
    result = { ...result, framework: 'fastapi', devCommand: `uvicorn ${mainModule} --reload`, baseURL: 'http://localhost:8000', confidence: 'high' };
  } else if (content.includes('django')) {
    notes.push('django ✓');
    if (fs.existsSync(path.join(projectPath, 'manage.py'))) notes.push('manage.py ✓');
    result = { ...result, framework: 'django', devCommand: 'python manage.py runserver', baseURL: 'http://localhost:8000', confidence: 'high' };
  } else if (content.includes('flask')) {
    notes.push('flask ✓');
    result = { ...result, framework: 'flask', devCommand: 'flask run', baseURL: 'http://localhost:5000', confidence: 'high' };
  } else {
    notes.push('Python project nhưng không rõ framework');
    result = { ...result, framework: 'python', devCommand: 'python app.py', baseURL: 'http://localhost:5000', confidence: 'low' };
  }

  result.apiPrefix = '/api';
  result.detectionNotes = notes;
  return result;
}

function detectNodeBackend(projectPath: string, base: BackendFrameworkInfo, pkgPath: string): BackendFrameworkInfo {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const notes: string[] = ['package.json ✓'];

  // NestJS không có nest-cli.json (hiếm nhưng có thể)
  if (deps['@nestjs/core']) {
    notes.push('@nestjs/core ✓');
    return {
      ...base, framework: 'nestjs', language: 'typescript',
      devCommand: pkg.scripts?.['start:dev'] ? 'npm run start:dev' : 'npm run dev',
      baseURL: detectPort(projectPath, 'http://localhost:3000'),
      apiPrefix: '/api', configFile: 'package.json',
      confidence: 'high', detectionNotes: notes,
    };
  }

  if (deps['fastify']) {
    notes.push('fastify ✓');
    return {
      ...base, framework: 'fastify', language: deps['typescript'] ? 'typescript' : 'javascript',
      devCommand: pkg.scripts?.dev || pkg.scripts?.start || 'npm run dev',
      baseURL: detectPort(projectPath, 'http://localhost:3000'),
      apiPrefix: '/api', configFile: 'package.json',
      confidence: 'high', detectionNotes: notes,
    };
  }

  if (deps['express']) {
    notes.push('express ✓');
    const hasTs = !!deps['typescript'] || fs.existsSync(path.join(projectPath, 'tsconfig.json'));
    return {
      ...base, framework: 'express', language: hasTs ? 'typescript' : 'javascript',
      devCommand: pkg.scripts?.dev || pkg.scripts?.start || 'npm run dev',
      baseURL: detectPort(projectPath, 'http://localhost:3000'),
      apiPrefix: '/api', configFile: 'package.json',
      confidence: 'high', detectionNotes: notes,
    };
  }

  if (deps['koa']) {
    notes.push('koa ✓');
    return {
      ...base, framework: 'koa', language: deps['typescript'] ? 'typescript' : 'javascript',
      devCommand: pkg.scripts?.dev || pkg.scripts?.start || 'npm run dev',
      baseURL: detectPort(projectPath, 'http://localhost:3000'),
      apiPrefix: '/api', configFile: 'package.json',
      confidence: 'high', detectionNotes: notes,
    };
  }

  notes.push('Node.js project — không rõ framework');
  return {
    ...base, framework: 'node', language: 'javascript',
    devCommand: pkg.scripts?.dev || pkg.scripts?.start || 'npm start',
    baseURL: detectPort(projectPath, 'http://localhost:3000'),
    apiPrefix: '/api', configFile: 'package.json',
    confidence: 'low', detectionNotes: notes,
  };
}

// ─── DB detection ─────────────────────────────────────────────────────────────

function detectDbClient(projectPath: string, language: string): string {
  // Prisma
  if (fs.existsSync(path.join(projectPath, 'prisma', 'schema.prisma'))) return 'prisma';

  // Node.js ORM
  const pkgPath = path.join(projectPath, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const deps = (() => { try { const p = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); return { ...p.dependencies, ...p.devDependencies }; } catch { return {}; } })();
    if (deps['typeorm'])           return 'typeorm';
    if (deps['sequelize'])         return 'sequelize';
    if (deps['mongoose'])          return 'mongoose';
    if (deps['@mikro-orm/core'])   return 'mikro-orm';
    if (deps['drizzle-orm'])       return 'drizzle';
    if (deps['knex'])              return 'knex';
  }

  // PHP / Laravel → Eloquent
  if (language === 'php' && fs.existsSync(path.join(projectPath, 'app', 'Models'))) return 'eloquent';

  // Ruby / Rails → ActiveRecord
  if (language === 'ruby') {
    const gemfile = path.join(projectPath, 'Gemfile');
    if (fs.existsSync(gemfile) && fs.readFileSync(gemfile, 'utf-8').includes('activerecord')) return 'activerecord';
    if (fs.existsSync(path.join(projectPath, 'config', 'database.yml'))) return 'activerecord';
  }

  // Python
  if (language === 'python') {
    const reqPath = path.join(projectPath, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      const req = fs.readFileSync(reqPath, 'utf-8').toLowerCase();
      if (req.includes('sqlalchemy'))  return 'sqlalchemy';
      if (req.includes('tortoise'))    return 'tortoise-orm';
      if (req.includes('peewee'))      return 'peewee';
      if (req.includes('django'))      return 'django-orm';
    }
  }

  // Java / Spring
  if (language === 'java') {
    const pomPath = path.join(projectPath, 'pom.xml');
    if (fs.existsSync(pomPath)) {
      const pom = fs.readFileSync(pomPath, 'utf-8');
      if (pom.includes('spring-data-jpa') || pom.includes('hibernate')) return 'jpa';
      if (pom.includes('mybatis'))  return 'mybatis';
      if (pom.includes('r2dbc'))    return 'r2dbc';
    }
  }

  return 'unknown';
}

function detectDbType(projectPath: string, dbClient: string): string {
  // Prisma schema
  const prismaSchema = path.join(projectPath, 'prisma', 'schema.prisma');
  if (fs.existsSync(prismaSchema)) {
    const content = fs.readFileSync(prismaSchema, 'utf-8');
    const m = content.match(/provider\s*=\s*"(\w+)"/);
    if (m) return m[1]; // postgresql | mysql | sqlite | mongodb
  }

  // .env / .env.* → DATABASE_URL
  const dbUrl = readDatabaseUrl(projectPath);
  if (dbUrl) {
    if (dbUrl.startsWith('postgresql') || dbUrl.startsWith('postgres')) return 'postgresql';
    if (dbUrl.startsWith('mysql'))     return 'mysql';
    if (dbUrl.startsWith('mongodb'))   return 'mongodb';
    if (dbUrl.startsWith('sqlite'))    return 'sqlite';
  }

  // Rails database.yml
  const dbYml = path.join(projectPath, 'config', 'database.yml');
  if (fs.existsSync(dbYml)) {
    const content = fs.readFileSync(dbYml, 'utf-8').toLowerCase();
    if (content.includes('postgresql') || content.includes('pg'))  return 'postgresql';
    if (content.includes('mysql'))   return 'mysql';
    if (content.includes('sqlite'))  return 'sqlite';
  }

  // Spring application.properties/yml
  for (const f of ['application.properties', 'application.yml']) {
    const appConfig = path.join(projectPath, 'src', 'main', 'resources', f);
    if (fs.existsSync(appConfig)) {
      const content = fs.readFileSync(appConfig, 'utf-8').toLowerCase();
      if (content.includes('postgresql') || content.includes('postgres')) return 'postgresql';
      if (content.includes('mysql'))   return 'mysql';
      if (content.includes('h2'))      return 'h2';
      if (content.includes('mongodb')) return 'mongodb';
    }
  }

  return 'unknown';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readDatabaseUrl(projectPath: string): string | null {
  for (const envFile of ['.env', '.env.local', '.env.development', '.env.test']) {
    const p = path.join(projectPath, envFile);
    if (!fs.existsSync(p)) continue;
    const match = fs.readFileSync(p, 'utf-8').match(/DATABASE_URL=["']?([^\s"']+)/);
    if (match) return match[1];
  }
  return null;
}

function detectPort(projectPath: string, fallback: string): string {
  // .env PORT=
  for (const envFile of ['.env', '.env.local', '.env.development']) {
    const p = path.join(projectPath, envFile);
    if (!fs.existsSync(p)) continue;
    const match = fs.readFileSync(p, 'utf-8').match(/^PORT=(\d+)/m);
    if (match) return `http://localhost:${match[1]}`;
  }
  return fallback;
}

function detectNestApiPrefix(projectPath: string): string {
  for (const main of ['src/main.ts', 'src/main.js']) {
    const p = path.join(projectPath, main);
    if (!fs.existsSync(p)) continue;
    const match = fs.readFileSync(p, 'utf-8').match(/setGlobalPrefix\(['"]([^'"]+)['"]\)/);
    if (match) return '/' + match[1].replace(/^\//, '');
  }
  return '/api';
}

function detectSpringPort(projectPath: string): string | null {
  const propsPath = path.join(projectPath, 'src', 'main', 'resources', 'application.properties');
  if (fs.existsSync(propsPath)) {
    const match = fs.readFileSync(propsPath, 'utf-8').match(/server\.port\s*=\s*(\d+)/);
    if (match) return match[1];
  }
  const ymlPath = path.join(projectPath, 'src', 'main', 'resources', 'application.yml');
  if (fs.existsSync(ymlPath)) {
    const match = fs.readFileSync(ymlPath, 'utf-8').match(/port:\s*(\d+)/);
    if (match) return match[1];
  }
  return null;
}

function detectSpringContextPath(projectPath: string): string | null {
  const propsPath = path.join(projectPath, 'src', 'main', 'resources', 'application.properties');
  if (fs.existsSync(propsPath)) {
    const match = fs.readFileSync(propsPath, 'utf-8').match(/server\.servlet\.context-path\s*=\s*(\S+)/);
    if (match) return match[1];
  }
  return null;
}

function findFastApiMain(projectPath: string): string | null {
  for (const candidate of ['main.py', 'app/main.py', 'app.py', 'src/main.py']) {
    const p = path.join(projectPath, candidate);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf-8');
      if (content.includes('FastAPI()')) return p;
    }
  }
  return null;
}

function findOpenApiSpec(projectPath: string): { found: boolean; path?: string } {
  const candidates = [
    'openapi.yaml', 'openapi.yml', 'openapi.json',
    'swagger.yaml', 'swagger.yml', 'swagger.json',
    'docs/openapi.yaml', 'docs/swagger.yaml',
    'api/openapi.yaml',
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(projectPath, c))) return { found: true, path: c };
  }
  return { found: false };
}
