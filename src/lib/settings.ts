// settings.ts — small, file-backed app settings (.send_queue/settings.json,
// gitignored runtime state). Currently the engine cadence: whether the morning
// auto-run is armed, the daily draft count, and the hour. Default is OFF — Lucas
// arms it himself once he trusts draft quality. Strip-safe so the cron route and
// node tooling can import it.

import fs from "node:fs";
import path from "node:path";

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

const DIR = path.join(process.cwd(), ".send_queue");
const FILE = path.join(DIR, "settings.json");

export function readSettings(): Settings {
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8"));
    return {
      autoEngine: Boolean(raw.autoEngine),
      dailyLimit: clampInt(raw.dailyLimit, 1, 25, DEFAULT_SETTINGS.dailyLimit),
      autoEngineHour: clampInt(raw.autoEngineHour, 0, 23, DEFAULT_SETTINGS.autoEngineHour),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function writeSettings(patch: Partial<Settings>): Settings {
  const next = { ...readSettings(), ...patch };
  const clean: Settings = {
    autoEngine: Boolean(next.autoEngine),
    dailyLimit: clampInt(next.dailyLimit, 1, 25, DEFAULT_SETTINGS.dailyLimit),
    autoEngineHour: clampInt(next.autoEngineHour, 0, 23, DEFAULT_SETTINGS.autoEngineHour),
  };
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(clean, null, 2), "utf-8");
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
