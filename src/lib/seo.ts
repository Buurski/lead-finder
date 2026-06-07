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
      // No local Chrome (e.g. Vercel) — use Google PageSpeed Insights instead.
      return await pageSpeedFallback(url, cacheKey);
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
    // Chrome launch failed (e.g. Vercel) — fall back to PageSpeed Insights.
    const fb = await pageSpeedFallback(url, cacheKey);
    if (fb.available) return fb;
    return { available: false, scores: null, note: `Lighthouse kunne ikke køre: ${String(err).slice(0, 90)} — ${fb.note}` };
  } finally {
    if (chrome) { try { await chrome.kill(); } catch { /* ignore */ } }
  }
}

// Google PageSpeed Insights — the Vercel-safe fallback (runs Lighthouse on
// Google's servers). Free tier works without a key; PAGESPEED_API_KEY raises the
// quota. Same four category scores. Cached 24h like the local run.
async function pageSpeedFallback(url: string, cacheKey: string): Promise<LighthouseResult> {
  try {
    const cats = ["performance", "accessibility", "best-practices", "seo"];
    const params = new URLSearchParams({ url, strategy: "mobile" });
    for (const c of cats) params.append("category", c);
    if (process.env.PAGESPEED_API_KEY) params.set("key", process.env.PAGESPEED_API_KEY);
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      return { available: false, scores: null, note: `Lighthouse ikke tilgængelig her — PageSpeed API svarede ${res.status}` };
    }
    const data = (await res.json()) as { lighthouseResult?: { categories?: Record<string, { score: number | null }> } };
    const c = data.lighthouseResult?.categories;
    if (!c) return { available: false, scores: null, note: "Lighthouse ikke tilgængelig her — PageSpeed gav intet resultat" };
    const pct = (s: number | null | undefined) => Math.round((s ?? 0) * 100);
    const scores: LighthouseScores = {
      performance: pct(c.performance?.score),
      accessibility: pct(c.accessibility?.score),
      bestPractices: pct(c["best-practices"]?.score),
      seo: pct(c.seo?.score),
    };
    const result: LighthouseResult = {
      available: true,
      scores,
      note: "Lighthouse er ikke tilgængelig på Vercel — bruger PageSpeed API i stedet",
      ranAt: new Date().toISOString(),
    };
    try { const { store } = await import("./store.ts"); await store.put(cacheKey, result); } catch { /* best-effort */ }
    return result;
  } catch (err) {
    return { available: false, scores: null, note: `PageSpeed fallback fejlede: ${String(err).slice(0, 90)}` };
  }
}

// ---- orchestrator ------------------------------------------------------
// ---- CrUX (real-user field Core Web Vitals; same PAGESPEED_API_KEY) -------
export interface CruxResult {
  available: boolean;
  lcpMs: number | null;   // p75 mobile
  inpMs: number | null;
  cls: number | null;
  overall: "good" | "needs-improvement" | "poor" | null;
  note: string;
}
const numOrNull = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
function cwvVerdict(lcp: number | null, inp: number | null, cls: number | null): CruxResult["overall"] {
  const ranks = [
    lcp == null ? null : lcp <= 2500 ? 0 : lcp <= 4000 ? 1 : 2,
    inp == null ? null : inp <= 200 ? 0 : inp <= 500 ? 1 : 2,
    cls == null ? null : cls <= 0.1 ? 0 : cls <= 0.25 ? 1 : 2,
  ].filter((r): r is number => r != null);
  if (!ranks.length) return null;
  const worst = Math.max(...ranks);
  return worst === 0 ? "good" : worst === 1 ? "needs-improvement" : "poor";
}
export async function runCrux(url: string): Promise<CruxResult> {
  const empty = (note: string): CruxResult => ({ available: false, lcpMs: null, inpMs: null, cls: null, overall: null, note });
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return empty("Ingen PAGESPEED_API_KEY — CrUX springet over.");
  try {
    const res = await fetch(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, formFactor: "PHONE" }),
      signal: AbortSignal.timeout(12000),
    });
    if (res.status === 404) return empty("Ikke nok trafik-data i CrUX (normalt for nye/små sites).");
    if (!res.ok) return empty(`CrUX svarede ${res.status} — er "Chrome UX Report API" aktiveret i Cloud-projektet?`);
    const data = (await res.json()) as { record?: { metrics?: Record<string, { percentiles?: { p75?: number | string } }> } };
    const m = data.record?.metrics ?? {};
    const lcp = numOrNull(m.largest_contentful_paint?.percentiles?.p75);
    const inp = numOrNull(m.interaction_to_next_paint?.percentiles?.p75);
    const cls = numOrNull(m.cumulative_layout_shift?.percentiles?.p75);
    if (lcp == null && inp == null && cls == null) return empty("CrUX gav ingen metrics for siden.");
    return { available: true, lcpMs: lcp, inpMs: inp, cls, overall: cwvVerdict(lcp, inp, cls), note: "feltdata fra rigtige brugere (CrUX, p75 mobil)" };
  } catch (err) {
    return empty(`CrUX fejl: ${String(err).slice(0, 80)}`);
  }
}

