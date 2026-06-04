// spend-log.ts — transparent AI cost tracking. Every ai.generate() call appends
// one JSON line to .send_queue/spend.jsonl. Token counts are estimated from text
// length (≈4 chars/token) so we never depend on a specific provider response
// shape; cost is derived from per-model price constants. This is a "watch the
// meter / catch a runaway" tool, not an invoice — the UI labels it an estimate.

import { store } from "./store.ts";

// USD per 1M tokens (input/output), approximate 2026 list prices.
export const MODEL_PRICES: Record<string, { in: number; out: number }> = {
  opus: { in: 15, out: 75 },
  sonnet: { in: 3, out: 15 },
  haiku: { in: 0.8, out: 4 },
};
export const USD_TO_DKK = 6.9;
export const DAILY_ALERT_DKK = 50;

export interface SpendEntry {
  ts: string;
  task: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  estimated: boolean;
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

function priceFor(model: string): { in: number; out: number } {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return MODEL_PRICES.opus;
  if (m.includes("haiku")) return MODEL_PRICES.haiku;
  return MODEL_PRICES.sonnet; // default
}

export function costUSD(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.in + (outputTokens / 1_000_000) * p.out;
}

// Best-effort append. Never throws into the AI path. Async (store-backed) — the
// caller (ai.ts) fires it and does not await.
export async function logSpend(e: Omit<SpendEntry, "costUSD" | "ts"> & { ts?: string }): Promise<void> {
  try {
    const entry: SpendEntry = {
      ts: e.ts ?? new Date().toISOString(),
      task: e.task,
      model: e.model,
      provider: e.provider,
      inputTokens: e.inputTokens,
      outputTokens: e.outputTokens,
      costUSD: costUSD(e.model, e.inputTokens, e.outputTokens),
      estimated: e.estimated,
    };
    await store.append("spend", entry);
  } catch {
    /* logging must never break a generation */
  }
}

export async function readSpend(): Promise<SpendEntry[]> {
  try {
    const rows = (await store.readAll("spend")) as SpendEntry[];
    return rows.filter((e) => e && typeof e.costUSD === "number");
  } catch {
    return [];
  }
}

// Async convenience for callers that want the rolled-up summary from storage.
export async function loadSpendSummary(): Promise<SpendSummary> {
  return summarize(await readSpend());
}

export interface SpendBucket {
  key: string; // date / model
  costUSD: number;
  calls: number;
}
export interface SpendSummary {
  totalUSD: number;
  totalDKK: number;
  todayUSD: number;
  todayDKK: number;
  alert: boolean;
  byModel: SpendBucket[];
  byDay: SpendBucket[];
  top: SpendEntry[];
  estimated: boolean;
}

export function summarize(entries: SpendEntry[]): SpendSummary {
  const today = new Date().toISOString().slice(0, 10);
  const byModel = new Map<string, SpendBucket>();
  const byDay = new Map<string, SpendBucket>();
  let total = 0;
  let todayUSD = 0;

  for (const e of entries) {
    total += e.costUSD;
    const day = e.ts.slice(0, 10);
    if (day === today) todayUSD += e.costUSD;

    const modelKey = shortModel(e.model);
    const m = byModel.get(modelKey) ?? { key: modelKey, costUSD: 0, calls: 0 };
    m.costUSD += e.costUSD; m.calls += 1; byModel.set(modelKey, m);

    const d = byDay.get(day) ?? { key: day, costUSD: 0, calls: 0 };
    d.costUSD += e.costUSD; d.calls += 1; byDay.set(day, d);
  }

  const top = [...entries].sort((a, b) => b.costUSD - a.costUSD).slice(0, 10);
  const todayDKK = todayUSD * USD_TO_DKK;

  return {
    totalUSD: total,
    totalDKK: total * USD_TO_DKK,
    todayUSD,
    todayDKK,
    alert: todayDKK > DAILY_ALERT_DKK,
    byModel: [...byModel.values()].sort((a, b) => b.costUSD - a.costUSD),
    byDay: [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key)),
    top,
    estimated: entries.some((e) => e.estimated),
  };
}

function shortModel(model: string): string {
  const m = (model || "").toLowerCase();
  if (m.includes("opus")) return "Opus";
  if (m.includes("sonnet")) return "Sonnet";
  if (m.includes("haiku")) return "Haiku";
  return model || "ukendt";
}
