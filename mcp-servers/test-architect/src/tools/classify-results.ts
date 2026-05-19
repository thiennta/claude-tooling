import type { TestFailure, ClassifiedFailure, FailureCategory } from '../types.js';

const RULES: Array<{ pattern: RegExp; category: FailureCategory; suggestion: string }> = [
  {
    pattern: /locator.*not found|getByTestId|getByRole|getByLabel|getByPlaceholder|Timeout.*waiting for/i,
    category: 'missing_testid',
    suggestion: 'Element not found — add data-testid to the component or verify selector is correct',
  },
  {
    pattern: /net::ERR_|ECONNREFUSED|Failed to fetch|network request/i,
    category: 'needs_mock',
    suggestion: 'Network error — use page.route() to mock this API call',
  },
  {
    pattern: /Timeout.*\d+ms exceeded|page\.waitFor|waiting for.*visible/i,
    category: 'timeout',
    suggestion: 'Timeout — add waitForSelector/waitForResponse or increase timeout for slow animations',
  },
  {
    pattern: /expect.*toBe|expect.*toEqual|expect.*toContain|expect.*toHaveText|Expected.*Received/i,
    category: 'real_bug',
    suggestion: 'Assertion failed — this is likely a real bug in the application logic',
  },
];

export async function classifyResults(failures: TestFailure[]): Promise<ClassifiedFailure[]> {
  return failures.map(failure => {
    for (const rule of RULES) {
      if (rule.pattern.test(failure.error)) {
        return { test: failure.test, error: failure.error, category: rule.category, suggestion: rule.suggestion };
      }
    }
    return { test: failure.test, error: failure.error, category: 'unknown' as FailureCategory, suggestion: 'Check the full error message and stack trace for more details' };
  });
}
