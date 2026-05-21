import * as fs from 'fs';
import * as path from 'path';

export interface ReportInput {
  module: string;
  specFile: string;
  generatedAt: string;
  requirements: number;
  testsGenerated: number;
  expectedPass: number;
  expectedFail: number;
  selectors: {
    stable: number;
    medium: number;
    fragile: number;
    skipped: number;
    total: number;
    missingIn: string[];
  };
  gaps: {
    matched: Array<{ description: string; hasSelector: boolean }>;
    missing: Array<{ description: string; reason: string }>;
    undocumented: Array<{ route: string; entry: string }>;
  };
  testResults?: {
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    failures: Array<{
      test: string;
      error: string;
      category: string;
      suggestion: string;
    }>;
  };
  generatedFile?: string;
}

export async function generateReport(
  projectPath: string,
  input: ReportInput
): Promise<{ filePath: string }> {
  const html = buildHtml(input);
  const outDir = path.join(projectPath, 'test-architect-reports');
  fs.mkdirSync(outDir, { recursive: true });

  const gitignorePath = path.join(projectPath, '.gitignore');
  const entry = 'test-architect-reports/';
  if (fs.existsSync(gitignorePath)) {
    const content = fs.readFileSync(gitignorePath, 'utf-8');
    if (!content.includes(entry)) {
      fs.appendFileSync(gitignorePath, `\n${entry}\n`, 'utf-8');
    }
  } else {
    fs.writeFileSync(gitignorePath, `${entry}\n`, 'utf-8');
  }

  const slug = input.module.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const fileName = `${slug}_${timestamp}.html`;
  const filePath = path.join(outDir, fileName);

  fs.writeFileSync(filePath, html, 'utf-8');
  return { filePath };
}

