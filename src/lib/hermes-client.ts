// hermes-client.ts — client-safe typer + tynd fetch-wrapper.
// Server-only funktioner (HMAC, session storage) er i lib/hermes.ts.
// Importer HER for at bruge typer eller for at hente runs fra en client component.

export type HermesProfile = "default" | "lucas" | "charlie";
export const HERMES_PROFILES: HermesProfile[] = ["default", "lucas", "charlie"];

export interface HermesCronJob {
  id: string;
  name?: string;
  prompt?: string;
  schedule_display?: string;
  enabled?: boolean;
  state?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  deliver?: string | null;
  profile?: string | null;
}

export interface HermesCronRun {
  file: string;
  timestamp: string;
  size: number;
  status: "ok" | "error";
  error: string;
  key_points?: string[];
}

export interface HermesSessionMeta {
  id: string;
  profile: HermesProfile;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface HermesMessage {
  role: "you" | "hermes";
  text: string;
  ts: string;
}

// ---------- OS-drift: kanban (Hermes' kort) + synlighed (GA4/GSC) ----------

export interface HermesKanbanCard {
  id: string;
  title: string;
  status: string;
  assignee: string | null;
  blockKind: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

/** Read-only overblik over Hermes' kanban.db — samme tal som OS-boardet. */
export interface HermesKanbanSummary {
  ok: boolean;
  note?: string;
  generatedAt?: string;
  total?: number;
  counts?: Record<string, number>;
  active?: HermesKanbanCard[];
  blocked?: HermesKanbanCard[];
  doneLast7d?: number;
  perPerson?: Record<string, number>;
}

export interface SynlighedGa4Totals {
  users: number;
  sessions: number;
  views: number;
}

export interface SynlighedGa4 {
  status: "ok" | "fejl";
  period?: string;
  current?: { totals: SynlighedGa4Totals; daily: (SynlighedGa4Totals & { date: string })[] } | null;
  previous?: { totals: SynlighedGa4Totals } | null;
}

export interface SynlighedGsc {
  status: "ok" | "ikke-koblet";
  note?: string;
  period?: string;
  totals?: { clicks: number; impressions: number; ctr: number; position: number } | null;
  topQueries?: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  topPages?: { page: string; clicks: number; impressions: number; position: number }[];
}

export interface SynlighedSite {
  name: string;
  ga4: SynlighedGa4;
  gsc: SynlighedGsc;
}

/** Snapshot fra synlighed_snapshot.py (GA4 via Composio; GSC hvis forbundet). */
export interface SynlighedSnapshot {
  ok: boolean;
  note?: string;
  generatedAt?: string;
  period?: { start: string; end: string };
  sites?: Record<string, SynlighedSite>;
}

export interface HermesBusinessLoop {
  id: string;
  name: string;
  profile: string;
  schedule: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  nextRunAt: string | null;
}

export interface HermesUsageSummary {
  generatedAt: string;
  current24h: { tokens: number; runs: number };
  previous24h: { tokens: number; runs: number };
  changePct: number | null;
  jobs: { agent: number; monitor: number; noAgent: number; paused: number };
  topCurrent: { id: string; name: string; profile: string; tokens: number } | null;
  businessLoops: HermesBusinessLoop[];
}

export function businessLoopState(
  loop: HermesBusinessLoop,
  nowMs = Date.now(),
): "ok" | "error" | "waiting" | "late" {
  if (loop.lastStatus === "error") return "error";
  if (!loop.lastRunAt || !loop.lastStatus) return "waiting";
  const next = loop.nextRunAt ? Date.parse(loop.nextRunAt) : Number.NaN;
  if (Number.isFinite(next) && next + 60 * 60 * 1000 < nowMs) return "late";
  return "ok";
}

export function describeUsageChange(changePct: number | null): {
  label: string;
  state: "saving" | "rising" | "neutral";
} {
  if (changePct == null) return { label: "sammenligning kommer efter 48 timer", state: "neutral" };
  const pct = Math.round(Math.abs(changePct));
  if (changePct < 0) return { label: `${pct}% lavere end forrige døgn`, state: "saving" };
  if (changePct > 0) return { label: `${pct}% højere end forrige døgn`, state: "rising" };
  return { label: "samme niveau som forrige døgn", state: "neutral" };
}

export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} mio.`;
  }
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000).toLocaleString("da-DK")}.000`;
  return tokens.toLocaleString("da-DK");
}
