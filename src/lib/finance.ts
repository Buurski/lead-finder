// finance.ts — the Økonomi aggregator. Pure + strip-safe (no googleapis, no
// network) so the node CLI can import the .ts directly and the offline tests
// run without credentials. The page passes in the Clients-tab rows (each row is
// a "deal") plus the current quarter's target; every number here is DERIVED —
// nothing is hand-entered. When a client's stage/fees change in Sheets, these
// recompute automatically because they read the same source.
//
// Money fields reuse the existing Clients columns: monthlyFee → mrr,
// setupFee → setup_fee. The new deal columns (stage, won_date, expected_close…)
// are optional; older rows with none of them still parse via the
// websiteStatus → stage fallback below.

// A deal is any object shaped like a Clients-tab row. `Client` from sheets.ts
// satisfies this structurally, so the page passes getClients() straight in;
// tests pass plain literals. Every field is optional with a safe default.
export interface DealInput {
  name?: string;
  monthlyFee?: string | number;
  setupFee?: string | number;
  stage?: string;
  websiteStatus?: string;
  wonDate?: string;       // YYYY-MM-DD
  expectedClose?: string; // YYYY-MM-DD
  owner?: string;
  source?: string;
  package?: string;
}

export type Stage =
  | "lead" | "contacted" | "engaged" | "concept" | "offer" | "negotiation"
  | "won" | "delivering" | "live" | "lost";

// Win-probability for OPEN deals. Keys here ARE the open-pipeline stages; any
// stage not in this map is closed (won/delivering/live) or dead (lost).
export const STAGE_PROB: Record<string, number> = {
  lead: 0.05,
  contacted: 0.10,
  engaged: 0.25,
  concept: 0.45,
  offer: 0.60,
  negotiation: 0.75,
};

export const OPEN_STAGES: Stage[] = ["lead", "contacted", "engaged", "concept", "offer", "negotiation"];

// MRR run-rate counts only truly recurring clients. "retainer" isn't a formal
// stage but is accepted defensively in case a row uses it.
const RUN_RATE_STAGES = new Set(["live", "retainer"]);

// Danish labels for the pipeline card (open stages).
export const STAGE_LABELS_DA: Record<string, string> = {
  lead: "Lead",
  contacted: "Kontaktet",
  engaged: "Engageret",
  concept: "Koncept sendt",
  offer: "Tilbud ude",
  negotiation: "Forhandling",
  won: "Vundet",
  delivering: "Leverer",
  live: "Live",
  lost: "Tabt",
};

// ---- primitives -----------------------------------------------------------

// Parse a fee that may be "5.000", "1.234,56", " 545 kr", a number, or blank.
// Mirrors the da-DK conventions normalizeFeeInput handles on write. Never throws.
export function num(v: string | number | undefined | null): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (!v) return 0;
  let s = String(v).trim().replace(/kr.*/i, "").replace(/\s/g, "");
  // If both separators appear, the LAST one is the decimal sep (da-DK: "1.234,56").
  if (s.includes(".") && s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/\.\d{3}(\D|$)/.test("." + s)) s = s.replace(/\./g, ""); // "5.000" thousands
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const mrrOf = (d: DealInput) => num(d.monthlyFee);
const setupOf = (d: DealInput) => num(d.setupFee);

// Resolve a deal's stage. Explicit `stage` wins; otherwise fall back from the
// legacy websiteStatus so existing rows (no stage set yet) still render.
export function stageOf(d: DealInput): Stage {
  const raw = (d.stage || "").trim().toLowerCase();
  if (raw && (raw in STAGE_PROB || ["won", "delivering", "live", "lost", "retainer"].includes(raw))) {
    return (raw === "retainer" ? "live" : raw) as Stage;
  }
  switch ((d.websiteStatus || "").trim().toLowerCase()) {
    case "live": return "live";
    case "in progress": return "delivering";
    case "demo": return "concept";
    default: return "lead";
  }
}

