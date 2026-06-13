// GET /api/cron/health — last-run status for every registered Vercel cron.
// Reads the JSONL log each cron route appends on success/failure and returns
// the latest entry per cron, plus a top-level "ok" (false if any failed).
// No auth: cheap polling endpoint for the Mission Control widget.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface CronLogEntry {
  cron: string;
  at: string;
  ok: boolean;
  durationMs: number;
  note?: string;
  error?: string;
}

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
  "pre-cleanup": "30 04 * * *",
  "sync-replies": "45 04 * * *",
  "engine": "00 05 * * *",
};

function logPath(): string {
  return path.join(process.cwd(), ".send_queue", "cron-log.jsonl");
}

function readTail(max = 500): CronLogEntry[] {
  const p = logPath();
  if (!fs.existsSync(p)) return [];
  let raw: string;
  try { raw = fs.readFileSync(p, "utf8"); } catch { return []; }
  const lines = raw.split("\n").filter(Boolean);
  const out: CronLogEntry[] = [];
  for (let i = Math.max(0, lines.length - max); i < lines.length; i++) {
    try {
      const e = JSON.parse(lines[i]);
      if (e && typeof e.cron === "string" && typeof e.at === "string") out.push(e);
    } catch { /* skip malformed */ }
  }
  return out;
}

function summarize(entries: CronLogEntry[]): { overallOk: boolean; crons: CronStatus[] } {
  const latest = new Map<string, CronLogEntry>();
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
  const entries = readTail();
  const { overallOk, crons } = summarize(entries);
  return NextResponse.json({ ok: overallOk, generatedAt: new Date().toISOString(), crons });
}