// ---- GEO / AI-search readiness (the "new SEO") ---------------------------
export interface GeoResult {
  llmsTxt: boolean;
  aiCrawlersAllowed: boolean | null; // null = no robots.txt found
  blockedBots: string[];
  citabilityNote: string;
  note: string;
}
const AI_BOTS = ["GPTBot", "ChatGPT-User", "OAI-SearchBot", "PerplexityBot", "ClaudeBot", "Claude-Web", "Google-Extended", "CCBot"];
export async function runGeo(url: string, html: string | null): Promise<GeoResult> {
  const grab = async (path: string): Promise<string | null> => {
    try {
      const res = await fetch(new URL(path, url).toString(), { signal: AbortSignal.timeout(6000) });
      return res.ok ? await res.text() : null;
    } catch { return null; }
  };
  const [llms, robots] = await Promise.all([grab("/llms.txt"), grab("/robots.txt")]);
  // Robots groups are separated by blank lines. A bot is blocked if ITS OWN stanza
  // (or the `*` fallback when it has none) contains `Disallow: /`. Checking the whole
  // file with one lazy regex wrongly spans stanza boundaries (false positives).
  const botBlocked = (bot: string): boolean => {
    const blocks = robots!.split(/\n\s*\n/);
    const own = blocks.find((bl) => new RegExp(`user-agent:\\s*${bot}\\b`, "i").test(bl));
    const star = blocks.find((bl) => /user-agent:\s*\*/i.test(bl));
    const block = own || star;
    return block ? /disallow:\s*\/\s*($|\n)/i.test(block) : false;
  };
  const blocked = robots ? AI_BOTS.filter(botBlocked) : [];
  const aiCrawlersAllowed = robots ? blocked.length === 0 : null;
  const h = html || "";
  const headings = (h.match(/<h[1-3][\s>]/gi) || []).length;
  const hasLists = /<ul|<ol/i.test(h);
  const citabilityNote = headings >= 3 && hasLists
    ? "god struktur — klare overskrifter + lister, nemt for AI at citere."
    : "svag struktur — tilføj klare H2/H3-overskrifter + punktlister så AI kan citere siden.";
  return { llmsTxt: Boolean(llms), aiCrawlersAllowed, blockedBots: blocked, citabilityNote, note: "GEO = synlighed i AI-søgning (ChatGPT/Perplexity/AI Overviews)" };
}

// ---- Schema GENERATOR — turn "no schema" into a paste-ready snippet -------
const SCHEMA_TYPE_BY_BRANCH: Array<[RegExp, string]> = [
  [/frisør|frisor|salon|barber|hår|hair/i, "HairSalon"],
  [/skønhed|skonhed|hud|negle|kosmet|spa|wellness|beauty|klinik/i, "BeautySalon"],
  [/restaurant|café|cafe|pizz|\bbar\b|grill|kro|bistro|spise|food|køkken/i, "Restaurant"],
  [/bager|konditori/i, "Bakery"],
  [/tømrer|maler|murer|vvs|elektr|håndværk|tag|snedker|smed/i, "HomeAndConstructionBusiness"],
  [/foto|photo/i, "ProfessionalService"],
];
function schemaTypeFor(branch?: string): string {
  const b = branch || "";
  for (const [re, t] of SCHEMA_TYPE_BY_BRANCH) if (re.test(b)) return t;
  return "LocalBusiness";
}
export function buildLocalBusinessJsonLd(input: { name: string; city?: string; domain: string; branch?: string }): string {
  const url = normUrl(input.domain) || `https://${input.domain}`;
  const obj: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": schemaTypeFor(input.branch),
    name: input.name,
    url,
    ...(input.city ? { address: { "@type": "PostalAddress", addressLocality: input.city, addressCountry: "DK" } } : {}),
    // Lucas fills these in for the real client:
    telephone: "+45 ",
    image: `${url}/og.jpg`,
    priceRange: "$$",
  };
  return `<script type="application/ld+json">\n${JSON.stringify(obj, null, 2)}\n</script>`;
}

export interface SeoCheckInput {
  name: string;
  city?: string;
  domain: string;
  branch?: string;
}
export interface SeoResult {
  name: string;
  domain: string;
  tier: Tier;
  ranAt: string;
  schema: SchemaResult | null;
  schemaSuggestion: string | null; // paste-ready JSON-LD when schema is missing
  crux: CruxResult | null;
  geo: GeoResult | null;
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
  let html: string | null = null;
  if (url) {
    html = await fetchHtml(url);
    if (html) schema = scanSchema(html);
    else notes.push("Kunne ikke hente siden til schema-scan.");
  } else {
    notes.push("Ingen domæne registreret for klienten.");
  }

  // Schema generator: when no schema is present, hand Lucas a paste-ready snippet.
  const schemaSuggestion = url && schema && !schema.found
    ? buildLocalBusinessJsonLd({ name: input.name, city: input.city, domain: input.domain, branch: input.branch })
    : null;

  // CrUX (real field CWV) + GEO (AI-search readiness) run on every tier — cheap,
  // serverless, and the most useful "is this site actually findable" signals.
  const [lighthouse, crux, geo] = url
    ? await Promise.all([runLighthouse(url), runCrux(url), runGeo(url, html)])
    : [null, null, null];

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
    schemaSuggestion,
    crux,
    geo,
    index,
    aiVisibility,
    lighthouse,
    notes,
  };
}
