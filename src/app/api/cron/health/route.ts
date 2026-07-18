// GET /api/cron/health — last-run status for every registered Vercel cron.
// Reads the persistent cron-log (Vercel KV in prod, .send_queue/cron-log.jsonl
// locally) and returns the latest entry per cron plus a top-level ok flag.
// No auth: cheap polling endpoint for the Mission Control widget.
import { NextResponse } from "next/server";
import { readCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";

interface CronStatus {
  cron: string;
  ok: boolean;
  lastRunAt: string | null;
  durationMs: number | null;
  note: string | null;
  error: string | null;
  ageMinutes: number | null;
  scheduled: string;
}

const SCHEDULE: Record<string, string> = {
  "pre-cleanup":    "30 04 * * *",
  "sync-replies":   "30 04 * * *",
  "engine":         "00 * * * *",
  "ingest-leadgen": "30 06 * * *",
};

function summarize(entries: Awaited<ReturnType<typeof readCronLog>>): { overallOk: boolean; crons: CronStatus[] } {
  const latest = new Map<string, typeof entries[number]>();
  for (const e of entries) {
    const prev = latest.get(e.cron);
    if (!prev || e.at > prev.at) latest.set(e.cron, e);
  }
  const now = Date.now();
  const crons: CronStatus[] = Object.keys(SCHEDULE).map((name) => {
    const e = latest.get(name);
    if (!e) {
      return { cron: name, ok: false, lastRunAt: null, durationMs: null, note: null,
        error: "aldrig kørt siden log blev tilføjet", ageMinutes: null, scheduled: SCHEDULE[name] };
    }
    return {
      cron: name, ok: e.ok, lastRunAt: e.at, durationMs: e.durationMs,
      note: e.note ?? null, error: e.error ?? null,
      ageMinutes: Math.max(0, Math.round((now - Date.parse(e.at)) / 60_000)),
      scheduled: SCHEDULE[name],
    };
  });
  return { overallOk: crons.every((c) => c.ok), crons };
}

export async function GET() {
  const entries = await readCronLog();
  const { overallOk, crons } = summarize(entries);
  return NextResponse.json({ ok: overallOk, generatedAt: new Date().toISOString(), crons });
}
