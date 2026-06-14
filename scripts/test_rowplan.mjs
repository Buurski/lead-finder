#!/usr/bin/env node
/*
 * test_rowplan.mjs — offline contract tests for planRowDeletions
 * (src/lib/leads/row-plan.ts). Pure: no Sheets, no network. Guards the
 * catastrophic batched-delete failure modes (index shift, double-delete a
 * neighbour, delete the header row).
 *
 *   node scripts/test_rowplan.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { planRowDeletions, planRowDeletionRanges } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", "row-plan.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Descending order so a delete never shifts a still-queued row.
check("sorts descending", eq(planRowDeletions([2, 5, 3]), [5, 3, 2]));
check("already-descending preserved", eq(planRowDeletions([9, 4, 2]), [9, 4, 2]));

// Dedupe — a duplicate row number would delete the shifted neighbour.
check("dedupes duplicates", eq(planRowDeletions([5, 5, 3, 3, 3]), [5, 3]));

// Header row (1) must never be deletable.
check("drops header row 1", eq(planRowDeletions([1, 2, 3]), [3, 2]));
check("drops row 0 and negatives", eq(planRowDeletions([0, -4, 2]), [2]));

// Non-integers (NaN from a bad parseInt, fractional ids) are dropped.
check("drops NaN", eq(planRowDeletions([Number.NaN, 4]), [4]));
check("drops fractional", eq(planRowDeletions([2.5, 4]), [4]));

// Empty / all-invalid → empty (caller short-circuits, no empty batchUpdate).
check("empty input → empty", eq(planRowDeletions([]), []));
check("all-invalid → empty", eq(planRowDeletions([1, 0, Number.NaN]), []));

// Combined: messy real-world input (toDelete+toArchive concat with a dup).
check("combined messy input", eq(planRowDeletions([12, 3, 12, 1, 7, 7]), [12, 7, 3]));

// --- planRowDeletionRanges: coalesce contiguous rows into highest-first ranges.
// Range {startIndex, endIndex} is half-open 0-based, covering sheet rows
// startIndex+1..endIndex. Must stay index-safe: ranges descend by endIndex.
check("single row → one 1-row range", eq(planRowDeletionRanges([5]), [{ startIndex: 4, endIndex: 5 }]));
check("contiguous run coalesces", eq(planRowDeletionRanges([4, 3, 2]), [{ startIndex: 1, endIndex: 4 }]));
check("contiguous from messy order", eq(planRowDeletionRanges([2, 4, 3]), [{ startIndex: 1, endIndex: 4 }]));
check("gaps split into ranges, highest first",
  eq(planRowDeletionRanges([10, 9, 8, 5, 4, 2]),
     [{ startIndex: 7, endIndex: 10 }, { startIndex: 3, endIndex: 5 }, { startIndex: 1, endIndex: 2 }]));
check("dedupe before coalesce", eq(planRowDeletionRanges([3, 3, 2]), [{ startIndex: 1, endIndex: 3 }]));
check("drops header/invalid before coalesce", eq(planRowDeletionRanges([1, 0, 2, 3]), [{ startIndex: 1, endIndex: 3 }]));
check("empty → empty ranges", eq(planRowDeletionRanges([]), []));
// Big contiguous block (the 5000-row cleanup shape) → exactly one range.
{
  const big = [];
  for (let r = 5001; r >= 2; r--) big.push(r);
  check("5000 contiguous rows → one range",
    eq(planRowDeletionRanges(big), [{ startIndex: 1, endIndex: 5001 }]));
}

console.log(`test_rowplan — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
