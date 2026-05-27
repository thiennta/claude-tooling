import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { ApiFlow } from '../types.js';

/**
 * Scan tầng service/use-case của BE để tìm business flows.
 * Kết quả dùng cho gap_analysis (map sang CodeFlow) và sau này cho /test-db.
 */
export async function scanApiFlows(
  projectPath: string,
  framework: string,
  moduleFilter?: string,
): Promise<ApiFlow[]> {
  let flows: ApiFlow[] = [];

  switch (framework) {
    case 'nestjs':
      flows = await scanNestJSServices(projectPath);
      break;
    case 'express':
    case 'fastify':
    case 'koa':
    case 'node':
      flows = await scanNodeServices(projectPath);
      break;
    case 'laravel':
      flows = await scanLaravelServices(projectPath);
      break;
    case 'rails':
      flows = await scanRailsServices(projectPath);
      break;
    case 'spring':
      flows = await scanSpringServices(projectPath);
      break;
    case 'fastapi':
    case 'flask':
      flows = await scanPythonServices(projectPath);
      break;
    case 'django':
      flows = await scanDjangoServices(projectPath);
      break;
    default:
      flows = await scanNodeServices(projectPath);
  }

  if (moduleFilter) {
    const f = moduleFilter.toLowerCase();
    flows = flows.filter(fl =>
      fl.name.toLowerCase().includes(f) ||
      fl.entry.toLowerCase().includes(f) ||
      (fl.route ?? '').toLowerCase().includes(f)
    );
  }

  return flows;
}

// ─── NestJS ───────────────────────────────────────────────────────────────────

async function scanNestJSServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg('**/*.service.ts', {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', '**/*.spec.ts'],
    absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parseTypeScriptService(f, projectPath));
  return flows;
}

// ─── Express / Fastify / Koa ──────────────────────────────────────────────────

async function scanNodeServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg(['**/services/**/*.{ts,js}', '**/service/**/*.{ts,js}', '**/usecases/**/*.{ts,js}'], {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', '**/*.spec.*', '**/*.test.*'],
    absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parseTypeScriptService(f, projectPath));
  return flows;
}

// ─── TypeScript/JavaScript service parser (NestJS + Express/Fastify) ─────────

function parseTypeScriptService(filePath: string, projectPath: string): ApiFlow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const flows: ApiFlow[] = [];
  const relFile = path.relative(projectPath, filePath);

  // Extract public/async methods — tìm từng method block
  const methodPattern = /(?:async\s+)?(?:public\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*\S+\s*)?\{/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    // Bỏ qua constructor, private helpers thường gặp
    if (['constructor', 'onModuleInit', 'onModuleDestroy', 'ngOnInit'].includes(methodName)) continue;
    if (methodName.startsWith('_') || /^[A-Z]/.test(methodName)) continue; // skip private & class names

    const bodyStart = match.index + match[0].length;
    const body = extractMethodBody(content, bodyStart);

    const dbOps       = extractDbOperations(body);
    const serviceOps  = extractServiceCalls(body, content);
    const allOps      = [...new Set([...dbOps, ...serviceOps, ...extractExternalCalls(body)])];

    if (allOps.length === 0) continue; // method đơn giản, không quan tâm

    flows.push({
      name: `${path.basename(filePath, '.ts').replace('.service', '')}.${methodName}`,
      entry: relFile,
      operations: allOps,
      dbOperations: dbOps,
      serviceOperations: serviceOps,
      calledBy: [], // link với routes ở skill layer
    });
  }

  return flows;
}

// ─── Laravel ──────────────────────────────────────────────────────────────────

async function scanLaravelServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg(['app/Services/**/*.php', 'app/Actions/**/*.php', 'app/UseCases/**/*.php'], {
    cwd: projectPath, absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parsePhpService(f, projectPath));
  return flows;
}

function parsePhpService(filePath: string, projectPath: string): ApiFlow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const flows: ApiFlow[] = [];
  const relFile = path.relative(projectPath, filePath);

  // public function methodName(
  const methodPattern = /public\s+function\s+(\w+)\s*\([^)]*\)/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    if (methodName === '__construct') continue;

    const bodyStart = content.indexOf('{', match.index + match[0].length);
    const body = extractMethodBody(content, bodyStart + 1);

    const dbOps = extractEloquentOps(body);
    const serviceOps = extractPhpServiceCalls(body);
    const allOps = [...new Set([...dbOps, ...serviceOps])];

    if (allOps.length === 0) continue;

    flows.push({
      name: `${path.basename(filePath, '.php')}.${methodName}`,
      entry: relFile,
      operations: allOps,
      dbOperations: dbOps,
      serviceOperations: serviceOps,
      calledBy: [],
    });
  }
  return flows;
}

// ─── Rails ────────────────────────────────────────────────────────────────────

async function scanRailsServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg(['app/services/**/*.rb', 'app/interactors/**/*.rb', 'app/operations/**/*.rb'], {
    cwd: projectPath, absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parseRubyService(f, projectPath));
  return flows;
}

