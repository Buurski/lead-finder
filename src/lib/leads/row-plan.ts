// row-plan.ts — pure helper for SAFE batched row deletions on a Google Sheet.
//
// A batched `deleteDimension` applies its requests in order, and every deletion
// shifts all lower rows up by one. Two consequences the caller MUST respect:
//
//   1. Deletions go highest-row-first (descending), so a delete never shifts the
//      index of a row that is still queued for deletion.
//   2. A row number must never appear twice. After the first delete, the next
//      row has slid into that index — a second "delete N" would remove the
//      wrong (neighbouring) row. So we dedupe.
//
// We also drop row 1 (the header) and any non-integer / sub-2 index, so a bad
// lead id can never delete the header row or a phantom row. Lead ids equal the
// 1-based sheet row (min 2: row 1 is the header), see getLeads().
export function planRowDeletions(sheetRowNumbers: number[]): number[] {
  const seen = new Set<number>();
  for (const n of sheetRowNumbers) {
    if (Number.isInteger(n) && n >= 2) seen.add(n);
  }
  return [...seen].sort((a, b) => b - a);
}