export const isOpen = (d: DealInput): boolean => stageOf(d) in STAGE_PROB;

// ---- date / period helpers ------------------------------------------------

export interface Period { start: Date; end: Date; }

function parseDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function inPeriod(s: string | undefined, p: Period): boolean {
  const d = parseDate(s);
  if (!d) return false;
  return d >= startOfDay(p.start) && d <= endOfDay(p.end);
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

// Monday-start week (da-DK).
export function weekPeriod(now: Date): Period {
  const day = (now.getDay() + 6) % 7; // Mon=0 … Sun=6
  const start = startOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - day));
  const end = endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
  return { start, end };
}
export function monthPeriod(now: Date): Period {
  return {
    start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}
export function yearPeriod(now: Date): Period {
  return {
    start: startOfDay(new Date(now.getFullYear(), 0, 1)),
    end: endOfDay(new Date(now.getFullYear(), 11, 31)),
  };
}

export interface Quarter { key: string; start: Date; end: Date; }
export function quarterOf(now: Date): Quarter {
  const q = Math.floor(now.getMonth() / 3); // 0..3
  const startMonth = q * 3;
  const start = startOfDay(new Date(now.getFullYear(), startMonth, 1));
  const end = endOfDay(new Date(now.getFullYear(), startMonth + 3, 0));
  return { key: `${now.getFullYear()}-Q${q + 1}`, start, end };
}

// ---- core aggregates ------------------------------------------------------

export function mrrRunRate(deals: DealInput[]): number {
  return deals.reduce((sum, d) => (RUN_RATE_STAGES.has(stageOf(d)) ? sum + mrrOf(d) : sum), 0);
}

export interface StageBar { stage: Stage; label: string; count: number; value: number; }

// Weighted pipeline value over OPEN deals: (setup + 12*mrr) * P(stage).
export function weightedPipeline(deals: DealInput[]): { total: number; byStage: StageBar[] } {
  const byStage: StageBar[] = OPEN_STAGES.map((stage) => {
    const rows = deals.filter((d) => stageOf(d) === stage);
    const value = rows.reduce((s, d) => s + (setupOf(d) + 12 * mrrOf(d)) * STAGE_PROB[stage], 0);
    return { stage, label: STAGE_LABELS_DA[stage], count: rows.length, value };
  });
  return { total: byStage.reduce((s, b) => s + b.value, 0), byStage };
}

// Projected end-of-quarter MRR: run-rate + expected new recurring from OPEN
// deals whose expected_close lands on/before the quarter end.
export function projectedEoqMrr(deals: DealInput[], quarterEnd: Date): number {
  const base = mrrRunRate(deals);
  const add = deals.reduce((sum, d) => {
    if (!isOpen(d)) return sum;
    const ec = parseDate(d.expectedClose);
    if (!ec || ec > endOfDay(quarterEnd)) return sum;
    return sum + mrrOf(d) * STAGE_PROB[stageOf(d)];
  }, 0);
  return base + add;
}

export const annualised = (runRate: number): number => runRate * 12;

// Revenue in a period = setup_fee won in the period + current MRR run-rate.
export function periodRevenue(deals: DealInput[], p: Period): number {
  const setup = deals.reduce((s, d) => (inPeriod(d.wonDate, p) ? s + setupOf(d) : s), 0);
  return setup + mrrRunRate(deals);
}

// Setup booked per month for the last `months` months (the trend bars).
export interface MonthBar { key: string; label: string; value: number; }
const MONTHS_DA = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export function bookedPerMonth(deals: DealInput[], now: Date, months = 6): MonthBar[] {
  const out: MonthBar[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const p: Period = { start: startOfDay(d), end: endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
    const value = deals.reduce((s, x) => (inPeriod(x.wonDate, p) ? s + setupOf(x) : s), 0);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTHS_DA[d.getMonth()], value });
  }
  return out;
}

// Count of deals won (won_date) within a period.
export function wonCount(deals: DealInput[], p: Period): number {
  return deals.reduce((n, d) => (inPeriod(d.wonDate, p) ? n + 1 : n), 0);
}

