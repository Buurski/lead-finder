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

// A half-open, 0-based row range for Sheets `deleteDimension`
// (covers 1-based sheet rows `startIndex+1 .. endIndex`).
export interface RowRange {
  startIndex: number;
  endIndex: number;
}

// Coalesce the safe descending row list into contiguous ranges. A mass cleanup
// (e.g. 5000+ rows) is mostly consecutive, so this collapses thousands of
// single-row `deleteDimension` requests into a handful of range deletes — well
// under any batchUpdate payload/timeout limit. Ranges are returned highest-first
// so applying them in order never shifts an index still queued for deletion
// (deleting a higher range leaves all lower row numbers untouched).
export function planRowDeletionRanges(sheetRowNumbers: number[]): RowRange[] {
  const desc = planRowDeletions(sheetRowNumbers); // unique, descending, >= 2
  const ranges: RowRange[] = [];
  let i = 0;
  while (i < desc.length) {
    const hi = desc[i];
    let lo = hi;
    while (i + 1 < desc.length && desc[i + 1] === lo - 1) {
      lo = desc[i + 1];
      i++;
    }
    ranges.push({ startIndex: lo - 1, endIndex: hi });
    i++;
  }
  return ranges;
}
