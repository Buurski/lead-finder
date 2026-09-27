// experiments.ts — "Tests" under Pipeline: idéer Lucas vil afprøve hos Kinly selv.
// Ét JSON-dokument i store.ts (samme mønster som competitors.ts/seo-signals.ts —
// lav skrivevolumen, ingen migration). Livsløb:
//   vurderes → (Hermes: Jev-review) → droppet | (Hermes: plan) → klar
//   klar → (menneske: Start test) → tester → (Hermes: baseline, så resultat) → resultat
//   resultat → (menneske) → beholdt | afvist
// Kun mennesker kan starte, beholde, afvise og slette. Agent-funktionerne herunder
// kan aldrig sætte beholdt/afvist — det er hele pointen med opdelingen.
import { randomUUID } from "node:crypto";
import { store } from "../store.ts";
import { CompetitorInputError, bool, enumOf, int, isoDate, noUnknownKeys, num, obj, str } from "./competitors.ts";
import { candidates, googleGscQuery, noAccess, type GscFilter, type GscQuery } from "./gsc.ts";
import type { GeoRun } from "./seo-signals.ts";

export type ExperimentStatus = "vurderes" | "droppet" | "klar" | "tester" | "resultat" | "beholdt" | "afvist";
export type MetricType = "gsc_page" | "gsc_query" | "geo" | "manuel";
export type OutcomeVerdict = "behold" | "drop" | "uklart";
export const METRIC_TYPES = ["gsc_page", "gsc_query", "geo", "manuel"] as const;

export interface ExperimentSource { kind: string; url?: string; competitor?: string; from: "konkurrent" | "seo" }
export interface ReviewScore { navn: string; rating: number; conf: number }
export interface ExperimentReview { at: string; scores: ReviewScore[]; verdict: "test" | "drop"; reason: string }
/** council = Hermes' dyre model (gpt-6-sol) med 5 råd + Google-research; notes er rådenes korte domme. */
export interface ExperimentPlan {
  hypothesis: string;
  change: string;
  metric: { type: MetricType; target: string };
  days: number;
  success: string;
  council?: { model: string; notes: string[] };
}
/** Én måling. GSC-tal for et vindue, eller AI-søgningens svar (mentioned). note = hvorfor der ikke kunne måles. */
export interface Measurement {
  at: string;
  window?: { start: string; end: string };
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number | null;
  mentioned?: boolean;
  note?: string;
}
export interface Experiment {
  id: string;
  title: string;
  detail: string;
  source: ExperimentSource;
  createdBy: string;
  createdAt: string;
  status: ExperimentStatus;
  review?: ExperimentReview;
  plan?: ExperimentPlan;
  test?: { startedAt: string; endsAt: string; baseline?: Measurement; result?: Measurement };
  outcome?: { at: string; verdict: OutcomeVerdict; summary: string };
}

const KEY = "experiments/list";
const DONE: ExperimentStatus[] = ["droppet", "beholdt", "afvist"];
export const MAX_ACTIVE = 50;
const MAX_DONE = 100;
const DAY_MS = 86_400_000;
// 14 dage: Kinlys ugevolumen i Search Console er lille — én uge giver mest "uklart" (Lucas 27/9).
export const TEST_DAYS = 14;

const isActive = (e: Experiment) => !DONE.includes(e.status);

// ponytail: læs-ændr-skriv på ét dokument uden lås. Skrivevolumen er et par klik
// om dagen + én natlig kørsel; skift til en tabel hvis to skrivere nogensinde kolliderer.
export async function listExperiments(): Promise<Experiment[]> {
  return (await store.get<{ items: Experiment[] }>(KEY))?.items ?? [];
}
async function saveAll(items: Experiment[]): Promise<void> {
  const done = items.filter((e) => !isActive(e)).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(MAX_DONE);
  const drop = new Set(done.map((e) => e.id));
  await store.put(KEY, { items: items.filter((e) => !drop.has(e.id)) });
}
async function update(id: unknown, fn: (e: Experiment) => Experiment): Promise<Experiment> {
  const key = str(id, "id", 60, true)!;
  const items = await listExperiments();
  const i = items.findIndex((e) => e.id === key);
  if (i < 0) throw new CompetitorInputError("testen findes ikke");
  items[i] = fn(items[i]);
  await saveAll(items);
  return items[i];
}
function need(e: Experiment, ...status: ExperimentStatus[]): void {
  if (!status.includes(e.status)) throw new CompetitorInputError(`testen står i "${e.status}" — kræver ${status.join(" eller ")}`);
}
function httpUrl(v: unknown, label: string): string | undefined {
  const t = str(v, label, 2000);
  if (!t) return undefined;
  if (!/^https?:\/\/\S+$/i.test(t)) throw new CompetitorInputError(`${label} skal være en http(s)-url`);
  return t;
}

