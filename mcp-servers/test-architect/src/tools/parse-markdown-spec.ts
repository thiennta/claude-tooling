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
      currentScenarios.push({ type: done ? 'happy_path' : 'missing', description: checklistMatch[2] });
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    if (bulletMatch && !inGWT) {
      currentScenarios.push({ type: classifyByKeyword(bulletMatch[1]), description: bulletMatch[1] });
      continue;
    }

    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (numberedMatch && !inGWT) {
      currentScenarios.push({ type: classifyByKeyword(numberedMatch[1]), description: numberedMatch[1] });
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
