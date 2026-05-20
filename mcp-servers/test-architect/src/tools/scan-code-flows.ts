import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { CodeFlow, UIElement, SelectorInfo } from '../types.js';

interface RouteEntry {
  route: string;
  componentPath: string;
  componentName: string;
}

// ── Main entry ───────────────────────────────────────────────────────────────

export async function scanCodeFlows(
  projectPath: string,
  framework: string,
  moduleFilter?: string
): Promise<CodeFlow[]> {
  const baseFramework = framework.split('+')[0];

  // Router-based detection first; fallback to directory scan
  let candidates = await findRoutesByRouter(projectPath, baseFramework);
  if (candidates.length === 0) {
    candidates = await directoryFallback(projectPath, baseFramework);
  }

  // Apply module filter against name OR route
  if (moduleFilter) {
    const f = moduleFilter.toLowerCase();
    candidates = candidates.filter(r =>
      r.componentName.toLowerCase().includes(f) ||
      r.route.toLowerCase().includes(f)
    );
  }

  const flows: CodeFlow[] = [];
  for (const { route, componentPath, componentName } of candidates) {
    if (!fs.existsSync(componentPath)) continue;
    const relPath = path.relative(projectPath, componentPath);
    const content = fs.readFileSync(componentPath, 'utf-8');
    flows.push({
      name: componentName,
      entry: relPath,
      route,
      elements: extractElements(content, relPath),
      apis: extractApiCalls(content),
    });
  }

  return flows;
}

// ── Router dispatcher ────────────────────────────────────────────────────────

async function findRoutesByRouter(projectPath: string, framework: string): Promise<RouteEntry[]> {
  switch (framework) {
    case 'vue':     return parseVueRouter(projectPath);
    case 'react':   return parseReactRouter(projectPath);
    case 'nextjs':  return parseNextRoutes(projectPath);
    case 'nuxt':    return parseNuxtRoutes(projectPath);
    case 'angular': return parseAngularRouter(projectPath);
    case 'laravel': return parseLaravelInertia(projectPath);
    default:        return [];
  }
}

// ── Vue Router ───────────────────────────────────────────────────────────────

function parseVueRouter(projectPath: string): RouteEntry[] {
  const candidates = [
    'src/router/index.ts', 'src/router/index.js',
    'src/router.ts',       'src/router.js',
    'router/index.ts',     'router/index.js',
  ];
  for (const c of candidates) {
    const file = path.join(projectPath, c);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    return extractVueRoutes(content, projectPath);
  }
  return [];
}

