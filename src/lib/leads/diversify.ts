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

/**
 * Højst `max` kandidater fra samme by, rækkefølgen ellers uændret. Lucas
 * 2026-09-21: "det er også fint at der er nogen på Fyn og også nogen på
 * Sjælland. Men når alle sammen ligger i København, det går bare ikke."
 *
 * Koncentration er et andet problem end attraktivitet, og skal derfor løses
 * med et loft — ikke med en større straf til byen. En Københavner-salon er
 * stadig et lead; tredive af dem i træk er ikke en dagsbatch.
 */
export function capPerCity<T>(sorted: T[], cityOf: (t: T) => string, max: number): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const item of sorted) {
    const key = (cityOf(item) || "").trim().toLowerCase() || "(ukendt)";
    const n = seen.get(key) ?? 0;
    if (n >= max) continue;
    seen.set(key, n + 1);
    out.push(item);
  }
  return out;
}

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
