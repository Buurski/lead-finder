// Shared website-verification helper.
//
// The original verify-all/scrape pipelines do a single direct fetch with a bot
// User-Agent. Many Danish sites sit behind Cloudflare, Sucuri, BunnyCDN or
// other anti-bot WAFs that return 403/429/503 to any non-browser-looking UA —
// which we then incorrectly flagged as "dead". This caused false-positive
// "din hjemmeside er nede" cold mails to leads whose sites are perfectly fine.
//
// This helper tries two things, in order, before reporting a site as dead:
//   1. A realistic-looking browser fetch (Chrome UA + Accept headers).
//   2. Jina Reader (https://r.jina.ai/<url>) as a fallback — it renders the
//      page server-side and returns markdown, bypassing most WAFs.
//
// `alive` is true if either method returns more than 100 chars of usable
// content. We also expose `isInTreatAsAliveList()` so callers can short-circuit
// based on Lucas's manually-curated "this site is alive, don't claim otherwise"
// list (the TreatAsAlive sheet tab).

export interface VerifyResult {
  alive: boolean;
  html: string | null;
  method: "direct" | "jina" | null;
  status?: number;
  error?: string;
}

const MIN_CONTENT_LEN = 100;
const FETCH_TIMEOUT_MS = 12000;

// Status codes that strongly suggest "blocked by WAF" rather than "site is
// genuinely dead". We always try Jina on these — same on network exceptions.
const FALLBACK_STATUS = new Set([202, 403, 429, 451, 503]);

// Modern Chrome UA + matching Accept headers. Many WAFs sniff for the full
// set, not just the UA.
const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "da-DK,da;q=0.9,en-US;q=0.8,en;q=0.7",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Ch-Ua":
    '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"macOS"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

function normalizeUrl(url: string): string {
  if (!url) return url;
  return url.startsWith("http") ? url : `https://${url}`;
}

// Extracts the registrable domain — strips protocol, www., and any path/query.
// "https://www.example.dk/about?x=1" → "example.dk"
export function extractRootDomain(url: string): string {
  if (!url) return "";
  let s = url.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  const slash = s.indexOf("/");
  if (slash >= 0) s = s.slice(0, slash);
  const q = s.indexOf("?");
  if (q >= 0) s = s.slice(0, q);
  return s;
}

export function isInTreatAsAliveList(url: string, list: string[]): boolean {
  if (!url || !list.length) return false;
  const target = extractRootDomain(url);
  if (!target) return false;
  return list.some((entry) => {
    const e = extractRootDomain(entry);
    if (!e) return false;
    // Match exact root domain OR any subdomain. So "example.dk" in the list
    // also covers "shop.example.dk".
    return target === e || target.endsWith(`.${e}`);
  });
}

async function tryDirect(url: string): Promise<VerifyResult> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: BROWSER_HEADERS,
      redirect: "follow",
    });
    const html = await res.text().catch(() => "");
    if (res.ok && html.length >= MIN_CONTENT_LEN) {
      return { alive: true, html, method: "direct", status: res.status };
    }
    // Treat OK but tiny body as suspicious — fall through to Jina.
    return {
      alive: false,
      html: html.length ? html : null,
      method: "direct",
      status: res.status,
    };
  } catch (err) {
    return {
      alive: false,
      html: null,
      method: "direct",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function tryJina(url: string): Promise<VerifyResult> {
  // Jina Reader proxies the URL and returns markdown of the rendered page.
  // No auth required for low volume; if Jina rate-limits us we just get
  // back a 429 which still beats nothing.
  const jinaUrl = `https://r.jina.ai/${url}`;
  try {
    const res = await fetch(jinaUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS + 6000), // Jina is slower
      headers: {
        "User-Agent": BROWSER_HEADERS["User-Agent"],
        Accept: "text/plain, */*",
      },
    });
    const html = await res.text().catch(() => "");
    if (res.ok && html.length >= MIN_CONTENT_LEN) {
      return { alive: true, html, method: "jina", status: res.status };
    }
    return {
      alive: false,
      html: html.length ? html : null,
      method: "jina",
      status: res.status,
    };
  } catch (err) {
    return {
      alive: false,
      html: null,
      method: "jina",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Verify whether a website is actually reachable.
 *
 * Returns `alive: true` only if at least one of the two methods returned
 * >100 chars of content. Social-media URLs are treated as dead (no real
 * web presence to redesign).
 */
export async function verifyWebsite(url: string): Promise<VerifyResult> {
  if (!url) return { alive: false, html: null, method: null };
  const full = normalizeUrl(url);

  // Social-media-only "websites" never count — same rule as analyzeUrl in
  // verify-all. We don't fall back to Jina for these.
  if (/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|tiktok\.com/i.test(full)) {
    return { alive: false, html: null, method: null };
  }

  const direct = await tryDirect(full);
  if (direct.alive) return direct;

  // Fall back to Jina if:
  //  - direct returned a WAF-ish status code
  //  - direct threw (network error, timeout, DNS failure)
  //  - direct got 2xx but with too little content to be a real page
  const shouldFallback =
    direct.status === undefined ||
    FALLBACK_STATUS.has(direct.status) ||
    (direct.status >= 200 && direct.status < 300);

  if (!shouldFallback) {
    return direct;
  }

  const jina = await tryJina(full);
  if (jina.alive) return jina;

  // Neither worked — return the most informative of the two failures.
  return direct.html || direct.status ? direct : jina;
}
