// src/lib/leads/diversify.ts
//
// Round-robin a best-first list across branch families so a daily PICK batch is
// a MIX, not all one branch (Lucas, CLAUDE.md 2026-06-03: keep restaurants but
// never a batch that's only food; best results are a mix, beauty weighted up).
//
// PURE. Input must already be sorted best-first (e.g. by composite score). Within
// each family we keep that order; families are visited in order of their best
// item, so the single strongest lead still leads, then picks rotate branches.

import { branchFamily } from "./composite-score.ts";

export function diversifyByFamily<T>(sorted: T[], branchOf: (t: T) => string): T[] {
  const groups = new Map<string, T[]>(); // insertion order = order of each family's best item
  for (const item of sorted) {
    const fam = branchFamily(branchOf(item));
    const arr = groups.get(fam);
    if (arr) arr.push(item);
    else groups.set(fam, [item]);
  }
  const families = [...groups.keys()];
  const out: T[] = [];
  let progressed = true;
  let round = 0;
  while (progressed) {
    progressed = false;
    for (const f of families) {
      const arr = groups.get(f)!;
      if (round < arr.length) {
        out.push(arr[round]);
        progressed = true;
      }
    }
    round++;
  }
  return out;
}
