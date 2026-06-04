// customer-recon.ts — pull a quick visual + tonal fingerprint of a customer
// from their existing website (or a fallback), so the demo factory can make a
// demo that already feels like *them*.
//
// Deliberately dependency-free: fetch + regex parsing, Chrome UA, with an
// r.jina.ai readability fallback when the raw HTML is JS-only. Apify is used
// ONLY when ENABLE_APIFY=1 (off by default, cost). Everything degrades to a
// partial result rather than throwing — a demo can still be built from the
// branch template alone.

import { store } from "./store.ts";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export interface ReconResult {
  inputUrl: string;
  slug: string;
  resolvedUrl: string | null;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  favicon: string | null;
  themeColor: string | null;
  palette: string[]; // hex colors, most frequent first
  headings: string[];
  toneSample: string | null;
  source: "website" | "jina" | "none";
  notes: string[];
}

export function slugify(s: string): string {
  return (s || "")
    .toLowerCase()
    // Danish letters first — before NFD strips the å ring to a bare "a".
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "kunde";
}

function normalizeUrl(raw: string): string | null {
  if (!raw) return null;
  let u = raw.trim();
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try {
    return new URL(u).href;
  } catch {
    return null;
  }
}

function absolutize(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const re = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
  const m = html.match(re) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, "i"));
  return m ? m[1].trim() : null;
}

function extractPalette(html: string, themeColor: string | null): string[] {
  const counts = new Map<string, number>();
  if (themeColor && /^#?[0-9a-f]{3,6}$/i.test(themeColor)) {
    const h = themeColor.startsWith("#") ? themeColor : "#" + themeColor;
    counts.set(h.toLowerCase(), 100); // weight the declared brand color
  }
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const hex = ("#" + m[1]).toLowerCase();
    if (/^#(fff|000|ffffff|000000)$/.test(hex)) continue; // skip pure b/w noise
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([h]) => h);
}

async function fetchText(url: string, timeoutMs = 9000): Promise<string | null> {
  // Routed through safe-fetch for SSRF guards (private IP block, cloud metadata,
  // response-size cap, DoH-resolution check). See src/lib/safe-fetch.ts.
  const { safeFetchText } = await import("./safe-fetch.ts");
  return safeFetchText(url, {
    timeoutMs,
    headers: { "User-Agent": CHROME_UA },
  });
}

export async function reconCustomer(inputUrl: string, name?: string): Promise<ReconResult> {
  const notes: string[] = [];
  const slug = slugify(name || inputUrl);
  const resolvedUrl = normalizeUrl(inputUrl);

  const base: ReconResult = {
    inputUrl, slug, resolvedUrl, title: null, description: null, ogImage: null,
    favicon: null, themeColor: null, palette: [], headings: [], toneSample: null,
    source: "none", notes,
  };

  if (!resolvedUrl) {
    notes.push("Ingen gyldig URL — demo bygges på branche-template alene.");
    return base;
  }

  const html = await fetchText(resolvedUrl);
  const source: ReconResult["source"] = "website";

  if (!html || html.length < 400) {
    // JS-only or blocked — try a readability proxy for at least text + tone.
    // r.jina.ai is a 3rd-party that processes the URL on its servers (Singapore).
    // Gated behind RECON_ALLOW_JINA=1 for GDPR opt-in; default OFF in production.
    if (process.env.RECON_ALLOW_JINA === "1") {
      const jina = await fetchText("https://r.jina.ai/" + resolvedUrl, 12000);
      if (jina) {
        notes.push("Rå HTML var tynd; brugte r.jina.ai readability-fallback til tekst.");
        base.source = "jina";
        base.toneSample = jina.replace(/\s+/g, " ").trim().slice(0, 600);
        base.headings = (jina.match(/^#{1,3}\s+(.+)$/gm) || []).slice(0, 6).map((l) => l.replace(/^#+\s+/, ""));
        base.title = base.headings[0] ?? null;
        return base;
      }
    }
    notes.push("Kunne ikke hente siden — demo bygges på branche-template alene.");
    return base;
  }

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? stripTags(titleMatch[1]) : null;
  const description = metaContent(html, "name", "description") || metaContent(html, "property", "og:description");
  const ogImageRaw = metaContent(html, "property", "og:image");
  const themeColor = metaContent(html, "name", "theme-color");

  let favicon: string | null = null;
  const iconMatch = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i);
  if (iconMatch) favicon = absolutize(iconMatch[1], resolvedUrl);
  else favicon = absolutize("/favicon.ico", resolvedUrl);

  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)]
    .map((m) => stripTags(m[1]))
    .filter((h) => h.length > 1 && h.length < 90)
    .slice(0, 6);

  const firstP = html.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const toneSample = description || (firstP ? stripTags(firstP[1]).slice(0, 400) : null);

  return {
    inputUrl, slug, resolvedUrl, title, description,
    ogImage: ogImageRaw ? absolutize(ogImageRaw, resolvedUrl) : null,
    favicon, themeColor,
    palette: extractPalette(html, themeColor),
    headings, toneSample, source, notes,
  };
}

// Persist a recon result for later reuse (FS: client-assets/{slug}/recon.json;
// Vercel: KV). Best-effort.
export async function saveRecon(result: ReconResult): Promise<string> {
  const key = `recon/${result.slug}`;
  await store.put(key, result);
  return key;
}

// Read a cached recon result (24h TTL is enforced by the caller).
export async function loadRecon(slug: string): Promise<ReconResult | null> {
  return store.get<ReconResult>(`recon/${slug}`);
}
