import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { detectUiFramework } from './tools/detect-ui-framework.js';
import { detectBeFramework } from './tools/detect-be-framework.js';
import { scanApiRoutes } from './tools/scan-api-routes.js';
import { scanApiFlows } from './tools/scan-api-flows.js';
import { scanSpecs } from './tools/scan-specs.js';
import { parseMarkdownSpec } from './tools/parse-markdown-spec.js';
import { detectSpecConflicts } from './tools/detect-spec-conflicts.js';
import { scanUiFlows } from './tools/scan-ui-flows.js';
import { scanUiValidation } from './tools/scan-ui-validation.js';
import { gapAnalysis } from './tools/gap-analysis.js';
import { runTests } from './tools/run-tests.js';
import { classifyResults } from './tools/classify-results.js';
import { setupPlaywright } from './tools/setup-playwright.js';
import { generateReport } from './tools/generate-report.js';

const server = new McpServer({
  name: 'test-architect',
  version: '1.0.0',
});

server.tool(
  'detect_ui_framework',
  'Detect the UI/frontend framework (Nuxt, Next.js, Vue, React, Angular...), dev command, and base URL of a project',
  { projectPath: z.string().describe('Absolute path to the frontend project root') },
  async ({ projectPath }) => {
    const result = await detectUiFramework(projectPath);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'scan_specs',
  'Find markdown spec files in a project. Searches docs/specs/, .claude/specs/, specs/, docs/ in order',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    specPath: z.string().optional().describe('Optional specific path to spec file or directory'),
    moduleFilter: z.string().optional().describe('Optional module name to filter by'),
  },
  async ({ projectPath, specPath, moduleFilter }) => {
    const result = await scanSpecs(projectPath, specPath, moduleFilter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'parse_markdown_spec',
  'Extract structured requirements from a markdown spec file. Supports bullet lists, Given/When/Then, and checklist patterns',
  { filePath: z.string().describe('Absolute path to the markdown spec file') },
  async ({ filePath }) => {
    const result = await parseMarkdownSpec(filePath);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'scan_ui_flows',
  'Scan UI pages/routes/components to build a flow map with UI element selectors. UI-only tool.',
  {
    projectPath: z.string().describe('Absolute path to the frontend project root'),
    framework: z.string().describe('UI framework name (nuxt, nextjs, laravel, vue, react, etc.)'),
    moduleFilter: z.string().optional().describe('Optional module name to filter pages'),
  },
  async ({ projectPath, framework, moduleFilter }) => {
    const result = await scanUiFlows(projectPath, framework, moduleFilter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'scan_ui_validation',
  'Scan UI form components for validation rules from Yup, Zod, VeeValidate, and HTML attributes. UI-only tool.',
  {
    projectPath: z.string().describe('Absolute path to the frontend project root'),
    framework: z.string().describe('UI framework name'),
    moduleFilter: z.string().optional().describe('Optional module name to filter'),
  },
  async ({ projectPath, framework, moduleFilter }) => {
    const result = await scanUiValidation(projectPath, framework, moduleFilter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

const selectorInfoSchema = z.object({
  type: z.enum(['data-testid', 'aria-label', 'role', 'placeholder', 'text', 'missing']),
  value: z.string(),
  stability: z.enum(['stable', 'medium', 'fragile', 'missing']),
  playwrightCode: z.string(),
});

const uiElementSchema = z.object({
  name: z.string(),
  selector: selectorInfoSchema,
  component: z.string(),
  elementType: z.string(),
});

server.tool(
  'detect_spec_conflicts',
  'So sánh cross-file để tìm scenarios trùng lặp (duplicate) hoặc mâu thuẫn (conflict) giữa nhiều parsed spec files. Trả về mảng SpecConflict.',
  {
    specFlows: z.array(z.object({
      feature: z.string(),
      sourceFile: z.string(),
      scenarios: z.array(z.object({
        type: z.string(),
        description: z.string(),
        expectedText: z.string().optional(),
        expectedURL: z.string().optional(),
      })),
    })).describe('Toàn bộ ParsedSpec từ tất cả spec files đã parse'),
  },
  async ({ specFlows }) => {
    const result = detectSpecConflicts(specFlows as any);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'gap_analysis',
  'Compare spec requirements against code flows to find matched, missing, and undocumented behaviors',
  {
    specFlows: z.array(z.object({
      feature: z.string(),
      sourceFile: z.string(),
      scenarios: z.array(z.object({
        type: z.string(),
        description: z.string(),
      })),
    })).describe('Parsed spec scenarios'),
    codeFlows: z.array(z.object({
      name: z.string(),
      entry: z.string(),
      route: z.string(),
      elements: z.array(uiElementSchema),
      apis: z.array(z.string()),
    })).describe('Scanned code flows'),
  },
  async ({ specFlows, codeFlows }) => {
    const result = await gapAnalysis(specFlows as any, codeFlows as any);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'run_tests',
  'Run Playwright tests in a project and return structured results',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    filter: z.string().optional().describe('Optional test file name or grep pattern to filter tests'),
  },
  async ({ projectPath, filter }) => {
    const result = await runTests(projectPath, filter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'classify_results',
  'Classify Playwright test failures into categories: missing_testid, needs_mock, real_bug, timeout',
  {
    failures: z.array(z.object({
      test: z.string(),
      error: z.string(),
      file: z.string(),
    })).describe('Array of test failures from run_tests'),
  },
  async ({ failures }) => {
    const result = await classifyResults(failures);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'setup_playwright',
  'Install @playwright/test, create playwright.config.js, and install Chromium browser if not already present in the project',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    baseURL: z.string().describe('Base URL of the dev server (e.g. http://localhost:5173)'),
  },
  async ({ projectPath, baseURL }) => {
    const result = await setupPlaywright(projectPath, baseURL);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'generate_report',
  'Generate a clean HTML report for a test-architect run and save it to test-architect-reports/<module>_<timestamp>.html',
  {
    projectPath: z.string().describe('Absolute path to the project root'),
    reportInput: z.object({
      module: z.string(),
      specFile: z.string(),
      generatedAt: z.string(),
      requirements: z.number(),
      testsGenerated: z.number(),
      expectedPass: z.number(),
      expectedFail: z.number(),
      selectors: z.object({
        stable: z.number(),
        medium: z.number(),
        fragile: z.number(),
        skipped: z.number(),
        total: z.number(),
        missingIn: z.array(z.string()),
      }),
      gaps: z.object({
        matched: z.array(z.object({ description: z.string(), hasSelector: z.boolean() })),
        missing: z.array(z.object({ description: z.string(), reason: z.string() })),
        undocumented: z.array(z.object({ route: z.string(), entry: z.string() })),
      }),
      testResults: z.object({
        passed: z.number(),
        failed: z.number(),
        skipped: z.number(),
        duration: z.number(),
        failures: z.array(z.object({
          test: z.string(),
          error: z.string(),
          category: z.string(),
          suggestion: z.string(),
        })),
      }).optional(),
      generatedFile: z.string().optional(),
    }).describe('Report data'),
  },
  async ({ projectPath, reportInput }) => {
    const result = await generateReport(projectPath, reportInput as any);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

// ─── BE / API tools (dùng cho /test-api và /test-db) ─────────────────────────

server.tool(
  'detect_be_framework',
  'Detect BE framework, language, dev command, base URL, DB client/type và OpenAPI spec từ source code của backend project',
  { projectPath: z.string().describe('Absolute path to the backend project root') },
  async ({ projectPath }) => {
    const result = await detectBeFramework(projectPath);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'scan_api_routes',
  'Scan BE route/controller files để lấy danh sách API endpoints. Hỗ trợ: NestJS, Express, Fastify, Laravel, Rails, Spring Boot, FastAPI, Django, Flask.',
  {
    projectPath:  z.string().describe('Absolute path to the backend project root'),
    framework:    z.string().describe('BE framework: nestjs | express | fastify | laravel | rails | spring | fastapi | django | flask'),
    apiPrefix:    z.string().optional().describe('API prefix (default: /api)'),
    moduleFilter: z.string().optional().describe('Filter routes by module/path keyword'),
  },
  async ({ projectPath, framework, apiPrefix, moduleFilter }) => {
    const result = await scanApiRoutes(projectPath, framework, apiPrefix, moduleFilter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'scan_api_flows',
  'Scan tầng service/use-case của BE để tìm business flows và DB operations. Kết quả dùng cho gap_analysis và /test-db sau này.',
  {
    projectPath:  z.string().describe('Absolute path to the backend project root'),
    framework:    z.string().describe('BE framework: nestjs | express | fastify | laravel | rails | spring | fastapi | django | flask'),
    moduleFilter: z.string().optional().describe('Filter flows by module/service name keyword'),
  },
  async ({ projectPath, framework, moduleFilter }) => {
    const result = await scanApiFlows(projectPath, framework, moduleFilter);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
