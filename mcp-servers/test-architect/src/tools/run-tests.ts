import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { TestRunResult, TestCase } from '../types.js';

export async function runTests(projectPath: string, filter?: string): Promise<TestRunResult> {
  const outputFile = path.join(projectPath, '.test-architect-results.json');
  const filterFlag = filter ? `--grep "${filter}"` : '';

  try {
    execSync(
      `npx playwright test ${filterFlag} --reporter=json`.trim(),
      {
        cwd: projectPath,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: outputFile },
        timeout: 300000,
      }
    );
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
      `npx playwright test ${filterFlag} --reporter=json`.trim(),
      { cwd: projectPath, timeout: 300000 }
    ).toString();
    return parsePlaywrightJson(JSON.parse(stdout));
  } catch {
    return { passed: 0, failed: 0, skipped: 0, duration: 0, failures: [], allTests: [] };
  }
}

function parsePlaywrightJson(raw: any): TestRunResult {
  const failures: TestRunResult['failures'] = [];
  const allTests: TestCase[] = [];
  const stats = raw.stats || {};

  collectTests(raw.suites || [], failures, allTests);

  return {
    passed:   stats.expected   || 0,
    failed:   stats.unexpected || 0,
    skipped:  stats.skipped    || 0,
    duration: stats.duration   || 0,
    failures,
    allTests,
  };
}

function collectTests(suites: any[], failures: TestRunResult['failures'], allTests: TestCase[]): void {
  for (const suite of suites) {
    if (suite.suites) collectTests(suite.suites, failures, allTests);

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        const result = (test.results || [])[0];
        if (!result) continue;

        const isFailed   = result.status === 'failed' || result.status === 'timedOut';
        const isSkipped  = result.status === 'skipped';
        const screenshot = (result.attachments || []).find(
          (a: any) => a.name === 'screenshot' && a.path
        )?.path;

        const status: TestCase['status'] = isFailed ? 'failed' : isSkipped ? 'skipped' : 'passed';

        allTests.push({
          test:       spec.title,
          file:       suite.file || '',
          status,
          duration:   result.duration || 0,
          screenshot,
          error:      isFailed ? (result.error?.message || result.error?.value || 'Unknown error') : undefined,
        });

        if (isFailed) {
          failures.push({
            test:       spec.title,
            error:      result.error?.message || result.error?.value || 'Unknown error',
            file:       suite.file || '',
            screenshot,
          });
        }
      }
    }
  }
}
