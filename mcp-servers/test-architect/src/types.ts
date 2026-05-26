export interface FrameworkInfo {
  framework: string;
  version: string;
  language: string;
  uiType: 'spa' | 'ssr' | 'server-rendered' | 'unknown';
  devCommand: string;
  baseURL: string;
  configFile: string;
  hasPlaywright: boolean;
}

export interface SpecFile {
  path: string;
  moduleName: string;
}

export type ScenarioType = 'happy_path' | 'error_case' | 'edge_case' | 'validation' | 'missing' | 'unknown';

export interface Scenario {
  type: ScenarioType;
  description: string;
  expectedText?: string;   // quoted text extracted from spec (e.g. 'メールアドレスは必須です')
  expectedURL?: string;    // URL extracted from redirect/navigate descriptions
}

export interface ParsedSpec {
  feature: string;
  sourceFile: string;
  scenarios: Scenario[];
}

export type SelectorStability = 'stable' | 'medium' | 'fragile' | 'missing';

export interface SelectorInfo {
  type: 'data-testid' | 'aria-label' | 'role' | 'placeholder' | 'text' | 'missing';
  value: string;
  stability: SelectorStability;
  playwrightCode: string;
}

export interface UIElement {
  name: string;
  selector: SelectorInfo;
  component: string;
  elementType: string;
}

export interface CodeFlow {
  name: string;
  entry: string;
  route: string;
  elements: UIElement[];
  apis: string[];
}

export interface ValidationRule {
  field: string;
  rules: string[];
  errorMessages: Record<string, string>;  // rule → error message text from source code
  selector: SelectorInfo;
  component: string;
  canTest: boolean;
}

export interface SpecConflict {
  /** 'conflict' = cùng scenario nhưng expectedText/URL khác nhau; 'duplicate' = hoàn toàn giống nhau */
  type: 'conflict' | 'duplicate';
  /** Description đại diện (từ file đầu tiên) */
  description: string;
  /** Các spec có liên quan (luôn >= 2 phần tử) */
  specs: Array<{
    sourceFile: string;
    feature: string;
    scenario: Scenario;
  }>;
}

export interface GapAnalysisResult {
  matched: Array<{ description: string; hasSelector: boolean }>;
  missing: Array<{ description: string; reason: string }>;
  undocumented: Array<{ route: string; entry: string }>;
}

export interface TestFailure {
  test: string;
  error: string;
  file: string;
  screenshot?: string;  // absolute path to screenshot file captured on failure
}

export interface TestRunResult {
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: TestFailure[];
}

export type FailureCategory = 'missing_testid' | 'needs_mock' | 'real_bug' | 'timeout' | 'unknown';

export interface ClassifiedFailure {
  test: string;
  error: string;
  category: FailureCategory;
  suggestion: string;
}
