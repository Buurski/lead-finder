// cron-log.ts — persistent logger for Vercel cron runs.
// Uses lib/store so writes go to Vercel KV in production (persistent) and to
// .send_queue/*.jsonl locally. Each cron route wraps its work in
//   await withCronLog("sync-replies", async () => { ... })
// and we record ok/error/duration as one entry in store key "cron-log".
// /api/cron/health reads it back so Mission Control can show the truth.

import { store } from "./store.ts";

export interface CronLogEntry {
  cron: string;
  at: string;
  ok: boolean;
  durationMs: number;
  note?: string;
  error?: string;
  meta?: Record<string, unknown>;
}

const KEY = "cron-log";

export async function appendCronLog(entry: CronLogEntry): Promise<void> {
  try {
    await store.append(KEY, entry);
  } catch (e) {
    // Never let logging take down the actual cron.
    console.error("cron-log append failed:", e);
  }
}

export async function readCronLog(max = 500): Promise<CronLogEntry[]> {
  try {
    const raw = await store.readAll(KEY);
    const arr = Array.isArray(raw) ? raw : [];
    const tail = arr.slice(-max);
    return tail.filter(
      (e): e is CronLogEntry =>
        !!e && typeof e === "object" && typeof (e as CronLogEntry).cron === "string" && typeof (e as CronLogEntry).at === "string",
    );
  } catch {
    return [];
  }
}

export async function withCronLog<T>(
  name: string,
  fn: () => Promise<{ result: T; note?: string; meta?: Record<string, unknown> }>,
): Promise<T> {
  const t0 = Date.now();
  try {
    const { result, note, meta } = await fn();
    await appendCronLog({ cron: name, at: new Date().toISOString(), ok: true, durationMs: Date.now() - t0, note, meta });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendCronLog({ cron: name, at: new Date().toISOString(), ok: false, durationMs: Date.now() - t0, error: msg });
    throw err;
  }
}
