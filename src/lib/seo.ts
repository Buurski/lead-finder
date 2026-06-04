// seo.ts — the SEO/AI-visibility checks behind /seo. Each check is independent
// and degrades to null + a note rather than throwing, so a client card always
// renders something honest. Heavy tooling (Lighthouse) is an OPTIONAL dynamic
// import — if the package isn't installed, that check returns null with a note,
// and the rest still run. Dependency-free otherwise (fetch + regex + ai.ts).

import { generate, isAiEnabled } from "./ai.ts";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const GOOGLEBOT_UA =
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

export type Tier = "tier_full" | "tier_basic";

// VIDA gets the full monthly treatment (we offer it free); everyone else basic.
const TIER_OVERRIDES: Record<string, Tier> = { vida: "tier_full" };

export function tierForClient(name: string): Tier {
  const key = (name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, t] of Object.entries(TIER_OVERRIDES)) {
    if (key.includes(k)) return t;
  }
  return "tier_basic";
}

// ---- schema.org scan (pure, offline-testable) ---------------------------
export interface SchemaResult {
  found: boolean;
  types: string[];
  count: number;
}

export function scanSchema(html: string): SchemaResult {
  const types: string[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const m of html.matchAll(re)) {
    try {
      const json = JSON.parse(m[1].trim());
      collectTypes(json, types);
    } catch {
      // malformed JSON-LD block — count it as present but untyped
      types.push("(uparsbar)");
    }
  }
  const uniq = [...new Set(types)];
  return { found: uniq.length > 0, types: uniq, count: uniq.length };
}

function collectTypes(node: unknown, out: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTypes(n, out));
  } else if (node && typeof node === "object") {
    const t = (node as Record<string, unknown>)["@type"];
    if (typeof t === "string") out.push(t);
    else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.push(x));
    const graph = (node as Record<string, unknown>)["@graph"];
    if (graph) collectTypes(graph, out);
  }
}

