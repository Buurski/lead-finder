// cron-log.ts — tiny append-only logger for Vercel cron runs.
// Each cron route wraps its work in withCronLog("name", async () => { ... })
// and we record ok/error/duration as one JSONL line in .send_queue/cron-log.jsonl.
// /api/cron/health reads it back so Mission Control can show the truth.

import fs from "node:fs";
import path from "node:path";

interface CronLogEntry {
  cron: string;
  at: string;
  ok: boolean;
  durationMs: number;
  note?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

const FILE = path.join(process.cwd(), ".send_queue", "cron-log.jsonl");

function ensureFile(): void {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, "");
}

export function appendCronLog(entry: CronLogEntry): void {
  try {
    ensureFile();
    fs.appendFileSync(FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (e) {
    // Never let logging take down the actual cron.
    console.error("cron-log append failed:", e);
  }
}

export async function withCronLog<T>(
  name: string,
  fn: () => Promise<{ result: T; note?: string; meta?: Record<string, unknown> }>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const { result, note, meta } = await fn();
    appendCronLog({ cron: name, at: new Date().toISOString(), ok: true, durationMs: Date.now() - t0, note, meta });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    appendCronLog({ cron: name, at: new Date().toISOString(), ok: false, durationMs: Date.now() - t0, error: msg });
    throw err;
  }
}
