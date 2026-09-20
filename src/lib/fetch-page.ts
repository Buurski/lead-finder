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

const MAX_BYTES = 2_000_000;

/** IPv4 dotted-quad public check (shared by literal and resolved addresses). */
function publicV4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  return true;
}

/**
 * Resolve the hostname and require every address to be public (Codex
 * JEV-REV-002: `169.254.169.254.nip.io`-style names pass the literal check).
 * DNS rebinding between this lookup and the fetch is not prevented; that would
 * need a pinned-address egress proxy, out of proportion for a Vercel cron
 * with no internal services.
 */
export async function resolvesPublic(hostname: string): Promise<boolean> {
  try {
    const { lookup } = await import("node:dns/promises");
    const addrs = await lookup(hostname, { all: true });
    if (addrs.length === 0) return false;
    return addrs.every((a) => (a.family === 4 ? publicV4(a.address) : /^[23][0-9a-f]{3}:/i.test(a.address)));
  } catch {
    return false;
  }
}

/** Read at most `max` bytes from a response body, cancelling the stream after (Codex JEV-REV-001). */
export async function readCapped(res: Response, max = MAX_BYTES): Promise<string | null> {
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > max) return null;
  if (!res.body) return (await res.text()).slice(0, max);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < max) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* stream already closed */ }
  }
  const buf = new Uint8Array(Math.min(total, max));
  let off = 0;
  for (const c of chunks) {
    const n = Math.min(c.byteLength, buf.length - off);
    if (n <= 0) break;
    buf.set(c.subarray(0, n), off);
    off += n;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/** Returns null on unsafe URL, any network/HTTP failure, oversized body, or too many redirects. */
export async function fetchPageText(url: string, timeoutMs = 9000): Promise<PageText | null> {
  const started = Date.now();
  let current = url.trim();
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeUrl(current)) return null;
    const host = new URL(current).hostname;
    if (!/^[\d.]+$/.test(host) && !host.includes(":") && !(await resolvesPublic(host))) return null;
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
      const raw = await readCapped(res);
      return raw === null ? null : extractPage(current, raw);
    } catch {
      return null;
    }
  }
  return null;
}
