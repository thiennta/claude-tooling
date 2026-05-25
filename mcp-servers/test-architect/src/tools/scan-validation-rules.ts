import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import type { ValidationRule, SelectorInfo } from '../types.js';

export async function scanValidationRules(
  projectPath: string,
  framework: string,
  moduleFilter?: string
): Promise<ValidationRule[]> {
  const baseFramework = framework.split('+')[0];
  const patterns = baseFramework === 'laravel'
    ? ['resources/views/**/*.blade.php', 'app/Http/Requests/**/*.php']
    : ['**/*.vue', '**/*.tsx', '**/*.ts', '**/*.js'];

  const files = await fg(patterns, {
    cwd: projectPath,
    absolute: true,
    ignore: ['**/node_modules/**', '**/dist/**', '**/*.spec.*', '**/*.test.*'],
  });

  const allRules: ValidationRule[] = [];

  for (const file of files) {
    const relPath = path.relative(projectPath, file);
    if (moduleFilter && !relPath.toLowerCase().includes(moduleFilter.toLowerCase())) continue;
    const content = fs.readFileSync(file, 'utf-8');
    allRules.push(...extractRules(content, relPath));
  }

  const seen = new Set<string>();
  return allRules.filter(r => {
    const key = `${r.component}::${r.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractRules(content: string, filePath: string): ValidationRule[] {
  const rules: ValidationRule[] = [];

  for (const m of content.matchAll(/(\w+):\s*yup\.\w+\(\)([^,;}]+)/g)) {
    const { rules: fieldRules, errorMessages } = parseYupChain(m[2]);
    if (fieldRules.length > 0) {
      rules.push({ field: m[1], rules: fieldRules, errorMessages, selector: findSelectorForField(content, m[1], filePath), component: filePath, canTest: true });
    }
  }

  for (const m of content.matchAll(/(\w+):\s*z\.\w+\(\)([^,;}]+)/g)) {
    const { rules: fieldRules, errorMessages } = parseZodChain(m[2]);
    if (fieldRules.length > 0) {
      rules.push({ field: m[1], rules: fieldRules, errorMessages, selector: findSelectorForField(content, m[1], filePath), component: filePath, canTest: true });
    }
  }

  for (const m of content.matchAll(/name=["'](\w+)["'][^>]*rules=["']([^"']+)["']/g)) {
    rules.push({ field: m[1], rules: m[2].split('|'), errorMessages: {}, selector: findSelectorForField(content, m[1], filePath), component: filePath, canTest: true });
  }

  for (const m of content.matchAll(/<input[^>]+name=["'](\w+)["'][^>]*>/g)) {
    const tag = m[0];
    const field = m[1];
    const htmlRules: string[] = [];
    if (/\brequired\b/.test(tag))           htmlRules.push('required');
    const typeMatch = tag.match(/type=["'](\w+)["']/);
    if (typeMatch && typeMatch[1] !== 'text') htmlRules.push(`type:${typeMatch[1]}`);
    const minMatch = tag.match(/minlength=["'](\d+)["']/);
    if (minMatch) htmlRules.push(`min:${minMatch[1]}`);
    const maxMatch = tag.match(/maxlength=["'](\d+)["']/);
    if (maxMatch) htmlRules.push(`max:${maxMatch[1]}`);
    if (htmlRules.length > 0) {
      rules.push({ field, rules: htmlRules, errorMessages: {}, selector: findSelectorForField(content, field, filePath), component: filePath, canTest: true });
    }
  }

  return rules;
}

function extractMessage(chain: string, methodName: string): string | undefined {
  const re = new RegExp(`\\.${methodName}\\([^)]*['"\`]([^'"\`]+)['"\`]`);
  return chain.match(re)?.[1];
}

function parseYupChain(chain: string): { rules: string[]; errorMessages: Record<string, string> } {
  const rules: string[] = [];
  const errorMessages: Record<string, string> = {};

  const addRule = (rule: string, msg?: string) => {
    rules.push(rule);
    if (msg) errorMessages[rule] = msg;
  };

  if (chain.includes('.required('))  addRule('required',     extractMessage(chain, 'required'));
  if (chain.includes('.email('))     addRule('format:email',  extractMessage(chain, 'email'));
  if (chain.includes('.url('))       addRule('format:url',    extractMessage(chain, 'url'));
  if (chain.includes('.uuid('))      addRule('format:uuid',   extractMessage(chain, 'uuid'));
  const min = chain.match(/\.min\((\d+)/);
  if (min) addRule(`min:${min[1]}`, extractMessage(chain, 'min'));
  const max = chain.match(/\.max\((\d+)/);
  if (max) addRule(`max:${max[1]}`, extractMessage(chain, 'max'));

  return { rules, errorMessages };
}

function parseZodChain(chain: string): { rules: string[]; errorMessages: Record<string, string> } {
  return parseYupChain(chain);
}

function findSelectorForField(content: string, field: string, filePath: string): SelectorInfo {
  const testidMatch = content.match(new RegExp(`data-testid=["']([^"']*${field}[^"']*)["']`, 'i'));
  if (testidMatch) return { type: 'data-testid', value: testidMatch[1], stability: 'stable', playwrightCode: `page.getByTestId('${testidMatch[1]}')` };

  const labelMatch = content.match(new RegExp(`(?:aria-label|placeholder)=["']([^"']*${field}[^"']*)["']`, 'i'));
  if (labelMatch) return { type: 'aria-label', value: labelMatch[1], stability: 'medium', playwrightCode: `page.getByLabel('${labelMatch[1]}')` };

  return { type: 'missing', value: field, stability: 'missing', playwrightCode: `/* MISSING SELECTOR for "${field}" — add data-testid="${field}" */` };
}
