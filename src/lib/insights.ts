// insights.ts — pure sales/analytics derivations on top of finance.ts.
// Strip-safe, no network, no sheets import (takes plain DealInput[] in), so the
// node CLI can import the .ts directly and scripts/test_insights.mjs runs
// offline. Phase 2 covers the Salg views (funnel, conversion, win rate, deal
// economics, expected-close, segments, hygiene); Phase 3 adds period deltas,
// growth decomposition and the plain-Danish rules engine.

import {
  type DealInput, type Period, type Stage,
  STAGE_PROB, STAGE_LABELS_DA, stageOf, isOpen, num, parseDate, inPeriod,
} from "./finance.ts";

// A deal counts as "won" (closed-won) once it reaches won and through delivery
// into live — those are all realized sales, not open pipeline.
const WON_STAGES = new Set<Stage>(["won", "delivering", "live"]);
export const isWon = (d: DealInput): boolean => WON_STAGES.has(stageOf(d));
export const isLost = (d: DealInput): boolean => stageOf(d) === "lost";

// Annualised contract value of one deal: one-off setup + a year of recurring.
export const dealValue = (d: DealInput): number => num(d.setupFee) + 12 * num(d.monthlyFee);

// ---- funnel ---------------------------------------------------------------
// Current-state distribution across the sales funnel. NB: buckets are where
// deals are RIGHT NOW (no stage-history exists), not a cohort that flowed
// through — the UI captions this honestly.

export const FUNNEL_STAGES: Stage[] = ["lead", "contacted", "engaged", "concept", "offer", "negotiation", "won"];

export interface FunnelStep { stage: Stage; label: string; count: number; rawValue: number; weightedValue: number; }

function funnelBucket(d: DealInput): Stage | null {
  const s = stageOf(d);
  if (s === "lost") return null;        // tracked via win rate, not the funnel
  if (WON_STAGES.has(s)) return "won";  // delivering/live fold into Vundet
  return s;
}

export function funnel(deals: DealInput[]): FunnelStep[] {
  return FUNNEL_STAGES.map((stage) => {
    const rows = deals.filter((d) => funnelBucket(d) === stage);
    const rawValue = rows.reduce((s, d) => s + dealValue(d), 0);
    const p = STAGE_PROB[stage] ?? 1; // won → 1
    return { stage, label: STAGE_LABELS_DA[stage], count: rows.length, rawValue, weightedValue: rawValue * p };
  });
}

export interface Conversion { from: string; to: string; rate: number | null; }

// Ratio of adjacent funnel buckets + the headline Kontaktet→Vundet. rate is
// null when the upstream bucket is empty (avoid /0 and a misleading 0%).
export function conversionRates(steps: FunnelStep[]): { transitions: Conversion[]; overall: number | null } {
  const transitions: Conversion[] = [];
  for (let i = 0; i < steps.length - 1; i++) {
    const a = steps[i], b = steps[i + 1];
    transitions.push({ from: a.label, to: b.label, rate: a.count > 0 ? b.count / a.count : null });
  }
  const contacted = steps.find((s) => s.stage === "contacted");
  const won = steps.find((s) => s.stage === "won");
  const overall = contacted && contacted.count > 0 && won ? won.count / contacted.count : null;
  return { transitions, overall };
}

// ---- win rate & economics -------------------------------------------------

export interface WinRate { won: number; lost: number; rate: number | null; }
export function winRate(deals: DealInput[]): WinRate {
  const won = deals.filter(isWon).length;
  const lost = deals.filter(isLost).length;
  return { won, lost, rate: won + lost > 0 ? won / (won + lost) : null };
}

export interface DealEconomics {
  wonCount: number;
  avgDealValue: number;      // avg (setup + 12*mrr) over won deals
  avgSetup: number;          // avg one-off
  avgRecurringAnnual: number; // avg 12*mrr
  openRaw: number;           // Σ (setup+12*mrr) over open deals
  openWeighted: number;      // Σ (setup+12*mrr)*P(stage) over open deals
}
export function dealEconomics(deals: DealInput[]): DealEconomics {
  const won = deals.filter(isWon);
  const open = deals.filter(isOpen);
  const avg = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
  return {
    wonCount: won.length,
    avgDealValue: avg(won.map(dealValue)),
    avgSetup: avg(won.map((d) => num(d.setupFee))),
    avgRecurringAnnual: avg(won.map((d) => 12 * num(d.monthlyFee))),
    openRaw: open.reduce((s, d) => s + dealValue(d), 0),
    openWeighted: open.reduce((s, d) => s + dealValue(d) * (STAGE_PROB[stageOf(d)] ?? 0), 0),
  };
}

// Open deals whose expected_close lands in the period: raw + weighted + count.
export interface ExpectedClose { count: number; raw: number; weighted: number; }
export function expectedCloseIn(deals: DealInput[], p: Period): ExpectedClose {
  const rows = deals.filter((d) => isOpen(d) && inPeriod(d.expectedClose, p));
  return {
    count: rows.length,
    raw: rows.reduce((s, d) => s + dealValue(d), 0),
    weighted: rows.reduce((s, d) => s + dealValue(d) * (STAGE_PROB[stageOf(d)] ?? 0), 0),
  };
}

// ---- segmentation ---------------------------------------------------------

export interface Segment { key: string; count: number; value: number; win: WinRate; }

// Group by a categorical field (source/owner). value = realized annualised
// value of won deals in the segment; win = its win rate. Blank → "ukendt".
export function segmentBy(deals: DealInput[], field: "source" | "owner"): Segment[] {
  const groups = new Map<string, DealInput[]>();
  for (const d of deals) {
    const key = (d[field] || "").trim().toLowerCase() || "ukendt";
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(d);
  }
  return [...groups.entries()]
    .map(([key, rows]) => ({
      key,
      count: rows.length,
      value: rows.filter(isWon).reduce((s, d) => s + dealValue(d), 0),
      win: winRate(rows),
    }))
    .sort((a, b) => b.value - a.value || b.count - a.count);
}

// ---- hygiene --------------------------------------------------------------
// Open deals past their expected_close date — the one velocity signal we can
// compute without stage-history (sales-cycle / days-per-stage need snapshots).

export interface OverdueDeal { name: string; stage: Stage; label: string; expectedClose: string; daysOverdue: number; }
export function overdueDeals(deals: DealInput[], now: Date): OverdueDeal[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const out: OverdueDeal[] = [];
  for (const d of deals) {
    if (!isOpen(d)) continue;
    const ec = parseDate(d.expectedClose);
    if (!ec || ec >= today) continue;
    const daysOverdue = Math.round((today.getTime() - ec.getTime()) / 86400000);
    out.push({ name: d.name ?? "", stage: stageOf(d), label: STAGE_LABELS_DA[stageOf(d)], expectedClose: d.expectedClose ?? "", daysOverdue });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