function extractVueRoutes(content: string, projectPath: string): RouteEntry[] {
  const routes: RouteEntry[] = [];
  const importMap = buildImportMap(content, projectPath);

  // Static: { path: '/auth', component: Auth }
  for (const m of content.matchAll(/\{\s*path:\s*['"`]([^'"`]+)['"`][^}]*?component:\s*(\w+)/gs)) {
    const resolved = importMap[m[2]];
    if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: m[2] });
  }

  // Lazy: component: () => import('@/components/Auth.vue')
  for (const m of content.matchAll(/path:\s*['"`]([^'"`]+)['"`'][^}]*?component:\s*\(\)\s*=>\s*import\(['"`]([^'"`]+)['"`]\)/gs)) {
    const resolved = resolveImportPath(m[2], projectPath);
    if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: path.basename(resolved, path.extname(resolved)) });
  }

  return routes;
}

// ── React Router ─────────────────────────────────────────────────────────────

function parseReactRouter(projectPath: string): RouteEntry[] {
  const candidates = [
    'src/App.tsx', 'src/App.jsx',
    'src/routes.tsx', 'src/routes.jsx', 'src/routes.ts',
    'src/router.tsx', 'src/router.jsx',
    'src/routing/index.tsx', 'src/routing/index.jsx',
  ];
  const routes: RouteEntry[] = [];
  for (const c of candidates) {
    const file = path.join(projectPath, c);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const importMap = buildImportMap(content, projectPath);

    // JSX: path="..." element={<Component />}
    for (const m of content.matchAll(/path=["']([^"']+)["'][^>]*?element=\{<(\w+)/g)) {
      const resolved = importMap[m[2]];
      if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: m[2] });
    }
    // Object: { path: '...', element: <Component /> }
    for (const m of content.matchAll(/path:\s*['"`]([^'"`]+)['"`][^}]*?element:\s*<(\w+)/gs)) {
      const resolved = importMap[m[2]];
      if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: m[2] });
    }
    if (routes.length > 0) break;
  }
  return routes;
}

// ── Next.js ──────────────────────────────────────────────────────────────────

async function parseNextRoutes(projectPath: string): Promise<RouteEntry[]> {
  const routes: RouteEntry[] = [];

  // App Router: app/**/page.{tsx,jsx}
  const appDir = path.join(projectPath, 'app');
  if (fs.existsSync(appDir)) {
    const pages = await fg('**/page.{tsx,jsx,ts,js}', { cwd: appDir, absolute: true });
    for (const p of pages) {
      const rel = path.relative(appDir, p).replace(/\\/g, '/');
      const route = '/' + path.dirname(rel).replace(/^\./, '');
      routes.push({ route: route || '/', componentPath: p, componentName: path.basename(path.dirname(p)) || 'index' });
    }
  }

  // Pages Router: pages/**/*.{tsx,jsx}
  const pagesDir = path.join(projectPath, 'pages');
  if (fs.existsSync(pagesDir)) {
    const pages = await fg('**/*.{tsx,jsx,ts,js}', {
      cwd: pagesDir, absolute: true,
      ignore: ['**/_app.*', '**/_document.*', '**/api/**'],
    });
    for (const p of pages) {
      const rel = path.relative(pagesDir, p).replace(/\\/g, '/');
      let route = '/' + rel.replace(/\.(tsx|jsx|ts|js)$/, '').replace(/\/index$/, '');
      if (route === '/') route = '/';
      routes.push({ route, componentPath: p, componentName: path.basename(p, path.extname(p)) });
    }
  }

  return routes;
}

// ── Nuxt ─────────────────────────────────────────────────────────────────────

async function parseNuxtRoutes(projectPath: string): Promise<RouteEntry[]> {
  const pagesDir = path.join(projectPath, 'pages');
  if (!fs.existsSync(pagesDir)) return [];
  const pages = await fg('**/*.vue', { cwd: pagesDir, absolute: true });
  return pages.map(p => {
    const rel = path.relative(pagesDir, p).replace(/\\/g, '/');
    let route = '/' + rel.replace(/\.vue$/, '').replace(/\/index$/, '').replace(/\[([^\]]+)\]/g, ':$1');
    if (route === '/') route = '/';
    return { route, componentPath: p, componentName: path.basename(p, '.vue') };
  });
}

// ── Angular ───────────────────────────────────────────────────────────────────

function parseAngularRouter(projectPath: string): RouteEntry[] {
  const candidates = [
    'src/app/app-routing.module.ts',
    'src/app/app.routes.ts',
    'src/app/app-routing.module.js',
  ];
  const routes: RouteEntry[] = [];
  for (const c of candidates) {
    const file = path.join(projectPath, c);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const importMap = buildImportMap(content, projectPath);

    // { path: 'auth', component: AuthComponent }
    for (const m of content.matchAll(/path:\s*['"`]([^'"`]*)['"`][^}]*?component:\s*(\w+)/gs)) {
      const resolved = importMap[m[2]];
      if (resolved) routes.push({ route: '/' + m[1], componentPath: resolved, componentName: m[2] });
    }
    if (routes.length > 0) break;
  }
  return routes;
}

// ── Laravel + Inertia ─────────────────────────────────────────────────────────

function parseLaravelInertia(projectPath: string): RouteEntry[] {
  const routesFile = path.join(projectPath, 'routes', 'web.php');
  if (!fs.existsSync(routesFile)) return [];
  const content = fs.readFileSync(routesFile, 'utf-8');
  const routes: RouteEntry[] = [];

  // Inertia::render('Component')
  for (const m of content.matchAll(/Route::(?:get|post)\(['"]([^'"]+)['"]\s*,.*?Inertia::render\(['"]([^'"]+)['"]/gs)) {
    const resolved = resolveInertiaComponent(m[2], projectPath);
    if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: m[2] });
  }
  // Route::inertia('/path', 'Component')
  for (const m of content.matchAll(/Route::inertia\(['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/g)) {
    const resolved = resolveInertiaComponent(m[2], projectPath);
    if (resolved) routes.push({ route: m[1], componentPath: resolved, componentName: m[2] });
  }
  return routes;
}

function resolveInertiaComponent(name: string, projectPath: string): string {
  const dirs = ['resources/js/Pages', 'resources/js/pages', 'resources/ts/Pages'];
  for (const dir of dirs) {
    for (const ext of ['.vue', '.tsx', '.jsx']) {
      const p = path.join(projectPath, dir, name + ext);
      if (fs.existsSync(p)) return p;
    }
  }
  return '';
}

// ── Fallback: directory scan ──────────────────────────────────────────────────

const FALLBACK_PATTERNS: Record<string, string[]> = {
  vue:     ['src/**/*.vue'],
  react:   ['src/**/*.tsx', 'src/**/*.jsx'],
  nuxt:    ['pages/**/*.vue'],
  nextjs:  ['app/**/*.tsx', 'pages/**/*.tsx'],
  laravel: ['resources/views/**/*.blade.php'],
  angular: ['src/app/**/*.component.html'],
};

async function directoryFallback(projectPath: string, framework: string): Promise<RouteEntry[]> {
  const patterns = FALLBACK_PATTERNS[framework] || ['src/**/*.vue', 'src/**/*.tsx'];
  const files = await fg(patterns, {
    cwd: projectPath, absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
  });
  return files.map(file => ({
    route: inferRoute(path.relative(projectPath, file).replace(/\\/g, '/'), framework),
    componentPath: file,
    componentName: path.basename(file, path.extname(file)),
  }));
}

// ── Import resolver ───────────────────────────────────────────────────────────

function buildImportMap(content: string, projectPath: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of content.matchAll(/import\s+(\w+)\s+from\s+['"`]([^'"`]+)['"`]/g)) {
    const resolved = resolveImportPath(m[2], projectPath);
    if (resolved) map[m[1]] = resolved;
  }
  return map;
}

function resolveImportPath(importPath: string, projectPath: string): string {
  let resolved = importPath
    .replace(/^@\//, path.join(projectPath, 'src') + path.sep)
    .replace(/^~\//, path.join(projectPath, 'src') + path.sep);

  if (!path.isAbsolute(resolved)) resolved = path.join(projectPath, resolved);

  if (path.extname(resolved)) return fs.existsSync(resolved) ? resolved : '';

  for (const ext of ['.vue', '.tsx', '.jsx', '.ts', '.js']) {
    if (fs.existsSync(resolved + ext)) return resolved + ext;
    const idx = path.join(resolved, 'index' + ext);
    if (fs.existsSync(idx)) return idx;
  }
  return '';
}

// ── Element & API extractors ──────────────────────────────────────────────────

function extractElements(content: string, filePath: string): UIElement[] {
  const elements: UIElement[] = [];

  for (const m of content.matchAll(/data-testid=["']([^"']+)["']/g)) {
    elements.push({
      name: m[1],
      selector: { type: 'data-testid', value: m[1], stability: 'stable', playwrightCode: `page.getByTestId('${m[1]}')` },
      component: filePath,
      elementType: inferElementType(content, m[1]),
    });
  }
  for (const m of content.matchAll(/aria-label=["']([^"']+)["']/g)) {
    if (!elements.find(e => e.name === m[1])) {
      elements.push({
        name: m[1],
        selector: { type: 'aria-label', value: m[1], stability: 'medium', playwrightCode: `page.getByLabel('${m[1]}')` },
        component: filePath, elementType: 'element',
      });
    }
  }
  for (const m of content.matchAll(/placeholder=["']([^"']+)["']/g)) {
    if (!elements.find(e => e.selector.value === m[1])) {
      elements.push({
        name: m[1],
        selector: { type: 'placeholder', value: m[1], stability: 'medium', playwrightCode: `page.getByPlaceholder('${m[1]}')` },
        component: filePath, elementType: 'input',
      });
    }
  }
  return elements;
}

function extractApiCalls(content: string): string[] {
  const apis: string[] = [];
  const patterns = [
    /\$fetch\(['"`]([^'"`]+)['"`]/g,
    /useFetch\(['"`]([^'"`]+)['"`]/g,
    /fetch\(['"`]([^'"`]+)['"`]/g,
    /axios\.\w+\(['"`]([^'"`]+)['"`]/g,
    /api\.(?:get|post|put|delete)\(['"`]([^'"`]+)['"`]/g,
  ];
  for (const pattern of patterns) {
    for (const m of content.matchAll(pattern)) {
      if (!apis.includes(m[1])) apis.push(m[1]);
    }
  }
  return apis;
}

function inferRoute(relPath: string, framework: string): string {
  let route = relPath
    .replace(/^pages\//, '/').replace(/^app\//, '/').replace(/^src\/views\//, '/').replace(/^src\/pages\//, '/')
    .replace(/\.(vue|tsx|jsx|html)$/, '').replace(/\/index$/, '/').replace(/\[([^\]]+)\]/g, ':$1');
  if (!route.startsWith('/')) route = '/' + route;
  return route;
}

function inferElementType(content: string, testId: string): string {
  const ctx = content.match(new RegExp(`[^\\n]*data-testid=["']${testId}["'][^\\n]*`))?.[0]?.toLowerCase() ?? '';
  if (ctx.includes('<button') || ctx.includes('v-btn'))        return 'button';
  if (ctx.includes('<input')  || ctx.includes('v-text-field')) return 'input';
  if (ctx.includes('<select') || ctx.includes('v-select'))     return 'select';
  if (ctx.includes('<a ')     || ctx.includes('router-link'))  return 'link';
  return 'element';
}
