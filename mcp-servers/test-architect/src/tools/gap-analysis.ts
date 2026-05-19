import type { ParsedSpec, CodeFlow, GapAnalysisResult } from '../types.js';

export async function gapAnalysis(
  specFlows: ParsedSpec[],
  codeFlows: CodeFlow[]
): Promise<GapAnalysisResult> {
  const matched:       GapAnalysisResult['matched']       = [];
  const missing:       GapAnalysisResult['missing']       = [];
  const undocumented:  GapAnalysisResult['undocumented']  = [];

  const specFeatureNames = specFlows.map(s => s.feature.toLowerCase());

  for (const flow of codeFlows) {
    const isDocumented = specFeatureNames.some(name =>
      flow.name.toLowerCase().includes(name) ||
      name.includes(flow.name.toLowerCase()) ||
      flow.route.toLowerCase().includes(name)
    );
    if (!isDocumented) undocumented.push({ route: flow.route, entry: flow.entry });
  }

  for (const spec of specFlows) {
    const relatedFlow = codeFlows.find(f =>
      f.name.toLowerCase().includes(spec.feature.toLowerCase()) ||
      spec.feature.toLowerCase().includes(f.name.toLowerCase())
    );

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
