// settings.ts — small, file-backed app settings (.send_queue/settings.json,
// gitignored runtime state). Currently the engine cadence: whether the morning
// auto-run is armed, the daily draft count, and the hour. Default is OFF — Lucas
// arms it himself once he trusts draft quality. Strip-safe so the cron route and
// node tooling can import it.

import { store } from "./store.ts";

export interface Settings {
  autoEngine: boolean;
  dailyLimit: number;
  autoEngineHour: number; // local (Europe/Copenhagen) hour, 0-23
  // Idempotency guard for the hourly cron: the Copenhagen date (YYYY-MM-DD) of the
  // last auto-run, so the engine fills the queue at most once per day even if the
  // cron fires more than once during the armed hour. Empty = never run.
  lastAutoRunDate?: string;
  // Hybrid inbox-triage fallback: when armed, a Vercel cron runs the inbox scan
  // ITSELF (costs a little) — but ONLY after the cutoff hour AND only if the Cowork
  // task hasn't already delivered a fresh digest that day. So tokens are spent only
  // when Cowork didn't. Off by default; Lucas arms it.
  autoInboxFallback?: boolean;
  fallbackCutoffHour?: number; // Copenhagen hour after which the fallback may run
  lastInboxFallbackDate?: string;
}

export const DEFAULT_SETTINGS: Settings = {
  autoEngine: false,
  dailyLimit: 12,
  autoEngineHour: 7,
  lastAutoRunDate: "",
  autoInboxFallback: false,
  fallbackCutoffHour: 9,
  lastInboxFallbackDate: "",
};

function normalize(raw: Partial<Settings> | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    autoEngine: Boolean(raw.autoEngine),
    dailyLimit: clampInt(raw.dailyLimit, 1, 25, DEFAULT_SETTINGS.dailyLimit),
    autoEngineHour: clampInt(raw.autoEngineHour, 0, 23, DEFAULT_SETTINGS.autoEngineHour),
    lastAutoRunDate: typeof raw.lastAutoRunDate === "string" ? raw.lastAutoRunDate : "",
    autoInboxFallback: Boolean(raw.autoInboxFallback),
    fallbackCutoffHour: clampInt(raw.fallbackCutoffHour, 0, 23, DEFAULT_SETTINGS.fallbackCutoffHour!),
    lastInboxFallbackDate: typeof raw.lastInboxFallbackDate === "string" ? raw.lastInboxFallbackDate : "",
  };
}

// Current date + hour in Lucas's timezone (Europe/Copenhagen), DST-correct, so the
// cron gate matches the "time (hour)" he set regardless of the UTC server clock.
export function copenhagenNow(now = new Date()): { date: string; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const hour = parseInt(parts.hour, 10) % 24; // "24" → 0 on some platforms
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour };
}

export async function readSettings(): Promise<Settings> {
  try {
    return normalize(await store.get<Partial<Settings>>("settings"));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function writeSettings(patch: Partial<Settings>): Promise<Settings> {
  const clean = normalize({ ...(await readSettings()), ...patch });
  await store.put("settings", clean);
  return clean;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

// "Næste auto-kørsel" as a friendly local string, or null when disabled.
export function nextRunLabel(s: Settings, now = new Date()): string | null {
  if (!s.autoEngine) return null;
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(s.autoEngineHour);
  if (next <= now) next.setDate(next.getDate() + 1);
  const sameDay = next.getDate() === now.getDate();
  const hh = String(s.autoEngineHour).padStart(2, "0");
  return `${sameDay ? "i dag" : "i morgen"} ${hh}:00`;
}
