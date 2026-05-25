import * as fs from 'fs';
import * as path from 'path';
import type { ParsedSpec, Scenario, ScenarioType } from '../types.js';

export async function parseMarkdownSpec(filePath: string): Promise<ParsedSpec[]> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const results: ParsedSpec[] = [];

  let currentFeature = path.basename(filePath, '.md');
  let currentScenarios: Scenario[] = [];
  let gwt: { given?: string; when?: string; then?: string } = {};
  let inGWT = false;

  const flushFeature = () => {
    if (currentScenarios.length > 0) {
      results.push({ feature: currentFeature, sourceFile: filePath, scenarios: [...currentScenarios] });
      currentScenarios = [];
    }
  };

  const flushGWT = () => {
    if (gwt.when && gwt.then) {
      currentScenarios.push({
        type: classifyGWT(gwt),
        description: [gwt.given && `Given ${gwt.given}`, `When ${gwt.when}`, `Then ${gwt.then}`]
          .filter(Boolean).join(' / '),
      });
      gwt = {};
      inGWT = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (/^#{1,3}\s/.test(trimmed)) {
      flushGWT();
      flushFeature();
      currentFeature = trimmed.replace(/^#{1,3}\s+/, '').trim();
      continue;
    }

    const givenMatch = trimmed.match(/^\*{0,2}[Gg]iven\*{0,2}\s+(.+)/);
    const whenMatch  = trimmed.match(/^\*{0,2}[Ww]hen\*{0,2}\s+(.+)/);
    const thenMatch  = trimmed.match(/^\*{0,2}[Tt]hen\*{0,2}\s+(.+)/);

    if (givenMatch) { flushGWT(); gwt.given = givenMatch[1]; inGWT = true; continue; }
    if (whenMatch)  { gwt.when = whenMatch[1]; inGWT = true; continue; }
    if (thenMatch)  { gwt.then = thenMatch[1]; flushGWT(); continue; }

    const checklistMatch = trimmed.match(/^-\s+\[( |x|X)\]\s+(.+)/);
    if (checklistMatch) {
      const done = checklistMatch[1].toLowerCase() === 'x';
      const desc = checklistMatch[2];
      currentScenarios.push({ type: done ? 'happy_path' : 'missing', description: desc, ...extractExpected(desc) });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch && !inGWT) {
      const desc = bulletMatch[1];
      currentScenarios.push({ type: classifyByKeyword(desc), description: desc, ...extractExpected(desc) });
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch && !inGWT) {
      const desc = numberedMatch[1];
      currentScenarios.push({ type: classifyByKeyword(desc), description: desc, ...extractExpected(desc) });
    }
  }

  flushGWT();
  flushFeature();

  return results;
}

function classifyByKeyword(text: string): ScenarioType {
  const lower = text.toLowerCase();
  if (/thành công|success|redirect|happy/.test(lower))            return 'happy_path';
  if (/lỗi|error|fail|invalid|không hợp lệ|expired/.test(lower)) return 'error_case';
  if (/rollback|concurrent|double|race|edge/.test(lower))         return 'edge_case';
  if (/required|bắt buộc|validate|format|min|max/.test(lower))   return 'validation';
  if (/chưa|missing|todo|tbd/.test(lower))                        return 'missing';
  return 'unknown';
}

function classifyGWT(gwt: { given?: string; when?: string; then?: string }): ScenarioType {
  return classifyByKeyword([gwt.given, gwt.when, gwt.then].filter(Boolean).join(' '));
}

function extractExpected(text: string): { expectedText?: string; expectedURL?: string } {
  // Extract quoted text: 'foo', "foo", 「foo」 — take the last quoted string (usually the outcome)
  const quotes = [...text.matchAll(/['"「]([^'"」]{2,})['"」]/g)];
  const expectedText = quotes.length > 0 ? quotes[quotes.length - 1][1] : undefined;

  // Extract URL from redirect/navigate patterns
  const urlMatch = text.match(/(?:redirect|navigate|chuyển|đến|to)\s+([/][^\s,)]+)/i);
  const expectedURL = urlMatch?.[1];

  return { expectedText, expectedURL };
}
