// leadgen.ts — the ingest model + last-run store for the lead-gen feed.
//
// The daily Cowork "daily ops" task sources NEW leads (Google Places base +
// self-search on FB/Google/Instagram/web), Opus deep-rates each, keeps the best
// ~30-40, and POSTs them to /api/leads/ingest, which appends them to Sheets. The
// in-app "kør nu" button (Places scrape) ALSO appends to Sheets via /api/scrape.
// SHEETS IS THE FEED'S TRUTH: /api/leads/ingest GET reads Sheets (top contactable
// un-worked leads, composite-ranked) so every source shows up immediately. The
// LeadgenRun stored here is now just "last fetch" metadata for the sublabel — not
// the feed contents. Pure helpers; the route does the Sheets/KV I/O. Strip-safe.

import { store } from "./store.ts";

export interface IngestLead {
  name: string;
  branch?: string;
  city?: string;
  phone?: string;
  website?: string;       // ideally facebook.com/<handle> for FB-only leads
  reviewsCount?: number;
  rating?: number;        // Google stars 0–5
  gap?: string;           // the opportunity: "no online booking", "dated site"…
  fitScore?: number;      // 0–100, the Opus deep-rating
  source?: string;        // "places" | "cowork-opus" | "web-search"…
}

export interface LeadgenItem {
  name: string;
  branch: string;
  city: string;
  fitScore: number;
  gap: string;
  website: string;
  rating: number;
  reviews: number;
  channel?: "email" | "messenger" | "sms" | "none";
}

export interface LeadgenRun {
  at: string;
  source: string;
  ingested: number;
  skipped: number;
  items: LeadgenItem[]; // ranked, best first
}

const RUN_KEY = "leadgen/last-run";

const clamp100 = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
};

/** Keep only entries with a name; coerce/clamp fields. Defensive against a
 *  producer that posts partial/garbage rows. */
export function normalizeIngest(raw: unknown): IngestLead[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === "object" && typeof (r as IngestLead).name === "string" && (r as IngestLead).name.trim()))
    .map((r) => ({
      name: String(r.name).trim(),
      branch: r.branch ? String(r.branch) : "",
      city: r.city ? String(r.city) : "",
      phone: r.phone ? String(r.phone) : "",
      website: r.website ? String(r.website) : "",
      reviewsCount: Number.isFinite(Number(r.reviewsCount)) ? Number(r.reviewsCount) : 0,
      rating: Number.isFinite(Number(r.rating)) ? Number(r.rating) : 0,
      gap: r.gap ? String(r.gap).slice(0, 160) : "",
      fitScore: clamp100(r.fitScore),
      source: r.source ? String(r.source) : "ingest",
    }));
}

/** Split a batch into fresh vs already-known (by lowercased name). */
export function dedupeByName(leads: IngestLead[], existingLower: Set<string>): { fresh: IngestLead[]; skipped: IngestLead[] } {
  const fresh: IngestLead[] = [];
  const skipped: IngestLead[] = [];
  const seen = new Set<string>();
  for (const l of leads) {
    const key = l.name.toLowerCase().trim();
    if (existingLower.has(key) || seen.has(key)) skipped.push(l);
    else { seen.add(key); fresh.push(l); }
  }
  return { fresh, skipped };
}

export async function saveRun(run: LeadgenRun): Promise<void> {
  await store.put(RUN_KEY, run);
}

export async function loadRun(): Promise<LeadgenRun | null> {
  try {
    return await store.get<LeadgenRun>(RUN_KEY);
  } catch {
    return null;
  }
}
