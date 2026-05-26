import type { ParsedSpec, SpecConflict } from '../types.js';

/** Normalize: bỏ diacritics, lowercase, collapse non-alnum thành space */
function normalizeDesc(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Hai description được coi là "giống nhau" khi:
 * - Sau normalize hoàn toàn giống nhau, HOẶC
 * - Ít nhất 60% token (len > 2) của chuỗi ngắn hơn xuất hiện trong chuỗi dài hơn
 */
function isSimilarDescription(a: string, b: string): boolean {
  const na = normalizeDesc(a);
  const nb = normalizeDesc(b);
  if (na === nb) return true;
  const ta = na.split(' ').filter(t => t.length > 2);
  const tb = new Set(nb.split(' ').filter(t => t.length > 2));
  if (ta.length === 0 || tb.size === 0) return false;
  const hits = ta.filter(t => tb.has(t)).length;
  return hits / Math.min(ta.length, tb.size) >= 0.6;
}

/**
 * So sánh cross-file để tìm scenarios trùng lặp hoặc mâu thuẫn.
 *
 * - **duplicate**: cùng description, cùng expected outcome
 * - **conflict** : cùng description, nhưng expectedText hoặc expectedURL khác nhau
 *
 * Chỉ so sánh giữa các spec từ **file khác nhau** (không so sánh nội bộ 1 file).
 */
export function detectSpecConflicts(specs: ParsedSpec[]): SpecConflict[] {
  const conflicts: SpecConflict[] = [];

  for (let i = 0; i < specs.length; i++) {
    for (let j = i + 1; j < specs.length; j++) {
      const specA = specs[i];
      const specB = specs[j];

      // Bỏ qua nếu cùng source file
      if (specA.sourceFile === specB.sourceFile) continue;

      for (const scA of specA.scenarios) {
        for (const scB of specB.scenarios) {
          if (!isSimilarDescription(scA.description, scB.description)) continue;

          // Conflict khi expected outcome khác nhau (một bên có giá trị, bên kia khác hoặc undefined)
          const hasDiffText =
            scA.expectedText !== scB.expectedText &&
            (scA.expectedText !== undefined || scB.expectedText !== undefined);
          const hasDiffURL =
            scA.expectedURL !== scB.expectedURL &&
            (scA.expectedURL !== undefined || scB.expectedURL !== undefined);

          const type: SpecConflict['type'] = (hasDiffText || hasDiffURL) ? 'conflict' : 'duplicate';

          // Tránh ghi cùng 1 cặp hai lần
          const alreadyRecorded = conflicts.some(c =>
            c.specs.some(s =>
              s.sourceFile === specA.sourceFile &&
              normalizeDesc(s.scenario.description) === normalizeDesc(scA.description)
            ) &&
            c.specs.some(s =>
              s.sourceFile === specB.sourceFile &&
              normalizeDesc(s.scenario.description) === normalizeDesc(scB.description)
            )
          );
          if (alreadyRecorded) continue;

          conflicts.push({
            type,
            description: scA.description,
            specs: [
              { sourceFile: specA.sourceFile, feature: specA.feature, scenario: scA },
              { sourceFile: specB.sourceFile, feature: specB.feature, scenario: scB },
            ],
          });
        }
      }
    }
  }

  return conflicts;
}