function parseRubyService(filePath: string, projectPath: string): ApiFlow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const flows: ApiFlow[] = [];
  const relFile = path.relative(projectPath, filePath);

  // def method_name
  const methodPattern = /def\s+(\w+)(?:\s*\([^)]*\))?\s*\n([\s\S]*?)(?=\n\s*def|\nend\n|$)/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    if (methodName.startsWith('_') || methodName === 'initialize') continue;
    const body = match[2];

    const dbOps = extractActiveRecordOps(body);
    const serviceOps: string[] = [];
    const allOps = [...new Set([...dbOps, ...serviceOps])];
    if (allOps.length === 0) continue;

    flows.push({
      name: `${path.basename(filePath, '.rb')}.${methodName}`,
      entry: relFile,
      operations: allOps,
      dbOperations: dbOps,
      serviceOperations: serviceOps,
      calledBy: [],
    });
  }
  return flows;
}

// ─── Spring Boot ──────────────────────────────────────────────────────────────

async function scanSpringServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg(['**/*Service.java', '**/*ServiceImpl.java', '**/*UseCase.java'], {
    cwd: projectPath,
    ignore: ['**/test/**', '**/target/**', '**/build/**'],
    absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parseJavaService(f, projectPath));
  return flows;
}

function parseJavaService(filePath: string, projectPath: string): ApiFlow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const flows: ApiFlow[] = [];
  const relFile = path.relative(projectPath, filePath);

  // public ReturnType methodName(
  const methodPattern = /public\s+\S+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+\S+\s*)?\{/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    if (methodName === methodName[0].toUpperCase() + methodName.slice(1) && !['get', 'find', 'create', 'update', 'delete', 'save'].some(v => methodName.startsWith(v))) continue;

    const bodyStart = match.index + match[0].length;
    const body = extractMethodBody(content, bodyStart);

    const dbOps = extractJpaOps(body);
    const serviceOps = extractJavaServiceCalls(body, content);
    const allOps = [...new Set([...dbOps, ...serviceOps])];
    if (allOps.length === 0) continue;

    flows.push({
      name: `${path.basename(filePath, '.java')}.${methodName}`,
      entry: relFile,
      operations: allOps,
      dbOperations: dbOps,
      serviceOperations: serviceOps,
      calledBy: [],
    });
  }
  return flows;
}

// ─── Python (FastAPI / Flask) ─────────────────────────────────────────────────

async function scanPythonServices(projectPath: string): Promise<ApiFlow[]> {
  const files = await fg(['**/services/**/*.py', '**/service/**/*.py', '**/repositories/**/*.py'], {
    cwd: projectPath,
    ignore: ['**/site-packages/**', '**/__pycache__/**', '**/tests/**', '**/migrations/**'],
    absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parsePythonService(f, projectPath));
  return flows;
}

// ─── Django ───────────────────────────────────────────────────────────────────

async function scanDjangoServices(projectPath: string): Promise<ApiFlow[]> {
  // Django thường dùng fat views hoặc service layer riêng
  const files = await fg(['**/services.py', '**/services/**/*.py', '**/selectors.py', '**/selectors/**/*.py'], {
    cwd: projectPath,
    ignore: ['**/site-packages/**', '**/__pycache__/**'],
    absolute: true,
  });
  const flows: ApiFlow[] = [];
  for (const f of files) flows.push(...parsePythonService(f, projectPath));
  return flows;
}

function parsePythonService(filePath: string, projectPath: string): ApiFlow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const flows: ApiFlow[] = [];
  const relFile = path.relative(projectPath, filePath);

  const methodPattern = /(?:async\s+)?def\s+(\w+)\s*\([^)]*\)(?:\s*->\s*\S+)?\s*:/g;
  let match: RegExpExecArray | null;

  while ((match = methodPattern.exec(content)) !== null) {
    const methodName = match[1];
    if (methodName.startsWith('_') || methodName === '__init__') continue;

    // Lấy body bằng indentation
    const bodyStart = content.indexOf('\n', match.index + match[0].length);
    const body = extractPythonMethodBody(content, bodyStart);

    const dbOps = extractSqlAlchemyOps(body);
    const serviceOps: string[] = [];
    const allOps = [...new Set([...dbOps, ...serviceOps])];
    if (allOps.length === 0) continue;

    flows.push({
      name: `${path.basename(filePath, '.py')}.${methodName}`,
      entry: relFile,
      operations: allOps,
      dbOperations: dbOps,
      serviceOperations: serviceOps,
      calledBy: [],
    });
  }
  return flows;
}

// ─── Operation extractors ─────────────────────────────────────────────────────

