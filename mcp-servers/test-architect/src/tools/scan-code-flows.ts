import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { CodeFlow, UIElement, SelectorInfo } from '../types.js';

const FRAMEWORK_PAGE_PATTERNS: Record<string, string[]> = {
  nuxt:    ['pages/**/*.vue', 'layouts/**/*.vue'],
  nextjs:  ['app/**/*.tsx', 'app/**/*.jsx', 'pages/**/*.tsx', 'pages/**/*.jsx'],
  vue:     ['src/views/**/*.vue', 'src/pages/**/*.vue'],
  react:   ['src/pages/**/*.tsx', 'src/views/**/*.tsx'],
  laravel: ['resources/views/**/*.blade.php'],
  angular: ['src/app/**/*.component.html'],
};

export async function scanCodeFlows(
  projectPath: string,
  framework: string,
  moduleFilter?: string
): Promise<CodeFlow[]> {
  const baseFramework = framework.split('+')[0];
  const patterns = FRAMEWORK_PAGE_PATTERNS[baseFramework] || ['**/*.html', 'src/**/*.vue', 'src/**/*.tsx'];

  const files = await fg(patterns, {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.test.*', '**/*.spec.*'],
  });

  const flows: CodeFlow[] = [];

  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    const name    = path.basename(file, path.extname(file));

    if (moduleFilter && !name.toLowerCase().includes(moduleFilter.toLowerCase())) continue;

    const content  = fs.readFileSync(file, 'utf-8');
    const elements = extractElements(content, relPath);
    const apis     = extractApiCalls(content);
    const route    = inferRoute(relPath, baseFramework);

    flows.push({ name, entry: relPath, route, elements, apis });
  }

  return flows;
}

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
        component: filePath,
        elementType: 'element',
      });
    }
  }

  for (const m of content.matchAll(/placeholder=["']([^"']+)["']/g)) {
    if (!elements.find(e => e.selector.value === m[1])) {
      elements.push({
        name: m[1],
        selector: { type: 'placeholder', value: m[1], stability: 'medium', playwrightCode: `page.getByPlaceholder('${m[1]}')` },
        component: filePath,
        elementType: 'input',
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
    .replace(/\\/g, '/')
    .replace(/^pages\//, '/')
    .replace(/^app\//, '/')
    .replace(/^src\/views\//, '/')
    .replace(/^src\/pages\//, '/')
    .replace(/\.(vue|tsx|jsx|html)$/, '')
    .replace(/\/index$/, '/')
    .replace(/\[([^\]]+)\]/g, ':$1');
  if (!route.startsWith('/')) route = '/' + route;
  return route;
}

function inferElementType(content: string, testId: string): string {
  const ctx = content.match(new RegExp(`[^\\n]*data-testid=["']${testId}["'][^\\n]*`))?.[0]?.toLowerCase() ?? '';
  if (ctx.includes('<button') || ctx.includes('v-btn'))          return 'button';
  if (ctx.includes('<input')  || ctx.includes('v-text-field'))   return 'input';
  if (ctx.includes('<select') || ctx.includes('v-select'))       return 'select';
  if (ctx.includes('<a ')     || ctx.includes('router-link'))    return 'link';
  return 'element';
}
