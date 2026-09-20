// fetch-page.ts — fetch a homepage and reduce it to the bounded, redacted
// text + technical signals that a Jev judgment needs. Same UA/timeout/cap as
// seo-tjek.ts:647 (kept separate so the cron does not pull the whole SEO
// report machinery).
//
// Trust boundary: the URL comes from a spreadsheet row, so (Codex JEV-002)
// only public http(s) hosts are fetched, redirects are followed manually and
// re-checked per hop, and (Codex JEV-004) EVERY string that leaves this module
// has emails, phone numbers and CPR-shaped numbers redacted.

export interface PageText {
  url: string;
  title: string;
  /** Visible text, whitespace-collapsed, redacted, ≤ maxChars. */
  text: string;
  hasViewportMeta: boolean;
  https: boolean;
  generator: string;
  bookingKeywordFound: boolean;
  /** Last up to 3 distinct copyright years found in the HTML, ascending. */
  copyrightYears: string[];
  wordCount: number;
}

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// Danish CPR: ddmmyy-nnnn or ddmmyynnnn. Checked before phones so the 10-digit
// form is not half-eaten by the phone pattern.
const CPR_RE = /\b\d{6}-?\d{4}\b/g;
const PHONE_RE = /(?:\+45[\s-]?)?(?:\d{2}[\s-]?){3}\d{2}\b/g;
const BOOKING_RE =
  /\b(book|booking|bestil tid|online tidsbestilling|onlinebooking|planway|easypractice|terapeutbooking|fresha)\b/i;
const MAX_REDIRECTS = 3;

export function stripHtmlToText(raw: string): string {
  let t = raw.replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, " ");
  t = t.replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&aring;/g, "å").replace(/&Aring;/g, "Å")
    .replace(/&aelig;/g, "æ").replace(/&AElig;/g, "Æ")
    .replace(/&oslash;/g, "ø").replace(/&Oslash;/g, "Ø");
  return t.replace(/\s+/g, " ").trim();
}

/** Applied to every string sent to Jev: email, CPR, phone. */
export function redact(text: string): string {
  return text.replace(EMAIL_RE, "[mail]").replace(CPR_RE, "[cpr]").replace(PHONE_RE, "[tlf]");
}

/**
 * Only public http(s) hosts. Rejects credentials in the URL, non-http schemes,
 * localhost/.local/.internal names and IP literals in loopback, link-local,
 * private (RFC 1918), multicast, unspecified and IPv6-local ranges. Does not
 * resolve DNS (a hostname that resolves to a private IP is not caught here;
 * the Vercel runtime has no internal services on this project, so the literal
 * check is the proportionate guard).
 */
export function isSafeUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return false;
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (host.includes(":")) {
    // IPv6 literal: allow only clearly global unicast (2000::/3).
    return /^[23][0-9a-f]{3}:/.test(host);
  }
  return true;
}

export function extractPage(url: string, raw: string, maxChars = 6000): PageText {
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const gen = raw.match(/name=["']generator["']\s+content=["']([^"']+)/i);
  const years = Array.from(
    new Set(Array.from(raw.matchAll(/(?:©|&copy;|copyright)\D{0,15}((?:19|20)\d\d)/gi), (m) => m[1])),
  ).sort();
  const text = redact(stripHtmlToText(raw));
  return {
    url,
    title: title ? redact(stripHtmlToText(title[1])).slice(0, 200) : "",
    text: text.slice(0, maxChars),
    hasViewportMeta: /name=["']viewport/i.test(raw),
    https: url.startsWith("https"),
    generator: gen ? redact(gen[1]).slice(0, 40) : "",
    bookingKeywordFound: BOOKING_RE.test(raw),
    copyrightYears: years.slice(-3),
    wordCount: text.split(" ").filter(Boolean).length,
  };
}

/** Returns null on unsafe URL, any network/HTTP failure, or too many redirects. */
export async function fetchPageText(url: string, timeoutMs = 9000): Promise<PageText | null> {
  const started = Date.now();
  let current = url.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeUrl(current)) return null;
    const left = timeoutMs - (Date.now() - started);
    if (left <= 0) return null;
    let res: Response;
    try {
      res = await fetch(current, {
        headers: { "User-Agent": UA, "Accept-Language": "da,en;q=0.5" },
        signal: AbortSignal.timeout(left),
        redirect: "manual",
      });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        current = new URL(loc, current).toString();
      } catch {
        return null;
      }
      continue;
    }
    if (!res.ok) return null;
    try {
      const raw = (await res.text()).slice(0, 2_000_000);
      return extractPage(current, raw);
    } catch {
      return null;
    }
  }
  return null;
}