function buildHtml(d: ReportInput): string {
  const hasTestResults = !!d.testResults;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Test Architect Report — ${esc(d.module)}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
      background: #fff;
      max-width: 900px;
      margin: 40px auto;
      padding: 0 24px 60px;
    }

    h1 { font-size: 20px; font-weight: 600; margin-bottom: 4px; }
    h2 { font-size: 15px; font-weight: 600; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e0e0e0; }
    h3 { font-size: 13px; font-weight: 600; margin: 16px 0 8px; color: #444; }

    .meta { color: #666; font-size: 13px; margin-bottom: 32px; }
    .meta span { margin-right: 20px; }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { text-align: left; font-weight: 600; font-size: 12px; text-transform: uppercase;
         letter-spacing: 0.04em; color: #666; padding: 6px 12px; border-bottom: 2px solid #e0e0e0; }
    td { padding: 7px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
    tr:last-child td { border-bottom: none; }

    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 3px;
      letter-spacing: 0.02em;
    }
    .badge-pass    { background: #e8f5e9; color: #2e7d32; }
    .badge-fail    { background: #fce4ec; color: #c62828; }
    .badge-skip    { background: #f5f5f5; color: #757575; }
    .badge-todo    { background: #fff3e0; color: #e65100; }
    .badge-stable  { background: #e3f2fd; color: #1565c0; }
    .badge-medium  { background: #fff8e1; color: #f57f17; }
    .badge-fragile { background: #fce4ec; color: #b71c1c; }
    .badge-missing { background: #f5f5f5; color: #9e9e9e; }

    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 8px; }
    .stat-box { border: 1px solid #e0e0e0; border-radius: 4px; padding: 12px 16px; }
    .stat-box .num { font-size: 28px; font-weight: 700; line-height: 1; }
    .stat-box .lbl { font-size: 12px; color: #666; margin-top: 4px; }

    .error-block { background: #fafafa; border: 1px solid #e0e0e0; border-radius: 4px;
                   padding: 10px 14px; margin-top: 6px; font-family: monospace; font-size: 12px;
                   white-space: pre-wrap; word-break: break-all; }
    .suggestion { font-size: 12px; color: #555; margin-top: 4px; }

    .empty { color: #999; font-style: italic; font-size: 13px; padding: 8px 0; }
    footer { margin-top: 48px; padding-top: 16px; border-top: 1px solid #e0e0e0;
             font-size: 12px; color: #999; }
  </style>
</head>
<body>

<h1>Test Architect Report — ${esc(d.module)}</h1>
<div class="meta">
  <span>Spec: <strong>${esc(d.specFile || 'none (confirm-behavior mode)')}</strong></span>
  <span>Generated: <strong>${esc(d.generatedAt)}</strong></span>
  ${d.generatedFile ? `<span>File: <strong>${esc(d.generatedFile)}</strong></span>` : ''}
</div>

<!-- Summary -->
<h2>Summary</h2>
<div class="summary-grid">
  <div class="stat-box">
    <div class="num">${d.requirements}</div>
    <div class="lbl">Requirements</div>
  </div>
  <div class="stat-box">
    <div class="num">${d.testsGenerated}</div>
    <div class="lbl">Tests generated</div>
  </div>
  <div class="stat-box">
    <div class="num">${d.expectedPass}</div>
    <div class="lbl">Expected PASS</div>
  </div>
  <div class="stat-box">
    <div class="num">${d.expectedFail}</div>
    <div class="lbl">Expected FAIL (TODO)</div>
  </div>
</div>

<!-- Selector report -->
<h2>Selector Stability</h2>
<table>
  <thead>
    <tr><th>Type</th><th>Count</th><th>Share</th></tr>
  </thead>
  <tbody>
    ${selectorRow('Stable (data-testid)', d.selectors.stable, d.selectors.total, 'stable')}
    ${selectorRow('Medium (role / label / placeholder)', d.selectors.medium, d.selectors.total, 'medium')}
    ${selectorRow('Fragile (text)', d.selectors.fragile, d.selectors.total, 'fragile')}
    ${selectorRow('Skipped (not found)', d.selectors.skipped, d.selectors.total, 'missing')}
  </tbody>
</table>
${d.selectors.missingIn.length > 0 ? `
<h3>Should add data-testid in</h3>
<ul style="margin-left:20px;margin-top:4px;">
  ${d.selectors.missingIn.map(s => `<li style="font-size:13px;">${esc(s)}</li>`).join('')}
</ul>` : ''}

<!-- Gap analysis -->
<h2>Gap Analysis</h2>

<h3>Matched (${d.gaps.matched.length})</h3>
${d.gaps.matched.length === 0
  ? '<p class="empty">No matched requirements.</p>'
  : `<table>
  <thead><tr><th>Requirement</th><th>Selector</th></tr></thead>
  <tbody>
    ${d.gaps.matched.map(r => `
    <tr>
      <td>${esc(r.description)}</td>
      <td><span class="badge ${r.hasSelector ? 'badge-stable' : 'badge-missing'}">${r.hasSelector ? 'Found' : 'Missing'}</span></td>
    </tr>`).join('')}
  </tbody>
</table>`}

<h3>Missing — not implemented (${d.gaps.missing.length})</h3>
${d.gaps.missing.length === 0
  ? '<p class="empty">No missing requirements.</p>'
  : `<table>
  <thead><tr><th>Requirement</th><th>Reason</th></tr></thead>
  <tbody>
    ${d.gaps.missing.map(r => `
    <tr>
      <td>${esc(r.description)}</td>
      <td style="color:#888;font-size:13px;">${esc(r.reason)}</td>
    </tr>`).join('')}
  </tbody>
</table>`}

<h3>Undocumented — code has it, spec doesn't (${d.gaps.undocumented.length})</h3>
${d.gaps.undocumented.length === 0
  ? '<p class="empty">No undocumented flows.</p>'
  : `<table>
  <thead><tr><th>Route</th><th>Entry</th></tr></thead>
  <tbody>
    ${d.gaps.undocumented.map(r => `
    <tr><td>${esc(r.route)}</td><td style="color:#888;font-size:13px;">${esc(r.entry)}</td></tr>`).join('')}
  </tbody>
</table>`}

${hasTestResults ? buildTestResultsSection(d.testResults!) : ''}

<footer>Generated by AI Test Architect &nbsp;|&nbsp; ${esc(d.generatedAt)}</footer>
</body>
</html>`;
}

function buildTestResultsSection(r: NonNullable<ReportInput['testResults']>): string {
  return `
<h2>Test Results</h2>
<div class="summary-grid">
  <div class="stat-box">
    <div class="num">${r.passed}</div>
    <div class="lbl">Passed</div>
  </div>
  <div class="stat-box">
    <div class="num">${r.failed}</div>
    <div class="lbl">Failed</div>
  </div>
  <div class="stat-box">
    <div class="num">${r.skipped}</div>
    <div class="lbl">Skipped</div>
  </div>
  <div class="stat-box">
    <div class="num">${(r.duration / 1000).toFixed(1)}s</div>
    <div class="lbl">Duration</div>
  </div>
</div>

${r.failures.length > 0 ? `
<h3>Failures (${r.failures.length})</h3>
<table>
  <thead><tr><th>Test</th><th>Category</th><th>Error / Fix</th></tr></thead>
  <tbody>
    ${r.failures.map(f => `
    <tr>
      <td>${esc(f.test)}</td>
      <td><span class="badge badge-fail">${esc(f.category)}</span></td>
      <td>
        <div class="error-block">${esc(f.error)}</div>
        <div class="suggestion">${esc(f.suggestion)}</div>
      </td>
    </tr>`).join('')}
  </tbody>
</table>` : '<p class="empty" style="margin-top:8px;">All tests passed.</p>'}`;
}

function selectorRow(label: string, count: number, total: number, badge: string): string {
  const pct = total > 0 ? Math.round(count / total * 100) : 0;
  return `<tr>
    <td><span class="badge badge-${badge}">${label}</span></td>
    <td>${count}</td>
    <td>${pct}%</td>
  </tr>`;
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
