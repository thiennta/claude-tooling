import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { ApiRoute } from '../types.js';

export async function scanApiRoutes(
  projectPath: string,
  framework: string,
  apiPrefix: string = '/api',
  moduleFilter?: string,
): Promise<ApiRoute[]> {
  const routes: ApiRoute[] = [];

  switch (framework) {
    case 'nestjs':
      routes.push(...await scanNestJS(projectPath, apiPrefix));
      break;
    case 'express':
    case 'fastify':
    case 'koa':
    case 'node':
      routes.push(...await scanNodeRoutes(projectPath, apiPrefix));
      break;
    case 'laravel':
      routes.push(...await scanLaravel(projectPath));
      break;
    case 'rails':
      routes.push(...await scanRails(projectPath, apiPrefix));
      break;
    case 'spring':
      routes.push(...await scanSpring(projectPath, apiPrefix));
      break;
    case 'fastapi':
      routes.push(...await scanFastAPI(projectPath, apiPrefix));
      break;
    case 'django':
      routes.push(...await scanDjango(projectPath, apiPrefix));
      break;
    case 'flask':
      routes.push(...await scanFlask(projectPath, apiPrefix));
      break;
    default:
      // Best-effort: thử cả Node và phổ biến
      routes.push(...await scanNodeRoutes(projectPath, apiPrefix));
  }

  // Lọc theo module nếu có
  if (moduleFilter) {
    const filter = moduleFilter.toLowerCase();
    return routes.filter(r =>
      r.path.toLowerCase().includes(filter) ||
      r.handler.toLowerCase().includes(filter) ||
      r.file.toLowerCase().includes(filter)
    );
  }

  return routes;
}

// ─── NestJS ───────────────────────────────────────────────────────────────────