// ---------------------------------------------------------------- menneske-handlinger

export async function createExperiment(raw: unknown, actor: string): Promise<Experiment> {
  const o = obj(raw, "test");
  noUnknownKeys(o, ["title", "detail", "source"], "test");
  const s = obj(o.source, "source");
  noUnknownKeys(s, ["kind", "url", "competitor", "from"], "source");
  const title = str(o.title, "title", 120, true)!;
  const source: ExperimentSource = {
    kind: str(s.kind, "source.kind", 40, true)!,
    from: enumOf(s.from, "source.from", ["konkurrent", "seo"] as const, true)!,
  };
  const url = httpUrl(s.url, "source.url");
  const competitor = str(s.competitor, "source.competitor", 120);
  if (url) source.url = url;
  if (competitor) source.competitor = competitor;

  const items = await listExperiments();
  // Dobbeltklik / samme fund fra to sider: returnér den der allerede kører.
  const same = items.find((e) => isActive(e) && e.title.toLowerCase() === title.toLowerCase());
  if (same) return same;
  if (items.filter(isActive).length >= MAX_ACTIVE) throw new CompetitorInputError(`højst ${MAX_ACTIVE} aktive tests — slet eller afslut nogle først`);
  const e: Experiment = {
    id: randomUUID(),
    title,
    detail: str(o.detail, "detail", 1000) ?? "",
    source,
    createdBy: str(actor, "actor", 40) || "delt",
    createdAt: new Date().toISOString(),
    status: "vurderes",
  };
  await saveAll([e, ...items]);
  return e;
}

/** Lucas/Claude har lavet ændringen på kinly.dk — uret starter nu. */
export const startExperiment = (id: unknown, now = new Date()) =>
  update(id, (e) => {
    need(e, "klar");
    return { ...e, status: "tester", test: { startedAt: now.toISOString(), endsAt: new Date(now.getTime() + TEST_DAYS * DAY_MS).toISOString() } };
  });

export const decideExperiment = (id: unknown, decision: "behold" | "drop") =>
  update(id, (e) => {
    need(e, "resultat");
    return { ...e, status: decision === "behold" ? "beholdt" : "afvist" };
  });

export async function deleteExperiment(id: unknown): Promise<void> {
  const key = str(id, "id", 60, true)!;
  const items = await listExperiments();
  if (!items.some((e) => e.id === key)) throw new CompetitorInputError("testen findes ikke");
  await saveAll(items.filter((e) => e.id !== key));
}

// ---------------------------------------------------------------- agent-handlinger (Hermes)

/** Det Hermes skal gøre noget ved: vurderes (review/plan) og tester (baseline/resultat). */
export async function agentQueue(): Promise<Experiment[]> {
  return (await listExperiments()).filter((e) => e.status === "vurderes" || e.status === "tester");
}

export function validateReview(raw: unknown): ExperimentReview {
  const o = obj(raw, "review");
  noUnknownKeys(o, ["scores", "verdict", "reason"], "review");
  if (!Array.isArray(o.scores)) throw new CompetitorInputError("review.scores skal være en liste");
  const scores = o.scores.slice(0, 8).map((v, i) => {
    const l = `review.scores[${i}]`;
    const s = obj(v, l);
    noUnknownKeys(s, ["navn", "rating", "conf"], l);
    const rating = int(s.rating, `${l}.rating`, 1, true)!;
    if (rating > 5) throw new CompetitorInputError(`${l}.rating skal være 1-5`);
    return { navn: str(s.navn, `${l}.navn`, 40, true)!, rating, conf: num(s.conf, `${l}.conf`, 0, 1, true)! };
  });
  return {
    at: new Date().toISOString(),
    scores,
    verdict: enumOf(o.verdict, "review.verdict", ["test", "drop"] as const, true)!,
    reason: str(o.reason, "review.reason", 400, true)!,
  };
}