async function fetchHtml(url: string, ua = CHROME_UA, timeoutMs = 9000): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function normUrl(domain: string): string {
  let u = (domain || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---- google indexing estimate (often blocked → null) -------------------
export interface IndexResult {
  indexed: number | null;
  note: string;
}

export async function checkGoogleIndex(domain: string): Promise<IndexResult> {
  const host = hostOf(normUrl(domain));
  if (!host) return { indexed: null, note: "ingen domæne" };
  const html = await fetchHtml(`https://www.google.com/search?q=site:${encodeURIComponent(host)}&num=10`, GOOGLEBOT_UA);
  if (!html) return { indexed: null, note: "Google blokerede forespørgslen (forventet uden SerpAPI)" };
  const m = html.match(/([\d.,]+)\s*(?:results|resultater)/i);
  if (m) {
    const n = parseInt(m[1].replace(/[.,]/g, ""), 10);
    return { indexed: Number.isFinite(n) ? n : null, note: "estimat fra Googlebot-UA scrape" };
  }
  return { indexed: null, note: "kunne ikke parse resultattal" };
}

// ---- AI-search visibility (needs a model key) --------------------------
export interface AiVisibilityResult {
  mentioned: boolean | null;
  detail: string;
}

export async function checkAiVisibility(name: string, city: string, domain: string): Promise<AiVisibilityResult> {
  if (!isAiEnabled()) return { mentioned: null, detail: "ingen AI-nøgle — springet over" };
  const host = hostOf(normUrl(domain));
  const res = await generate({
    task: "research",
    system: "Du svarer kort og faktuelt. Hvis du ikke kender virksomheden, sig det ærligt.",
    prompt: `Kender du virksomheden "${name}"${city ? ` i ${city}` : ""}? Hvis ja, hvad er deres hjemmeside-URL? Svar kort.`,
    maxTokens: 200,
    temperature: 0,
  });
  if (!res) return { mentioned: null, detail: "AI-kald fejlede" };
  const mentioned = host ? res.text.toLowerCase().includes(host) : false;
  return { mentioned, detail: res.text.slice(0, 240) };
}

// ---- lighthouse (dynamic; needs a local Chrome) ------------------------
export interface LighthouseScores {
  performance: number;
  accessibility: number;
  bestPractices: number;
  seo: number;
}
export interface LighthouseResult {
  available: boolean;
  scores: LighthouseScores | null; // mobile (primary)
  desktop?: LighthouseScores | null;
  note: string;
  ranAt?: string;
  cached?: boolean;
}

// Kept as `as string` dynamic imports so the Next build never tries to bundle or
// type-check the heavy Lighthouse/Chrome packages. Runs headless Chrome locally;
// on Vercel (no Chrome) it returns available:false with a clear note.
async function runOne(url: string, formFactor: "mobile" | "desktop", port: number): Promise<LighthouseScores | null> {
  const lh = (await import("lighthouse" as string)).default as (u: string, o: unknown) => Promise<{ lhr: { categories: Record<string, { score: number | null }> } }>;
  const screenEmulation = formFactor === "desktop"
    ? { mobile: false, width: 1350, height: 940, deviceScaleFactor: 1, disabled: false }
    : undefined;
  const res = await lh(url, {
    port,
    output: "json",
    logLevel: "silent",
    onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
    formFactor,
    screenEmulation,
  });
  const c = res.lhr.categories;
  const pct = (s: number | null | undefined) => Math.round((s ?? 0) * 100);
  return {
    performance: pct(c.performance?.score),
    accessibility: pct(c.accessibility?.score),
    bestPractices: pct(c["best-practices"]?.score),
    seo: pct(c.seo?.score),
  };
}

export async function runLighthouse(url: string, opts: { desktop?: boolean } = {}): Promise<LighthouseResult> {
  if (!/^https?:\/\/.+\..+/i.test(url || "")) {
    return { available: false, scores: null, note: "ingen gyldig URL — Lighthouse springet over" };
  }
  const cacheKey = `lighthouse/${encodeURIComponent(url)}`;
  // 24h cache via the store.
  try {
    const { store } = await import("./store.ts");
    const cached = await store.get<LighthouseResult>(cacheKey);
    if (cached?.ranAt && Date.now() - Date.parse(cached.ranAt) < 24 * 60 * 60 * 1000) {
      return { ...cached, cached: true };
    }
  } catch { /* cache is best-effort */ }

  let chrome: { port: number; kill: () => Promise<void> } | null = null;
  try {
    const chromeLauncher = await import("chrome-launcher" as string).catch(() => null);
    if (!chromeLauncher) {
      return { available: false, scores: null, note: "chrome-launcher ikke installeret" };
    }
    const launched = await chromeLauncher.launch({ chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"] });
    chrome = launched;
    const port: number = launched.port;
    const mobile = await Promise.race([
      runOne(url, "mobile", port),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000)),
    ]);
    let desktop: LighthouseScores | null = null;
    if (opts.desktop && mobile) {
      desktop = await Promise.race([
        runOne(url, "desktop", port),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 60000)),
      ]);
    }
    const result: LighthouseResult = mobile
      ? { available: true, scores: mobile, desktop, note: "mobil-scores (Lighthouse)", ranAt: new Date().toISOString() }
      : { available: false, scores: null, note: "Lighthouse timeout eller kørsel fejlede" };
    try {
      const { store } = await import("./store.ts");
      if (result.available) await store.put(cacheKey, result);
    } catch { /* best-effort */ }
    return result;
  } catch (err) {
    // No Chrome on the host (e.g. Vercel) or a launch failure.
    return { available: false, scores: null, note: `Lighthouse kunne ikke køre: ${String(err).slice(0, 120)}` };
  } finally {
    if (chrome) { try { await chrome.kill(); } catch { /* ignore */ } }
  }
}

// ---- orchestrator ------------------------------------------------------
export interface SeoCheckInput {
  name: string;
  city?: string;
  domain: string;
}
export interface SeoResult {
  name: string;
  domain: string;
  tier: Tier;
  ranAt: string;
  schema: SchemaResult | null;
  index: IndexResult | null;
  aiVisibility: AiVisibilityResult | null;
  lighthouse: LighthouseResult | null;
  notes: string[];
}

export async function runSeoChecks(input: SeoCheckInput): Promise<SeoResult> {
  const tier = tierForClient(input.name);
  const notes: string[] = [];
  const url = normUrl(input.domain);

  let schema: SchemaResult | null = null;
  if (url) {
    const html = await fetchHtml(url);
    if (html) schema = scanSchema(html);
    else notes.push("Kunne ikke hente siden til schema-scan.");
  } else {
    notes.push("Ingen domæne registreret for klienten.");
  }

  const lighthouse = url ? await runLighthouse(url) : null;

  // Full tier adds the monthly index + AI-visibility checks.
  let index: IndexResult | null = null;
  let aiVisibility: AiVisibilityResult | null = null;
  if (tier === "tier_full" && url) {
    index = await checkGoogleIndex(input.domain);
    aiVisibility = await checkAiVisibility(input.name, input.city ?? "", input.domain);
  }

  return {
    name: input.name,
    domain: input.domain,
    tier,
    ranAt: new Date().toISOString(),
    schema,
    index,
    aiVisibility,
    lighthouse,
    notes,
  };
}
