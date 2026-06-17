// customer-recon-full.ts — orchestrates a *full* recon for the demo prompt-gen
// flow: the existing single-source reconCustomer() run across the customer's
// public sources (website + optional Google-My-Business/maps URL), merged into
// one fingerprint, with optional manually-pasted Instagram/Facebook notes (we
// never scrape IG; Lucas pastes what he sees). Result is cached under
// `recon-full/<slug>` with a 24h TTL envelope (store has no native KV EX).
//
// Thin on purpose: reconCustomer already owns the SSRF-safe fetch + parsing.
// This layer only fans out, merges, and caches.

import { reconCustomer, slugify, type ReconResult } from "./customer-recon.ts";
import { store } from "./store.ts";

export interface FullReconInput {
  name: string;
  branch: string;
  websiteUrl?: string;
  gmbUrl?: string; // Google Maps / GMB listing URL (public HTML only)
  igNotes?: string; // free-text Lucas pasted from IG/FB he viewed manually
}

export interface FullReconResult extends ReconResult {
  name: string;
  branch: string;
  gmb: ReconResult | null;
  igNotes: string | null;
  sources: string[]; // which public sources contributed
}

const TTL_MS = 24 * 60 * 60 * 1000;

interface Envelope {
  fetchedAt: number;
  data: FullReconResult;
}

function cacheKey(slug: string): string {
  return `recon-full/${slug}`;
}

// WordPress Gutenberg + common page-builder DEFAULT palette swatches. These show
// up in nearly every WP site's inline CSS and are NOT the brand's real colours —
// they poisoned several E2E recons (barber/nail/frisør all surfaced #f78da7 etc).
// Learned 2026-06-16 across 6 demo builds. Filtered at the source.
const WP_DEFAULT_HEX = new Set([
  "#abb8c3", "#f78da7", "#cf2e2e", "#00d084", "#ff6900", "#fcb900",
  "#2ea3f2", "#0693e3", "#3897f0", "#9b51e0", "#7bdcb5", "#8ed1fc",
  "#eeeeee", "#f4f4f4", "#f7f7f7", "#313131",
]);

// Merge a secondary recon (gmb) into the primary (website): primary wins on
// scalar fields, images/palette are unioned, notes concatenated. Drops the
// WordPress-default swatches so the brand's real colours surface first.
function merge(primary: ReconResult, gmb: ReconResult | null): {
  palette: string[];
  images: string[];
  notes: string[];
} {
  const palette = [...new Set([...primary.palette, ...(gmb?.palette ?? [])])]
    .filter((c) => !WP_DEFAULT_HEX.has(c.toLowerCase()))
    .slice(0, 6);
  const images = [...new Set([...primary.images, ...(gmb?.images ?? [])])].slice(0, 10);
  const notes = [...primary.notes, ...(gmb?.notes ?? [])];
  return { palette, images, notes };
}

export async function reconFull(input: FullReconInput): Promise<FullReconResult> {
  const slug = slugify(input.name || input.websiteUrl || "kunde");

  // Fan out the two HTML sources in parallel. Either can fail to a partial.
  const [web, gmb] = await Promise.all([
    reconCustomer(input.websiteUrl || input.name, input.name),
    input.gmbUrl ? reconCustomer(input.gmbUrl, input.name) : Promise.resolve(null),
  ]);

  const { palette, images, notes } = merge(web, gmb);
  const sources: string[] = [];
  if (web.source !== "none") sources.push(web.source);
  if (gmb && gmb.source !== "none") sources.push("gmb:" + gmb.source);
  if (input.igNotes?.trim()) sources.push("ig-notes");

  const result: FullReconResult = {
    ...web,
    slug,
    name: input.name,
    branch: input.branch,
    palette,
    images,
    notes,
    gmb,
    // R2 council HIGH: igNotes is user-pasted free text → fenced as data later,
    // but strip the worst injection lead-ins here at the source too.
    igNotes: input.igNotes ? input.igNotes.trim().replace(/```+/g, "ʼʼʼ").replace(/^=+\s*(BEGIN|END)/gim, "[stripped]").slice(0, 600) || null : null,
    sources,
  };

  await saveReconFull(result); // best-effort cache write
  return result;
}

export async function saveReconFull(result: FullReconResult): Promise<string> {
  const key = cacheKey(result.slug);
  try {
    await store.put(key, { fetchedAt: Date.now(), data: result } satisfies Envelope);
  } catch {
    /* cache is best-effort */
  }
  return key;
}

// Returns cached recon if present AND younger than 24h. Stale/missing → null.
export async function loadReconFull(slug: string): Promise<FullReconResult | null> {
  try {
    const env = await store.get<Envelope>(cacheKey(slug));
    if (!env || typeof env.fetchedAt !== "number") return null;
    if (Date.now() - env.fetchedAt > TTL_MS) return null;
    return env.data;
  } catch {
    return null;
  }
}
