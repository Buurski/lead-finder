// history.ts — the daily-snapshot layer. PURE + offline-testable: it imports
// only TYPES from sheets.ts (erased at strip time, so googleapis never loads),
// and does its math via finance.ts. The Sheets I/O (getSnapshots/appendSnapshot)
// lives in sheets.ts; the /api/cron/snapshot route wires them together with
// computeSnapshot below.
//
// Why this exists: Clients is current-state only, so past MRR run-rate, churn,
// and live-count can't be reconstructed. One row/day makes those trends real.
// Charts degrade gracefully when history is sparse (see hasHistory).

import type { Client, Snapshot } from "./sheets.ts";
import {
  mrrRunRate, weightedPipeline, liveClientCount, wonCount, setupBooked,
  monthPeriod, isOpen,
} from "./finance.ts";

// Local YYYY-MM-DD for a Date (the route passes a Copenhagen-local Date).
export function dateKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

// Today's snapshot, derived entirely from the Clients rows (+ optional lead
// count). Every field mirrors an aggregator so the snapshot can never disagree
// with what the live pages show.
export function computeSnapshot(clients: Client[], now: Date, leadsTotal?: number): Snapshot {
  const month = monthPeriod(now);
  return {
    date: dateKey(now),
    mrr_runrate: Math.round(mrrRunRate(clients)),
    open_pipeline_weighted: Math.round(weightedPipeline(clients).total),
    open_deal_count: clients.filter(isOpen).length,
    clients_live: liveClientCount(clients),
    new_clients_mtd: wonCount(clients, month),
    setup_revenue_mtd: Math.round(setupBooked(clients, month)),
    leads_total: leadsTotal ?? 0,
  };
}

// ---- reading history (charts / deltas) ------------------------------------

type NumericField = Exclude<keyof Snapshot, "date">;

// Enough points to draw a meaningful trend? Below this, the UI shows a quiet
// "bygger historik" note instead of a lonely dot or a misleading line.
export function hasHistory(snaps: Snapshot[], minPoints = 2): boolean {
  return snaps.length >= minPoints;
}

export interface SeriesPoint { date: string; value: number; }

// One field across all snapshots, oldest-first (sparkline/line input).
export function seriesOf(snaps: Snapshot[], field: NumericField): SeriesPoint[] {
  return [...snaps]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((s) => ({ date: s.date, value: s[field] }));
}

export interface Change { current: number; previous: number; abs: number; pct: number | null; }

// Change in a field between the latest snapshot and the newest one at least
// `days` older. Returns null if there isn't a comparison point that far back,
// so callers can hide a delta rather than invent one. pct is null when the
// baseline is 0 (avoid Infinity / a meaningless %).
export function changeOverDays(snaps: Snapshot[], field: NumericField, days: number): Change | null {
  if (snaps.length < 2) return null;
  const sorted = [...snaps].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sorted[sorted.length - 1];
  const cutoff = new Date(latest.date);
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffKey = dateKey(cutoff);
  // newest snapshot on/before the cutoff date
  let baseline: Snapshot | undefined;
  for (const s of sorted) {
    if (s.date <= cutoffKey) baseline = s;
    else break;
  }
  if (!baseline || baseline.date === latest.date) return null;
  const current = latest[field], previous = baseline[field];
  return { current, previous, abs: current - previous, pct: previous !== 0 ? (current - previous) / previous : null };
}