async function scanNestJS(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const files = await fg('**/*.controller.ts', {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', '**/*.spec.ts'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    routes.push(...parseNestController(file, projectPath, apiPrefix));
  }
  return routes;
}

function parseNestController(filePath: string, projectPath: string, apiPrefix: string): ApiRoute[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: ApiRoute[] = [];
  const relFile = path.relative(projectPath, filePath);

  // Controller prefix: @Controller('auth') hoặc @Controller()
  const ctrlMatch = content.match(/@Controller\(['"`]?([^'"`)\s]*)['"`]?\)/);
  const ctrlPrefix = ctrlMatch ? '/' + ctrlMatch[1].replace(/^\//, '') : '';

  // Auth guards ở controller level
  const ctrlHasAuth = /@UseGuards|@Roles|@Auth\b/.test(
    content.slice(0, content.indexOf('export class'))
  );

  // HTTP method decorators
  const methodDecorators = [
    { pattern: /@Get\(['"`]?([^'"`)\s]*)['"`]?\)/g,    method: 'GET' },
    { pattern: /@Post\(['"`]?([^'"`)\s]*)['"`]?\)/g,   method: 'POST' },
    { pattern: /@Put\(['"`]?([^'"`)\s]*)['"`]?\)/g,    method: 'PUT' },
    { pattern: /@Patch\(['"`]?([^'"`)\s]*)['"`]?\)/g,  method: 'PATCH' },
    { pattern: /@Delete\(['"`]?([^'"`)\s]*)['"`]?\)/g, method: 'DELETE' },
  ];

  for (const { pattern, method } of methodDecorators) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const routePath = match[1] || '';
      const fullPath = normalizePath([apiPrefix, ctrlPrefix, routePath]);

      // Tìm handler name và request body hint sau decorator này
      const afterDecorator = content.slice(match.index);
      const handlerMatch = afterDecorator.match(/(?:async\s+)?(\w+)\s*\(/);
      const handler = handlerMatch ? handlerMatch[1] : 'unknown';

      // DTO từ @Body() param
      const bodyMatch = afterDecorator.match(/@Body\(\)\s+\w+:\s+(\w+)/);
      const returnMatch = afterDecorator.match(/\):\s*(?:Promise<)?(\w+)/);

      // Auth tại method level
      const methodBlock = afterDecorator.slice(0, afterDecorator.indexOf('\n  }') + 4);
      const methodHasAuth = ctrlHasAuth || /@UseGuards|@Roles|@Auth\b/.test(methodBlock);

      routes.push({
        method,
        path: fullPath,
        handler: `${path.basename(filePath, '.ts').replace('.controller', '')}.${handler}`,
        file: relFile,
        params: extractParams(fullPath),
        requiresAuth: methodHasAuth,
        requestBodyHint: bodyMatch?.[1],
        responseHint: returnMatch?.[1],
      });
    }
  }

  return routes;
}

// ─── Express / Fastify / Koa ──────────────────────────────────────────────────

async function scanNodeRoutes(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const patterns = [
    '**/routes/**/*.{ts,js}',
    '**/api/**/*.{ts,js}',
    '**/router/**/*.{ts,js}',
    '**/controllers/**/*.{ts,js}',
    'src/routes.{ts,js}',
    'src/router.{ts,js}',
  ];

  const files = await fg(patterns, {
    cwd: projectPath,
    ignore: ['node_modules/**', 'dist/**', '**/*.spec.*', '**/*.test.*'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    routes.push(...parseNodeRouteFile(file, projectPath, apiPrefix));
  }
  return routes;
}

function parseNodeRouteFile(filePath: string, projectPath: string, apiPrefix: string): ApiRoute[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: ApiRoute[] = [];
  const relFile = path.relative(projectPath, filePath);

  // router.get('/path', ...) | app.get('/path', ...) | fastify.get('/path', ...)
  const pattern = /(?:router|app|fastify|server|route)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const fullPath = normalizePath([apiPrefix, routePath]);

    // Tên handler từ argument cuối
    const afterRoute = content.slice(match.index + match[0].length);
    const handlerMatch = afterRoute.match(/,\s*(?:async\s+)?(?:\w+\s*,\s*)*(?:async\s+)?(\w+)\s*[,)]/);

    routes.push({
      method,
      path: fullPath,
      handler: handlerMatch?.[1] || path.basename(filePath, path.extname(filePath)),
      file: relFile,
      params: extractParams(fullPath),
      requiresAuth: /auth|jwt|token|protect|guard/i.test(content.slice(match.index - 100, match.index)),
    });
  }

  return routes;
}

// ─── Laravel ──────────────────────────────────────────────────────────────────

async function scanLaravel(projectPath: string): Promise<ApiRoute[]> {
  const apiRoutesPath = path.join(projectPath, 'routes', 'api.php');
  if (!fs.existsSync(apiRoutesPath)) return [];

  const content = fs.readFileSync(apiRoutesPath, 'utf-8');
  const routes: ApiRoute[] = [];
  let currentAuth = false;

  const lines = content.split('\n');
  for (const line of lines) {
    // Middleware group auth detection
    if (/middleware\s*\(\s*['"]auth/.test(line) || /->middleware\s*\(\s*['"]auth/.test(line)) currentAuth = true;
    if (line.includes('});') || line.includes('});')) currentAuth = false;

    // Route::get|post|put|patch|delete('path', ...)
    const routeMatch = line.match(/Route::(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]\s*,\s*\[([^\]]+)\]/i);
    if (routeMatch) {
      const method = routeMatch[1].toUpperCase();
      const routePath = '/api/' + routeMatch[2].replace(/^\//, '');
      const handlerParts = routeMatch[3].match(/['"](\w+)['"]/g) || [];
      const handler = handlerParts.map(h => h.replace(/'/g, '').replace(/"/g, '')).join('.');

      routes.push({
        method, path: routePath, handler,
        file: 'routes/api.php',
        params: extractParams(routePath),
        requiresAuth: currentAuth,
      });
      continue;
    }

    // Route::apiResource('resource', Controller::class)
    const resourceMatch = line.match(/Route::apiResource\s*\(\s*['"]([^'"]+)['"]\s*,\s*(\w+)::class\)/i);
    if (resourceMatch) {
      const resource = resourceMatch[1];
      const ctrl = resourceMatch[2];
      const base = '/api/' + resource.replace(/^\//, '');

      for (const [method, suffix, action] of [
        ['GET',    '',             'index'],
        ['POST',   '',             'store'],
        ['GET',    '/{id}',        'show'],
        ['PUT',    '/{id}',        'update'],
        ['DELETE', '/{id}',        'destroy'],
      ] as const) {
        routes.push({
          method, path: base + suffix,
          handler: `${ctrl}.${action}`,
          file: 'routes/api.php',
          params: extractParams(base + suffix),
          requiresAuth: currentAuth,
        });
      }
    }
  }

  return routes;
}

// ─── Rails ────────────────────────────────────────────────────────────────────

async function scanRails(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const routesPath = path.join(projectPath, 'config', 'routes.rb');
  if (!fs.existsSync(routesPath)) return [];

  const content = fs.readFileSync(routesPath, 'utf-8');
  const routes: ApiRoute[] = [];
  const prefixStack: string[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // namespace :api / namespace :v1
    const nsMatch = trimmed.match(/namespace\s+:(\w+)/);
    if (nsMatch) { prefixStack.push(nsMatch[1]); continue; }
    if (trimmed === 'end') { prefixStack.pop(); continue; }

    const currentPrefix = '/' + prefixStack.join('/');

    // resources :users → REST routes
    const resourcesMatch = trimmed.match(/resources?\s+:(\w+)/);
    if (resourcesMatch) {
      const resource = resourcesMatch[1];
      const base = normalizePath([currentPrefix, resource]);
      for (const [method, suffix] of [
        ['GET', ''], ['POST', ''], ['GET', '/:id'],
        ['PUT', '/:id'], ['PATCH', '/:id'], ['DELETE', '/:id'],
      ] as const) {
        routes.push({ method, path: base + suffix, handler: `${resource}#${methodToRailsAction(method, suffix)}`, file: 'config/routes.rb', params: extractParams(base + suffix), requiresAuth: false });
      }
      continue;
    }

    // get '/path', to: 'controller#action'
    const verbMatch = trimmed.match(/^(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/i);
    if (verbMatch) {
      const method = verbMatch[1].toUpperCase();
      const routePath = normalizePath([currentPrefix, verbMatch[2]]);
      const toMatch = trimmed.match(/to:\s*['"]([^'"]+)['"]/);
      routes.push({ method, path: routePath, handler: toMatch?.[1] || 'unknown', file: 'config/routes.rb', params: extractParams(routePath), requiresAuth: false });
    }
  }

  return routes;
}

function methodToRailsAction(method: string, suffix: string): string {
  if (method === 'GET'    && !suffix) return 'index';
  if (method === 'POST'   && !suffix) return 'create';
  if (method === 'GET'    && suffix)  return 'show';
  if (method === 'PUT'    || method === 'PATCH') return 'update';
  if (method === 'DELETE') return 'destroy';
  return 'unknown';
}

// ─── Spring Boot ──────────────────────────────────────────────────────────────

async function scanSpring(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const files = await fg('**/*Controller.java', {
    cwd: projectPath,
    ignore: ['**/test/**', '**/target/**', '**/build/**'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    routes.push(...parseSpringController(file, projectPath, apiPrefix));
  }
  return routes;
}

function parseSpringController(filePath: string, projectPath: string, apiPrefix: string): ApiRoute[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: ApiRoute[] = [];
  const relFile = path.relative(projectPath, filePath);

  // Class-level @RequestMapping
  const classMapping = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
  const classPrefix = classMapping ? classMapping[1] : '';

  const ctrlHasAuth = /@PreAuthorize|@Secured|@RolesAllowed/.test(content.slice(0, 500));

  const mappings = [
    { pattern: /@GetMapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["']|\{["']([^"']*)["']\})?/g, method: 'GET' },
    { pattern: /@PostMapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["']|\{["']([^"']*)["']\})?/g, method: 'POST' },
    { pattern: /@PutMapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["']|\{["']([^"']*)["']\})?/g, method: 'PUT' },
    { pattern: /@PatchMapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["']|\{["']([^"']*)["']\})?/g, method: 'PATCH' },
    { pattern: /@DeleteMapping\s*\(\s*(?:value\s*=\s*)?(?:["']([^"']*)["']|\{["']([^"']*)["']\})?/g, method: 'DELETE' },
  ];

  for (const { pattern, method } of mappings) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const subPath = match[1] || match[2] || '';
      const fullPath = normalizePath([apiPrefix, classPrefix, subPath]);

      const afterDecor = content.slice(match.index);
      const methodMatch = afterDecor.match(/(?:public|private|protected)\s+\S+\s+(\w+)\s*\(/);
      const bodyMatch   = afterDecor.match(/@RequestBody\s+\w+\s+(\w+)/);
      const methodHasAuth = ctrlHasAuth || /@PreAuthorize|@Secured/.test(afterDecor.slice(0, 200));

      routes.push({
        method, path: fullPath,
        handler: `${path.basename(filePath, '.java')}.${methodMatch?.[1] || 'unknown'}`,
        file: relFile,
        params: extractParams(fullPath),
        requiresAuth: methodHasAuth,
        requestBodyHint: bodyMatch?.[1],
      });
    }
  }

  return routes;
}

// ─── FastAPI ──────────────────────────────────────────────────────────────────

async function scanFastAPI(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const files = await fg('**/*.py', {
    cwd: projectPath,
    ignore: ['**/site-packages/**', '**/__pycache__/**', '**/migrations/**', '**/tests/**'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (!/@(?:app|router|api)\.(get|post|put|patch|delete)\s*\(/.test(content)) continue;
    routes.push(...parseFastAPIFile(file, projectPath, apiPrefix, content));
  }
  return routes;
}

function parseFastAPIFile(filePath: string, projectPath: string, apiPrefix: string, content: string): ApiRoute[] {
  const routes: ApiRoute[] = [];
  const relFile = path.relative(projectPath, filePath);

  // Detect router prefix: router = APIRouter(prefix="/auth")
  const routerPrefixMatch = content.match(/APIRouter\s*\([^)]*prefix\s*=\s*["']([^"']+)["']/);
  const routerPrefix = routerPrefixMatch ? routerPrefixMatch[1] : '';

  const pattern = /@(?:app|router|api)\.(get|post|put|patch|delete)\s*\(\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content)) !== null) {
    const method = match[1].toUpperCase();
    const routePath = match[2];
    const fullPath = normalizePath([apiPrefix, routerPrefix, routePath]);

    const afterDecor = content.slice(match.index + match[0].length);
    const fnMatch = afterDecor.match(/\n(?:async\s+)?def\s+(\w+)\s*\(/);

    // response_model hint
    const responseMatch = content.slice(match.index, match.index + 200).match(/response_model\s*=\s*(\w+)/);

    routes.push({
      method, path: fullPath,
      handler: fnMatch?.[1] || 'unknown',
      file: relFile,
      params: extractParams(fullPath),
      requiresAuth: /Depends\(.*(?:auth|token|current_user)/i.test(afterDecor.slice(0, 200)),
      responseHint: responseMatch?.[1],
    });
  }

  return routes;
}

// ─── Django ───────────────────────────────────────────────────────────────────

async function scanDjango(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const files = await fg('**/urls.py', {
    cwd: projectPath,
    ignore: ['**/site-packages/**', '**/__pycache__/**'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    routes.push(...parseDjangoUrls(file, projectPath, apiPrefix));
  }
  return routes;
}

function parseDjangoUrls(filePath: string, projectPath: string, apiPrefix: string): ApiRoute[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const routes: ApiRoute[] = [];
  const relFile = path.relative(projectPath, filePath);

  // path('users/', UserListView.as_view(), name='user-list')
  const pathPattern = /path\s*\(\s*r?['"]([^'"]+)['"]\s*,\s*(\w+)/g;
  let match: RegExpExecArray | null;

  while ((match = pathPattern.exec(content)) !== null) {
    const routePath = normalizePath([apiPrefix, match[1]]);
    const viewName = match[2];

    // ViewSet → multiple methods, View → GET+POST or GET
    const isViewSet = viewName.endsWith('ViewSet') || viewName.endsWith('ModelViewSet');
    if (isViewSet) {
      for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
        routes.push({ method, path: routePath, handler: `${viewName}`, file: relFile, params: extractParams(routePath), requiresAuth: false });
      }
    } else {
      routes.push({ method: 'GET', path: routePath, handler: viewName, file: relFile, params: extractParams(routePath), requiresAuth: false });
    }
  }

  return routes;
}

// ─── Flask ────────────────────────────────────────────────────────────────────

async function scanFlask(projectPath: string, apiPrefix: string): Promise<ApiRoute[]> {
  const files = await fg('**/*.py', {
    cwd: projectPath,
    ignore: ['**/site-packages/**', '**/__pycache__/**', '**/tests/**'],
    absolute: true,
  });

  const routes: ApiRoute[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    if (!/@(?:app|bp|blueprint|api)\s*\.route\s*\(/.test(content)) continue;

    const pattern = /@(?:app|bp|\w+)\.route\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const routePath = normalizePath([apiPrefix, match[1]]);
      const methods = match[2]
        ? match[2].split(',').map(m => m.trim().replace(/['"]/g, ''))
        : ['GET'];

      const afterDecor = content.slice(match.index + match[0].length);
      const fnMatch = afterDecor.match(/\ndef\s+(\w+)\s*\(/);

      for (const method of methods) {
        routes.push({
          method, path: routePath,
          handler: fnMatch?.[1] || 'unknown',
          file: path.relative(projectPath, file),
          params: extractParams(routePath),
          requiresAuth: /@login_required|@token_required|@jwt_required/.test(content.slice(match.index - 200, match.index)),
        });
      }
    }
  }
  return routes;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizePath(parts: string[]): string {
  return '/' + parts
    .map(p => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
}

function extractParams(routePath: string): string[] {
  const params: string[] = [];
  // :id, {id}, <int:id>
  for (const m of routePath.matchAll(/:(\w+)|\{(\w+)\}|<(?:\w+:)?(\w+)>/g)) {
    params.push(m[1] || m[2] || m[3]);
  }
  return params;
}
