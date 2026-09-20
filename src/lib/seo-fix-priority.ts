// seo-fix-priority.ts — let Jev rank the already-written plain-Danish fixes
// for THIS business instead of a static weight table (council 2026-09-20,
// idea A3). Jev never writes a fix; it only orders candidates whose text is
// hand-written in seo-tjek.ts. Falls back to the static weights whenever Jev
// is off, slow, or the page text is too thin to judge.

import { jevAsk, score, type JevQuestion } from "./jev.ts";
import { redact, stripHtmlToText } from "./fetch-page.ts";

export interface WeightedFix {
  title: string;
  why: string;
  how: string;
  /** Static weight from plainFixCandidates (the fallback order). */
  w: number;
}

export interface FixContext {
  name: string;
  branch?: string;
  city?: string;
  /** Raw HTML of the homepage; reduced + redacted here. */
  html: string;
}

const MIN_WORDS = 60;
const MAX_CANDIDATES = 9;

const LEVELS = [
  "Kosmetisk, kunden mærker det ikke",
  "Lille forbedring",
  "Mærkbar: flere finder eller stoler på forretningen",
  "Direkte flere kunder eller omsætning for netop denne forretning",
];

/**
 * Returns the top `take` fixes ordered by Jev's effect judgment (ties broken
 * by static weight). Same input → same static fallback as before when Jev
 * returns null, so the visitor always gets a report.
 */
export async function prioritizeFixes(candidates: WeightedFix[], ctx: FixContext, take = 3): Promise<WeightedFix[]> {
  const byWeight = [...candidates].sort((a, b) => b.w - a.w);
  if (candidates.length < 2) return byWeight.slice(0, take);

  const text = redact(stripHtmlToText(ctx.html)).slice(0, 5000);
  if (text.split(" ").filter(Boolean).length < MIN_WORDS) return byWeight.slice(0, take);

  const cands = byWeight.slice(0, MAX_CANDIDATES);
  const questions: Record<string, JevQuestion> = {};
  cands.forEach((c, i) => {
    questions[`effekt_${i}`] = {
      type: "score",
      instructions: {
        kandidat: c.title,
        hvorfor: c.why,
        question: "Hvor stor effekt har det at løse `kandidat` for netop `forretning` (branche `branche`, by `by`), ud fra `forside_tekst`?",
      },
      criteria: LEVELS,
    };
  });
  const res = await jevAsk(
    { forretning: ctx.name, branche: ctx.branch ?? "(ukendt)", by: ctx.city ?? "(ukendt)", forside_tekst: text },
    questions,
    { timeoutMs: 8000 },
  );
  if (!res) return byWeight.slice(0, take);

  const scored = cands.map((c, i) => ({ c, s: score(res.answers, `effekt_${i}`) }));
  if (scored.some((x) => typeof x.s !== "number")) return byWeight.slice(0, take);
  return scored
    .sort((a, b) => (b.s as number) - (a.s as number) || b.c.w - a.c.w)
    .slice(0, take)
    .map((x) => x.c);
}