// ---- pace -----------------------------------------------------------------

export type PaceStatus = "on-pace" | "slightly-behind" | "behind";
export interface Pace { expected: number; delta: number; status: PaceStatus; frac: number; }

// Where you should be today vs where you are. delta = actual − target*elapsed.
export function pace(actual: number, target: number, now: Date, q: Quarter): Pace {
  const total = q.end.getTime() - q.start.getTime();
  const elapsed = Math.min(Math.max(now.getTime() - q.start.getTime(), 0), total);
  const frac = total > 0 ? elapsed / total : 0;
  const expected = target * frac;
  const delta = actual - expected;
  const status: PaceStatus = delta >= 0 ? "on-pace" : delta >= -1 ? "slightly-behind" : "behind";
  return { expected, delta, status, frac };
}

// ---- suggested target (trailing 3 full months + growth) -------------------

export interface Suggestion {
  enoughHistory: boolean;
  monthsOfData: number;
  avgWonPerMonth: number;
  avgMrrAddedPerMonth: number;
  suggestedClients: number;
  suggestedMrrAdded: number;
  growthFactor: number;
}

export function suggestTarget(deals: DealInput[], now: Date, growthFactor = 1.15): Suggestion {
  // The 3 full months BEFORE the current (partial) month.
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = startOfDay(new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 3, 1));
  const end = endOfDay(new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth(), 0));
  const window: Period = { start, end };

  const wonRows = deals.filter((d) => inPeriod(d.wonDate, window));
  const monthsWithWins = new Set(wonRows.map((d) => (d.wonDate || "").slice(0, 7))).size;

  const avgWonPerMonth = wonRows.length / 3;
  const avgMrrAddedPerMonth = wonRows.reduce((s, d) => s + mrrOf(d), 0) / 3;

  return {
    enoughHistory: monthsWithWins >= 2,
    monthsOfData: monthsWithWins,
    avgWonPerMonth,
    avgMrrAddedPerMonth,
    suggestedClients: Math.round(avgWonPerMonth * 3 * growthFactor),
    suggestedMrrAdded: Math.round(avgMrrAddedPerMonth * 3 * growthFactor),
    growthFactor,
  };
}

// ---- formatting -----------------------------------------------------------

export function dkk(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr`;
}

// ---- one-shot bundle for the page -----------------------------------------

export interface Target {
  quarter: string;
  target_new_clients: number;
  target_setup_revenue: number;
  target_mrr_added: number;
  weekly_outreach_floor: number;
  annual_mrr_goal: number;
}

export interface FinanceSnapshot {
  quarter: Quarter;
  runRate: number;
  projectedEoqMrr: number;
  annualised: number;
  pipeline: { total: number; byStage: StageBar[] };
  revenue: { week: number; month: number; year: number };
  booked: MonthBar[];
  newClientsThisQuarter: number;
  pace: Pace;
  suggestion: Suggestion;
}

export function computeFinance(
  deals: DealInput[],
  target: Target,
  now: Date = new Date(),
  growthFactor = 1.15,
): FinanceSnapshot {
  const quarter = quarterOf(now);
  const runRate = mrrRunRate(deals);
  const newClientsThisQuarter = wonCount(deals, quarter);
  return {
    quarter,
    runRate,
    projectedEoqMrr: projectedEoqMrr(deals, quarter.end),
    annualised: annualised(runRate),
    pipeline: weightedPipeline(deals),
    revenue: {
      week: periodRevenue(deals, weekPeriod(now)),
      month: periodRevenue(deals, monthPeriod(now)),
      year: periodRevenue(deals, yearPeriod(now)),
    },
    booked: bookedPerMonth(deals, now, 6),
    newClientsThisQuarter,
    pace: pace(newClientsThisQuarter, target.target_new_clients, now, quarter),
    suggestion: suggestTarget(deals, now, growthFactor),
  };
}
