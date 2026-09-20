// fetch-page.ts — fetch a homepage and reduce it to the bounded, redacted
// text + technical signals that a Jev judgment needs. Same UA/timeout/cap as
// seo-tjek.ts:647 (kept separate so the cron does not pull the whole SEO
// report machinery). Never returns emails or phone numbers in `text`.

export interface PageText {
  url: string;
  title: string;
  /** Visible text, whitespace-collapsed, emails/phones stripped, ≤ maxChars. */
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
const PHONE_RE = /(?:\+45[\s-]?)?(?:\d{2}[\s-]?){3}\d{2}\b/g;
const BOOKING_RE =
  /\b(book|booking|bestil tid|online tidsbestilling|onlinebooking|planway|easypractice|terapeutbooking|fresha)\b/i;

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

export function redact(text: string): string {
  return text.replace(EMAIL_RE, "[mail]").replace(PHONE_RE, "[tlf]");
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
    title: title ? stripHtmlToText(title[1]).slice(0, 200) : "",
    text: text.slice(0, maxChars),
    hasViewportMeta: /name=["']viewport/i.test(raw),
    https: url.startsWith("https"),
    generator: gen ? gen[1].slice(0, 40) : "",
    bookingKeywordFound: BOOKING_RE.test(raw),
    copyrightYears: years.slice(-3),
    wordCount: text.split(" ").filter(Boolean).length,
  };
}

/** Returns null on any network/HTTP failure (caller records the error). */
export async function fetchPageText(url: string, timeoutMs = 9000): Promise<PageText | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "da,en;q=0.5" },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "follow",
    });
    if (!res.ok) return null;
    const raw = (await res.text()).slice(0, 2_000_000);
    return extractPage(url, raw);
  } catch {
    return null;
  }
}
