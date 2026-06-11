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
  images: string[]; // usable photos: og:image + inline <img> (or FB profile/cover)
  source: "website" | "facebook" | "jina" | "none";
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

// Facebook page URL → page username/id ("facebook.com/mellowcafe" → "mellowcafe").
// Handles m./www./da-dk. subdomains, profile.php?id=… and trailing junk.
export function facebookPageId(rawUrl: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : "https://" + rawUrl.trim());
    if (!/(^|\.)facebook\.com$/i.test(u.hostname)) return null;
    const idParam = u.searchParams.get("id");
    if (u.pathname.replace(/\/+$/, "").endsWith("profile.php") && idParam && /^\d+$/.test(idParam)) return idParam;
    const seg = u.pathname.split("/").filter(Boolean)[0] ?? "";
    if (!seg || ["pages", "people", "groups", "events", "watch", "marketplace", "login"].includes(seg.toLowerCase())) {
      const second = u.pathname.split("/").filter(Boolean)[1];
      return second && /^[\w.\-]{2,}$/.test(second) ? second : null;
    }
    return /^[\w.\-]{2,}$/.test(seg) ? seg : null;
  } catch {
    return null;
  }
}

// Collect usable photo URLs from a page: og:image first, then inline <img>
// sources. Skips data-URIs, svg, obvious sprites/pixels. Max 8, absolute.
function extractImages(html: string, baseUrl: string, ogImage: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null) => {
    if (!raw) return;
    const abs = absolutize(raw, baseUrl);
    if (!/^https?:\/\//i.test(abs)) return;
    if (/\.svg(\?|$)/i.test(abs) || /sprite|pixel|spacer|blank|tracking/i.test(abs)) return;
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push(abs);
  };
  push(ogImage);
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
    if (out.length >= 8) break;
    if (m[1].startsWith("data:")) continue;
    push(m[1]);
  }
  return out.slice(0, 8);
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
    images: [], source: "none", notes,
  };

  if (!resolvedUrl) {
    notes.push("Ingen gyldig URL — demo bygges på branche-template alene.");
    return base;
  }

  // Facebook page as source: FB serves a login wall to bots, but the <head>
  // keeps og:title / og:description / og:image for crawlers, and the public
  // Graph picture endpoint gives the profile photo without a token.
  const fbId = facebookPageId(resolvedUrl);
  if (fbId) {
    const fbHtml = await fetchText(resolvedUrl, 10000);
    base.source = "facebook";
    if (fbHtml) {
      base.title = metaContent(fbHtml, "property", "og:title") ?? null;
      base.description = metaContent(fbHtml, "property", "og:description") ?? null;
      const og = metaContent(fbHtml, "property", "og:image");
      base.ogImage = og ? absolutize(og, resolvedUrl) : null;
      base.toneSample = base.description;
    }
    const profilePic = `https://graph.facebook.com/${encodeURIComponent(fbId)}/picture?type=large`;
    base.images = [...(base.ogImage ? [base.ogImage] : []), profilePic];
    notes.push(
      base.title
        ? `Facebook-side aflæst (${fbId}): titel/beskrivelse/billede fra og-tags + profilbillede.`
        : `Facebook-siden gav ikke og-tags — bruger kun profilbilledet (${fbId}).`,
    );
    if (!base.title) base.title = name ?? fbId;
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

  const ogImage = ogImageRaw ? absolutize(ogImageRaw, resolvedUrl) : null;
  return {
    inputUrl, slug, resolvedUrl, title, description,
    ogImage,
    favicon, themeColor,
    palette: extractPalette(html, themeColor),
    headings, toneSample,
    images: extractImages(html, resolvedUrl, ogImage),
    source, notes,
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