/** verdict "drop" ⇒ droppet (stille). "test" ⇒ bliver i vurderes til planen er skrevet. */
export const reviewExperiment = (id: unknown, raw: unknown) =>
  update(id, (e) => {
    need(e, "vurderes");
    const review = validateReview(raw);
    return { ...e, review, status: review.verdict === "drop" ? "droppet" : "vurderes" };
  });

export function validatePlan(raw: unknown): ExperimentPlan {
  const o = obj(raw, "plan");
  noUnknownKeys(o, ["hypothesis", "change", "metric", "days", "success", "council"], "plan");
  const m = obj(o.metric, "plan.metric");
  noUnknownKeys(m, ["type", "target"], "plan.metric");
  const type = enumOf(m.type, "plan.metric.type", METRIC_TYPES, true)!;
  const target = str(m.target, "plan.metric.target", 300, type !== "manuel") ?? "";
  if (type === "gsc_page" && !/^https:\/\/(www\.)?kinly\.dk(\/\S*)?$/i.test(target)) {
    throw new CompetitorInputError("plan.metric.target skal være en https://kinly.dk-side ved gsc_page");
  }
  if (o.days !== undefined && o.days !== TEST_DAYS) throw new CompetitorInputError(`plan.days skal være ${TEST_DAYS}`);
  const plan: ExperimentPlan = {
    hypothesis: str(o.hypothesis, "plan.hypothesis", 400, true)!,
    change: str(o.change, "plan.change", 600, true)!,
    metric: { type, target },
    days: TEST_DAYS,
    success: str(o.success, "plan.success", 300, true)!,
  };
  if (o.council !== undefined) {
    const c = obj(o.council, "plan.council");
    noUnknownKeys(c, ["model", "notes"], "plan.council");
    if (!Array.isArray(c.notes)) throw new CompetitorInputError("plan.council.notes skal være en liste");
    plan.council = {
      model: str(c.model, "plan.council.model", 40, true)!,
      notes: c.notes.slice(0, 6).map((n, i) => str(n, `plan.council.notes[${i}]`, 240, true)!),
    };
  }
  return plan;
}

/** Council (dyr model) siger nej efter Jev sagde "test" → droppet med rådets grund. */
export const councilDrop = (id: unknown, rawReason: unknown) =>
  update(id, (e) => {
    need(e, "vurderes");
    if (e.review?.verdict !== "test") throw new CompetitorInputError("council-drop kræver et review med verdict test");
    const reason = str(rawReason, "reason", 360, true)!;
    return { ...e, status: "droppet", review: { ...e.review, verdict: "drop", reason: `Council: ${reason}` } };
  });

export const planExperiment = (id: unknown, raw: unknown) =>
  update(id, (e) => {
    need(e, "vurderes");
    if (e.review?.verdict !== "test") throw new CompetitorInputError("planen kræver et review med verdict test");
    return { ...e, plan: validatePlan(raw), status: "klar" };
  });

export function validateMeasurement(raw: unknown, label: string): Measurement {
  const o = obj(raw, label);
  noUnknownKeys(o, ["at", "window", "clicks", "impressions", "ctr", "position", "mentioned", "note"], label);
  const out: Measurement = { at: isoDate(o.at, `${label}.at`) };
  if (o.window !== undefined) {
    const w = obj(o.window, `${label}.window`);
    noUnknownKeys(w, ["start", "end"], `${label}.window`);
    const day = (v: unknown, l: string) => {
      const t = str(v, l, 10, true)!;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new CompetitorInputError(`${l} skal være YYYY-MM-DD`);
      return t;
    };
    out.window = { start: day(w.start, `${label}.window.start`), end: day(w.end, `${label}.window.end`) };
  }
  const clicks = int(o.clicks, `${label}.clicks`, 0);
  const impressions = int(o.impressions, `${label}.impressions`, 0);
  const ctr = num(o.ctr, `${label}.ctr`, 0, 1);
  const mentioned = bool(o.mentioned, `${label}.mentioned`);
  const note = str(o.note, `${label}.note`, 300);
  if (clicks !== undefined) out.clicks = clicks;
  if (impressions !== undefined) out.impressions = impressions;
  if (ctr !== undefined) out.ctr = ctr;
  if (o.position === null) out.position = null;
  else if (o.position !== undefined) out.position = num(o.position, `${label}.position`, 0, 1000);
  if (mentioned !== undefined) out.mentioned = mentioned;
  if (note) out.note = note;
  return out;
}