/** Prisma: this.prisma.user.create(), this.prisma.order.findMany() */
function extractDbOperations(body: string): string[] {
  const ops = new Set<string>();

  // Prisma
  for (const m of body.matchAll(/(?:this\.)?prisma\.(\w+)\.(\w+)\s*\(/g)) {
    ops.add(`prisma.${m[1]}.${m[2]}`);
  }
  // TypeORM: this.userRepo.save(), this.repo.findOne()
  for (const m of body.matchAll(/this\.(?:\w+[Rr]epo(?:sitory)?|\w+Repository)\.(\w+)\s*\(/g)) {
    ops.add(`repository.${m[1]}`);
  }
  // Sequelize: User.findAll(), User.create()
  for (const m of body.matchAll(/([A-Z]\w+)\.(findAll|findOne|findByPk|create|update|destroy|bulkCreate|upsert)\s*\(/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  // Mongoose: User.find(), new User()
  for (const m of body.matchAll(/(?:new\s+)?([A-Z]\w+)\.(find|findOne|findById|create|updateOne|deleteOne|insertMany)\s*\(/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  // Drizzle: db.insert(table), db.select()
  for (const m of body.matchAll(/\bdb\.(insert|select|update|delete|query)\s*\(/g)) {
    ops.add(`db.${m[1]}`);
  }

  return [...ops];
}

function extractServiceCalls(body: string, fileContent: string): string[] {
  const ops = new Set<string>();
  // this.emailService.send(), this.paymentService.charge()
  for (const m of body.matchAll(/this\.(\w+Service|\w+Repository|\w+Client|\w+Handler)\.(\w+)\s*\(/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  return [...ops];
}

function extractExternalCalls(body: string): string[] {
  const ops = new Set<string>();
  // HTTP calls: fetch(), axios.get(), http.post()
  for (const m of body.matchAll(/(?:fetch|axios|http|got|superagent)\s*(?:\.\s*(get|post|put|delete|patch))?\s*\(/g)) {
    ops.add(m[1] ? `http.${m[1]}` : 'http.fetch');
  }
  return [...ops];
}

function extractEloquentOps(body: string): string[] {
  const ops = new Set<string>();
  // Model::create(), Model::find(), $model->save()
  for (const m of body.matchAll(/([A-Z]\w+)::(create|find|findOrFail|where|all|first|update|delete|insert)\s*\(/g)) {
    ops.add(`${m[1]}::${m[2]}`);
  }
  for (const m of body.matchAll(/\$\w+\s*->\s*(save|delete|update|fill)\s*\(/g)) {
    ops.add(`model->${m[1]}`);
  }
  return [...ops];
}

function extractPhpServiceCalls(body: string): string[] {
  const ops = new Set<string>();
  for (const m of body.matchAll(/\$this\s*->\s*(\w+(?:Service|Repository|Manager))\s*->\s*(\w+)\s*\(/g)) {
    ops.add(`${m[1]}->${m[2]}`);
  }
  return [...ops];
}

function extractActiveRecordOps(body: string): string[] {
  const ops = new Set<string>();
  for (const m of body.matchAll(/([A-Z]\w+)\.(create!?|find|find_by|where|update|destroy|save!?|new)\s*[(\s]/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  return [...ops];
}

function extractJpaOps(body: string): string[] {
  const ops = new Set<string>();
  for (const m of body.matchAll(/(\w+[Rr]epository|entityManager)\.(save|findById|findAll|delete|deleteById|findBy|existsById)\s*\(/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  return [...ops];
}

function extractJavaServiceCalls(body: string, _fileContent: string): string[] {
  const ops = new Set<string>();
  for (const m of body.matchAll(/(\w+Service|\w+Client|\w+Sender)\.(send|notify|publish|request|process|\w+)\s*\(/g)) {
    ops.add(`${m[1]}.${m[2]}`);
  }
  return [...ops];
}

function extractSqlAlchemyOps(body: string): string[] {
  const ops = new Set<string>();
  for (const m of body.matchAll(/db\.(add|delete|execute|query|commit)\s*\(/g)) {
    ops.add(`db.${m[1]}`);
  }
  for (const m of body.matchAll(/session\.(add|delete|execute|query|commit|flush)\s*\(/g)) {
    ops.add(`session.${m[1]}`);
  }
  return [...ops];
}

// ─── Body extractors ──────────────────────────────────────────────────────────

/** Lấy body của method bằng cách đếm dấu ngoặc nhọn (TS/JS/Java/PHP) */
function extractMethodBody(content: string, startIndex: number): string {
  let depth = 1;
  let i = startIndex;
  while (i < content.length && depth > 0) {
    if (content[i] === '{') depth++;
    else if (content[i] === '}') depth--;
    i++;
  }
  return content.slice(startIndex, i - 1);
}

/** Lấy body bằng indentation (Python) */
function extractPythonMethodBody(content: string, startIndex: number): string {
  const lines = content.slice(startIndex).split('\n');
  if (lines.length < 2) return '';

  // Detect indent level của dòng đầu tiên có nội dung
  const firstContentLine = lines.find(l => l.trim().length > 0) ?? '';
  const indent = firstContentLine.match(/^(\s+)/)?.[1]?.length ?? 4;

  const bodyLines: string[] = [];
  for (const line of lines.slice(1)) {
    if (line.trim() === '') { bodyLines.push(line); continue; }
    const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (lineIndent < indent) break;
    bodyLines.push(line);
  }
  return bodyLines.join('\n');
}
