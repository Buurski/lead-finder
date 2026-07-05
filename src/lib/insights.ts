// insights.ts — pure sales/analytics derivations on top of finance.ts.
// Strip-safe, no network, no sheets import (takes plain DealInput[] in), so the
// node CLI can import the .ts directly and scripts/test_insights.mjs runs
// offline. Phase 2 covers the Salg views (funnel, conversion, win rate, deal
// economics, expected-close, segments, hygiene); Phase 3 adds period deltas,
// growth decomposition and the plain-Danish rules engine.

import type { Target } from "./sheets.ts";
import {
  type DealInput, type Period, type Stage,
  STAGE_PROB, STAGE_LABELS_DA, stageOf, isOpen, num, parseDate, inPeriod,
  mrrRunRate, liveClientCount, weightedPipeline, setupBooked,
  monthPeriodAt, quarterOf, dkk,
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

// ==========================================================================
// Phase 3 — Indsigter: period comparison, growth decomposition, rules engine.
// All period metrics are attributable from won_date / lost_date, so they're
// comparable across periods without snapshots. Point-in-time ratios (ARPA,
// coverage) get their DELTA from snapshots when history exists; the value now.
// ==========================================================================

// Average revenue per account = current MRR run-rate ÷ live clients.
export function arpa(deals: DealInput[]): number {
  const live = liveClientCount(deals);
  return live > 0 ? mrrRunRate(deals) / live : 0;
}

export interface PeriodStats {
  revenue: number;       // setup_fee booked (won_date in period) — the period-attributable one-off
  newClients: number;    // deals won in period
  avgDealValue: number;  // avg (setup + 12*mrr) over deals won in period
  mrrAdded: number;      // Σ mrr of deals won in period
  churnedMrr: number;    // Σ mrr of deals lost in period (needs lost_date)
  netNewMrr: number;     // mrrAdded − churnedMrr
  closedWon: number;
  closedLost: number;
  winRate: number | null; // among deals CLOSED in period
}

export function periodStats(deals: DealInput[], p: Period): PeriodStats {
  const wonIn = deals.filter((d) => isWon(d) && inPeriod(d.wonDate, p));
  const lostIn = deals.filter((d) => isLost(d) && inPeriod(d.lostDate, p));
  const mrrAdded = wonIn.reduce((s, d) => s + num(d.monthlyFee), 0);
  const churnedMrr = lostIn.reduce((s, d) => s + num(d.monthlyFee), 0);
  const closedWon = wonIn.length, closedLost = lostIn.length;
  return {
    revenue: setupBooked(deals, p),
    newClients: closedWon,
    avgDealValue: closedWon ? wonIn.reduce((s, d) => s + dealValue(d), 0) / closedWon : 0,
    mrrAdded,
    churnedMrr,
    netNewMrr: mrrAdded - churnedMrr,
    closedWon,
    closedLost,
    winRate: closedWon + closedLost > 0 ? closedWon / (closedWon + closedLost) : null,
  };
}

export interface Delta { abs: number; pct: number | null; }
// pct is null when the baseline is 0 (avoid Infinity / a meaningless %).
export function delta(current: number, previous: number): Delta {
  return { abs: current - previous, pct: previous !== 0 ? (current - previous) / previous : null };
}

export interface PeriodComparison {
  current: PeriodStats;
  previous: PeriodStats;
  deltas: Record<keyof PeriodStats, Delta>;
}
export function comparePeriods(deals: DealInput[], current: Period, previous: Period): PeriodComparison {
  const cur = periodStats(deals, current);
  const prev = periodStats(deals, previous);
  const keys = Object.keys(cur) as (keyof PeriodStats)[];
  const deltas = {} as Record<keyof PeriodStats, Delta>;
  for (const k of keys) deltas[k] = delta(Number(cur[k] ?? 0), Number(prev[k] ?? 0));
  return { current: cur, previous: prev, deltas };
}

// Growth decomposition: revenue Δ = volume effect + value effect, exactly.
//   volume = (n1 − n0) · v0     value = n1 · (v1 − v0)     where v = rev / n
// The two always sum to rev1 − rev0 (v defined as 0 when n = 0).
export interface Decomposition { totalDelta: number; volumeEffect: number; valueEffect: number; n0: number; n1: number; v0: number; v1: number; }
export function decomposeRevenue(current: PeriodStats, previous: PeriodStats): Decomposition {
  const n1 = current.newClients, n0 = previous.newClients;
  const rev1 = current.revenue, rev0 = previous.revenue;
  const v1 = n1 > 0 ? rev1 / n1 : 0;
  const v0 = n0 > 0 ? rev0 / n0 : 0;
  return {
    totalDelta: rev1 - rev0,
    volumeEffect: (n1 - n0) * v0,
    valueEffect: n1 * (v1 - v0),
    n0, n1, v0, v1,
  };
}

// Weighted pipeline ÷ what's still needed to hit the quarter target (remaining
// setup + 12× remaining new-MRR). Returns null when the target is already met
// (nothing left to cover) or unknown, so the UI can say "mål nået" vs a number.
export function pipelineCoverage(deals: DealInput[], target: Target | null, now: Date): number | null {
  if (!target) return null;
  const q = quarterOf(now);
  const remainingSetup = Math.max(target.target_setup_revenue - setupBooked(deals, q), 0);
  const mrrAddedQ = deals.filter((d) => isWon(d) && inPeriod(d.wonDate, q)).reduce((s, d) => s + num(d.monthlyFee), 0);
  const remainingMrr = Math.max(target.target_mrr_added - mrrAddedQ, 0);
  const remainingValue = remainingSetup + 12 * remainingMrr;
  if (remainingValue <= 0) return null; // target met
  return weightedPipeline(deals).total / remainingValue;
}

// Monthly won-deal series (from won_date) for the trend charts — reliable
// without snapshots. revenue = setup booked that month; avgDealValue = avg
// (setup+12*mrr) of deals won that month.
export interface MonthSales { key: string; label: string; wonCount: number; revenue: number; avgDealValue: number; }
const MONTHS_DA = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function monthlySalesSeries(deals: DealInput[], now: Date, months = 6): MonthSales[] {
  const out: MonthSales[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const p = monthPeriodAt(d.getFullYear(), d.getMonth());
    const wonIn = deals.filter((x) => isWon(x) && inPeriod(x.wonDate, p));
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: MONTHS_DA[d.getMonth()],
      wonCount: wonIn.length,
      revenue: setupBooked(deals, p),
      avgDealValue: wonIn.length ? wonIn.reduce((s, x) => s + dealValue(x), 0) / wonIn.length : 0,
    });
  }
  return out;
}

