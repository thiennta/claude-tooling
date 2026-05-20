import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { TestRunResult } from '../types.js';

export async function runTests(projectPath: string, filter?: string): Promise<TestRunResult> {
  const outputFile = path.join(projectPath, '.test-architect-results.json');

  try {
    const filterFlag = filter ? `--grep "${filter}"` : '';
    execSync(`npx playwright test ${filterFlag} --reporter=json,html`.trim(), {
      cwd: projectPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile },
      timeout: 300000,
    });
  } catch {
    // Playwright exits non-zero when tests fail — expected
  }

  if (fs.existsSync(outputFile)) {
    try {
      const raw = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      fs.unlinkSync(outputFile);
      return parsePlaywrightJson(raw);
    } catch { /* fall through */ }
  }

  try {
    const stdout = execSync(
      `npx playwright test ${filter ? `--grep "${filter}"` : ''} --reporter=json,html`,
      { cwd: projectPath, timeout: 300000 }
    ).toString();
    return parsePlaywrightJson(JSON.parse(stdout));
  } catch {
    return { passed: 0, failed: 0, skipped: 0, duration: 0, failures: [] };
  }
}

function parsePlaywrightJson(raw: any): TestRunResult {
  const failures: TestRunResult['failures'] = [];
  const stats = raw.stats || {};
  collectFailures(raw.suites || [], failures);
  return {
    passed:   stats.expected   || 0,
    failed:   stats.unexpected || 0,
    skipped:  stats.skipped    || 0,
    duration: stats.duration   || 0,
    failures,
  };
}

function collectFailures(suites: any[], failures: TestRunResult['failures']): void {
  for (const suite of suites) {
    if (suite.suites) collectFailures(suite.suites, failures);
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        for (const result of test.results || []) {
          if (result.status === 'failed' || result.status === 'timedOut') {
            failures.push({
              test:  spec.title,
              error: result.error?.message || result.error?.value || 'Unknown error',
              file:  suite.file || '',
            });
          }
        }
      }
    }
  }
}
