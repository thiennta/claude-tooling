import type { ParsedSpec, CodeFlow, GapAnalysisResult } from '../types.js';

// Strip diacritics, lowercase, collapse non-alphanumeric to spaces
function normalize(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Count shared tokens of length > 2 between two strings
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalize(a).split(' ').filter(t => t.length > 2));
  const tb = new Set(normalize(b).split(' ').filter(t => t.length > 2));
  let hits = 0;
  for (const t of ta) if (tb.has(t)) hits++;
  return hits;
}

function matchesFlow(specFeature: string, flow: CodeFlow): boolean {
  const nf = normalize(specFeature);
  const nn = normalize(flow.name);
  const nr = normalize(flow.route);
  const ne = normalize(flow.entry);

  if (nn.includes(nf) || nf.includes(nn)) return true;
  if (nr.includes(nf) || nf.includes(nr)) return true;
  if (tokenOverlap(specFeature, flow.name)  > 0) return true;
  if (tokenOverlap(specFeature, flow.route) > 0) return true;
  if (tokenOverlap(specFeature, ne)         > 0) return true;

  return false;
}

export async function gapAnalysis(
  specFlows: ParsedSpec[],
  codeFlows: CodeFlow[]
): Promise<GapAnalysisResult> {
  const matched:       GapAnalysisResult['matched']       = [];
  const missing:       GapAnalysisResult['missing']       = [];
  const undocumented:  GapAnalysisResult['undocumented']  = [];

  for (const flow of codeFlows) {
    const isDocumented = specFlows.some(s => matchesFlow(s.feature, flow));
    if (!isDocumented) undocumented.push({ route: flow.route, entry: flow.entry });
  }

  for (const spec of specFlows) {
    const relatedFlow = codeFlows.find(f => matchesFlow(spec.feature, f));

    for (const scenario of spec.scenarios) {
      if (scenario.type === 'missing') {
        missing.push({ description: scenario.description, reason: 'Marked as missing in spec' });
        continue;
      }
      if (!relatedFlow) {
        missing.push({ description: scenario.description, reason: `No code found for feature "${spec.feature}"` });
        continue;
      }
      const hasSelector = relatedFlow.elements.some(e => e.selector.stability !== 'missing');
      matched.push({ description: scenario.description, hasSelector });
    }
  }

  return { matched, missing, undocumented };
}
