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

export interface HermesCronJobWithRuns extends HermesCronJob {
  runs: HermesCronRun[];
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

// Client-safe fetch: kalder lead-systemets egen route (som håndterer HMAC server-side).
// Sender Basic Auth credentials hvis vi er i browseren (Vercel Password Protection).
// Brug IKKE denne fra server-context (brug lib/hermes.ts i stedet).
export async function fetchHermesCronRuns(limit = 5): Promise<HermesCronJobWithRuns[]> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (typeof window !== "undefined") {
      headers["Authorization"] = "Basic " + btoa("LucasCharlie:BuurNielsen");
    }
    const r = await fetch(`/api/hermes/cron/runs?limit=${limit}`, { cache: "no-store", headers });
    if (!r.ok) return [];
    const d = await r.json();
    if (!d?.ok || !Array.isArray(d.jobs)) return [];
    return d.jobs as HermesCronJobWithRuns[];
  } catch {
    return [];
  }
}
