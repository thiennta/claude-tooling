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

// ─── Backend / API types (dùng cho /test-api và /test-db sau này) ─────────────

export interface BackendFrameworkInfo {
  /** nestjs | express | fastify | laravel | rails | spring | fastapi | django | flask | unknown */
  framework: string;
  /** typescript | javascript | php | ruby | java | python | unknown */
  language: string;
  /** npm run start:dev | php artisan serve | uvicorn main:app --reload | ... */
  devCommand: string;
  /** http://localhost:3000 */
  baseURL: string;
  /** /api | /api/v1 | '' (rỗng = không có prefix) */
  apiPrefix: string;
  /** prisma | typeorm | sequelize | mongoose | eloquent | activerecord | sqlalchemy | unknown | none */
  dbClient: string;
  /** postgresql | mysql | sqlite | mongodb | unknown */
  dbType: string;
  /** file bằng chứng detect: nest-cli.json | artisan | Gemfile | pom.xml | ... */
  configFile: string;
  hasOpenApiSpec: boolean;
  openApiSpecPath?: string;
  /** Mức độ chắc chắn của detection */
  confidence: 'high' | 'medium' | 'low';
  /** Danh sách bằng chứng để hiển thị tại CHECKPOINT 1 */
  detectionNotes: string[];
}

export interface ApiRoute {
  /** GET | POST | PUT | DELETE | PATCH */
  method: string;
  /** /api/auth/login */
  path: string;
  /** AuthController.login | loginHandler */
  handler: string;
  /** relative path: src/auth/auth.controller.ts */
  file: string;
  /** ['id', 'userId'] */
  params: string[];
  requiresAuth: boolean;
  /** DTO/schema name hint: LoginDto, CreateOrderRequest */
  requestBodyHint?: string;
  /** return type hint: TokenResponse, User */
  responseHint?: string;
}

export interface ApiFlow {
  /** service method: createOrder | OrderService.create */
  name: string;
  /** relative file path */
  entry: string;
  /** associated route nếu trace được: POST /api/orders */
  route?: string;
  /** tất cả operations (DB + service + external) */
  operations: string[];
  /** DB-only operations — dùng cho /test-db sau này */
  dbOperations: string[];
  /** inter-service calls */
  serviceOperations: string[];
  /** route handlers gọi service method này */
  calledBy: string[];
}
