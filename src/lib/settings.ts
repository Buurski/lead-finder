// settings.ts — small, file-backed app settings (.send_queue/settings.json,
// gitignored runtime state). Currently the engine cadence: whether the morning
// auto-run is armed, the daily draft count, and the hour. Default is OFF — Lucas
// arms it himself once he trusts draft quality. Strip-safe so the cron route and
// node tooling can import it.

import { store } from "./store.ts";

export interface Settings {
  autoEngine: boolean;
  dailyLimit: number;
  autoEngineHour: number; // local hour, 0-23
}

export const DEFAULT_SETTINGS: Settings = {
  autoEngine: false,
  dailyLimit: 12,
  autoEngineHour: 7,
};

function normalize(raw: Partial<Settings> | null): Settings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  return {
    autoEngine: Boolean(raw.autoEngine),
    dailyLimit: clampInt(raw.dailyLimit, 1, 25, DEFAULT_SETTINGS.dailyLimit),
    autoEngineHour: clampInt(raw.autoEngineHour, 0, 23, DEFAULT_SETTINGS.autoEngineHour),
  };
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