export const saveBaseline = (id: unknown, raw: unknown) =>
  update(id, (e) => {
    need(e, "tester");
    if (e.test?.baseline) throw new CompetitorInputError("baseline er allerede gemt");
    return { ...e, test: { ...e.test!, baseline: validateMeasurement(raw, "baseline") } };
  });

/** Hermes' anbefaling + tallene. Status → resultat; Lucas afgør behold/drop. */
export const saveResult = (id: unknown, rawResult: unknown, rawOutcome: unknown) =>
  update(id, (e) => {
    need(e, "tester");
    const o = obj(rawOutcome, "outcome");
    noUnknownKeys(o, ["verdict", "summary"], "outcome");
    const result = rawResult === undefined || rawResult === null ? undefined : validateMeasurement(rawResult, "result");
    return {
      ...e,
      status: "resultat",
      test: { ...e.test!, ...(result ? { result } : {}) },
      outcome: {
        at: new Date().toISOString(),
        verdict: enumOf(o.verdict, "outcome.verdict", ["behold", "drop", "uklart"] as const, true)!,
        summary: str(o.summary, "outcome.summary", 500, true)!,
      },
    };
  });

// ---------------------------------------------------------------- måling (læse-handling for Hermes)

/** Search Console for kinly.dk i ét vindue, filtreret på én side eller én søgning. note = kunne ikke måles. */
export async function measureGsc(q: GscQuery, type: "gsc_page" | "gsc_query", target: string, start: string, end: string): Promise<Measurement> {
  const at = new Date().toISOString();
  const filter: GscFilter = { dimension: type === "gsc_page" ? "page" : "query", operator: "equals", expression: target };
  for (const property of candidates("kinly.dk")) {
    let rows;
    try {
      rows = await q(property, { startDate: start, endDate: end, dimensionFilterGroups: [{ filters: [filter] }] });
    } catch (err) {
      if (noAccess(err)) continue;
      throw err;
    }
    const r = rows[0];
    const clicks = Math.round(r?.clicks ?? 0);
    const impressions = Math.round(r?.impressions ?? 0);
    return {
      at, window: { start, end }, clicks, impressions,
      ctr: impressions ? Math.round((clicks / impressions) * 1000) / 1000 : 0,
      position: r && r.impressions > 0 ? Math.round(r.position * 10) / 10 : null,
    };
  }
  return { at, window: { start, end }, note: "HQ har ikke adgang til kinly.dk i Search Console" };
}

// Tests udskifter GSC-klienten (ingen netværk under node:test).
let gscFactory: () => Promise<GscQuery> = googleGscQuery;
export function __setGscFactory(f: (() => Promise<GscQuery>) | null): void {
  gscFactory = f ?? googleGscQuery;
}
export const measureKinlyGsc = async (type: "gsc_page" | "gsc_query", target: string, start: string, end: string) =>
  measureGsc(await gscFactory(), type, target, start, end);

/** Seneste AI-søgnings-måling af netop det spørgsmål (seo/geo/latest). */
export function measureGeo(geo: GeoRun | null, target: string): Measurement {
  const r = geo?.results.find((x) => x.query.trim().toLowerCase() === target.trim().toLowerCase());
  if (!r) return { at: new Date().toISOString(), note: "spørgsmålet er ikke med i AI-målingen" };
  return { at: r.measuredAt, mentioned: r.mentionedKinly };
}
