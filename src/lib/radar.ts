// radar.ts — the AI-Radar read model. A daily Cowork task curates the most relevant
// new AI things (skills, tools, techniques) from Latent Space / ai.engineer / Karpathy /
// tech-X / GitHub, scores each for fit to THIS project, and writes data/ai-radar.json to
// the vault. The app reads it remote-first (same artifact channel as lead-gen/inbox).
// Read-only here; the app never scrapes the sources itself.

import { readVaultJson } from "./vault.ts";

export interface RadarItem {
  title: string;
  source: string;   // "Latent Space" | "ai.engineer" | "Karpathy" | "X" | "GitHub" | …
  url: string;
  why: string;      // one line: why it matters for OUR agentic-OS / lead-system
  tags: string[];
  score: number;    // 0–100 relevance to this project (Cowork-assigned)
  date?: string;    // ISO published date
}
export interface RadarFeed {
  at: string;       // when the radar was generated
  items: RadarItem[];
}

const norm = (it: Partial<RadarItem>): RadarItem | null => {
  const title = (it.title || "").toString().trim();
  const url = (it.url || "").toString().trim();
  if (!title || !url) return null;
  return {
    title,
    source: (it.source || "ukendt").toString(),
    url,
    why: (it.why || "").toString().slice(0, 240),
    tags: Array.isArray(it.tags) ? it.tags.filter((t) => typeof t === "string").slice(0, 6) : [],
    score: Math.max(0, Math.min(100, Math.round(Number(it.score) || 0))),
    date: typeof it.date === "string" ? it.date : undefined,
  };
};

export async function readRadar(): Promise<RadarFeed | null> {
  const raw = await readVaultJson<RadarFeed>("data/ai-radar.json").catch(() => null);
  if (!raw || !Array.isArray(raw.items)) return raw && typeof raw.at === "string" ? { at: raw.at, items: [] } : null;
  const items = raw.items.map(norm).filter((x): x is RadarItem => x != null).sort((a, b) => b.score - a.score);
  return { at: typeof raw.at === "string" ? raw.at : "", items };
}