// ---- rules engine (deterministic plain-Danish insights) -------------------
// Every sentence's numbers come from the metrics passed in — nothing invented.
// LLM phrasing can be layered on later via the existing "Spørg Claude" path.

export type Tone = "positive" | "neutral" | "warning";
export interface Insight { tone: Tone; icon: string; text: string; }

export interface InsightInput {
  periodLabel: string;       // "måned" | "kvartal" | "år"
  comparison: PeriodComparison;
  pipelineCoverage: number | null;
  overdueCount: number;
  hasHistory: boolean;
}

const pctText = (p: number) => `${Math.round(Math.abs(p) * 100)}%`;

export function keyInsights(input: InsightInput): Insight[] {
  const { periodLabel: L, comparison: c, pipelineCoverage: cov, overdueCount } = input;
  const cur = c.current, prev = c.previous;
  const out: Insight[] = [];

  // Revenue trend
  const rev = c.deltas.revenue;
  if (rev.pct != null && rev.pct >= 0.1) out.push({ tone: "positive", icon: "TrendingUp", text: `Omsætningen steg ${pctText(rev.pct)} til ${dkk(cur.revenue)} denne ${L}.` });
  else if (rev.pct != null && rev.pct <= -0.1) out.push({ tone: "warning", icon: "TrendingDown", text: `Omsætningen faldt ${pctText(rev.pct)} til ${dkk(cur.revenue)} denne ${L}.` });

  // Churn / net-new MRR
  if (cur.churnedMrr > 0) out.push({ tone: "warning", icon: "AlertTriangle", text: `Du mistede ${dkk(cur.churnedMrr)}/md i churn (${cur.closedLost} kunde${cur.closedLost === 1 ? "" : "r"}) — netto ny MRR ${dkk(cur.netNewMrr)}/md.` });
  else if (cur.mrrAdded > 0) out.push({ tone: "positive", icon: "Sparkles", text: `Ingen churn denne ${L} — ${dkk(cur.mrrAdded)}/md ny MRR tilføjet.` });

  // Win rate
  if (cur.winRate != null && cur.winRate >= 0.5) out.push({ tone: "positive", icon: "Trophy", text: `Stærk win rate: ${pctText(cur.winRate)} (${cur.closedWon}/${cur.closedWon + cur.closedLost} lukkede).` });
  else if (cur.winRate != null && cur.winRate < 0.3 && cur.closedWon + cur.closedLost >= 3) out.push({ tone: "warning", icon: "AlertTriangle", text: `Lav win rate: ${pctText(cur.winRate)} — kig på hvad de tabte deals havde til fælles.` });

  // Pipeline coverage
  if (cov != null && cov < 1) out.push({ tone: "warning", icon: "Filter", text: `Pipelinen dækker kun ${pctText(cov)} af det resterende kvartalsmål — fyld toppen af tragten.` });
  else if (cov != null && cov >= 1.5) out.push({ tone: "positive", icon: "ShieldCheck", text: `Solid pipeline-dækning (${cov.toFixed(1)}×) af resten af kvartalet.` });

  // Avg deal value
  const adv = c.deltas.avgDealValue;
  if (adv.pct != null && adv.pct >= 0.1) out.push({ tone: "positive", icon: "TrendingUp", text: `Gns. dealværdi op ${pctText(adv.pct)} til ${dkk(cur.avgDealValue)}.` });
  else if (adv.pct != null && adv.pct <= -0.15) out.push({ tone: "neutral", icon: "TrendingDown", text: `Gns. dealværdi ned ${pctText(adv.pct)} til ${dkk(cur.avgDealValue)}.` });

  // No new clients
  if (cur.newClients === 0 && prev.newClients > 0) out.push({ tone: "warning", icon: "AlertTriangle", text: `Ingen nye kunder lukket denne ${L} (sidste ${L}: ${prev.newClients}).` });

  // Overdue hygiene
  if (overdueCount > 0) out.push({ tone: "warning", icon: "Clock", text: `${overdueCount} deal${overdueCount === 1 ? "" : "s"} er forbi den forventede lukkedato — følg op.` });

  // Order: warnings, positive, neutral. Cap at 6.
  const rank: Record<Tone, number> = { warning: 0, positive: 1, neutral: 2 };
  const sorted = out.sort((a, b) => rank[a.tone] - rank[b.tone]).slice(0, 6);

  // Sparse-history footnote when there's little to say.
  if (!input.hasHistory && sorted.length < 3) {
    sorted.push({ tone: "neutral", icon: "Hourglass", text: "Bygger historik — indsigterne bliver skarpere efterhånden som de daglige snapshots samler sig." });
  }
  return sorted;
}
