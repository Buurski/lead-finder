// messenger/handle.ts — resolve a Messenger-usable Facebook handle from a lead's
// website column. Ported from .send_queue/.messenger_digest.mjs (the live local
// script) so the in-app Messenger workspace targets the same pages the email
// digest did. Pure + deterministic — no I/O.

export interface ResolvedHandle {
  handle: string;
  fbPageUrl: string;     // page to verify the business
  messengerUrl: string;  // direct DM thread
}

const NON_TARGETABLE = /\/(share|sharer|events|posts|photo|photo\.php|story\.php|watch|groups|reel|videos|marketplace|home\.php)\b/i;
const RESERVED = /^(profile\.php|p|people|pages|share|sharer|events|groups|watch|marketplace|story\.php|photo\.php|reel|videos|home\.php)$/i;

/** Direct Messenger thread URL for a resolved handle/id. */
export function messengerUrlFor(handle: string): string {
  return `https://www.facebook.com/messages/t/${handle}`;
}

/**
 * Extract a Messenger-usable handle from a facebook.com URL. Most FB-only leads
 * already carry facebook.com/<handle> in the sheet, so this avoids a web search
 * for the common case. Returns null for non-targetable shapes (share/posts/etc).
 */
export function handleFromWebsite(website: string | undefined | null): ResolvedHandle | null {
  if (!website) return null;
  const w = String(website).trim();
  if (!/facebook\.com/i.test(w)) return null;
  if (NON_TARGETABLE.test(w)) return null;

  // profile.php?id=123 → numeric id
  let m = w.match(/profile\.php\?id=(\d+)/i);
  if (m) return { handle: m[1], fbPageUrl: w, messengerUrl: messengerUrlFor(m[1]) };

  // /p/Name-123 | /people/Name-123 | /pages/Name-123 → trailing numeric id
  m = w.match(/facebook\.com\/(?:p|people|pages)\/[^/?#]*?(\d{6,})\/?/i);
  if (m) return { handle: m[1], fbPageUrl: w, messengerUrl: messengerUrlFor(m[1]) };

  // /<vanity-handle>
  m = w.match(/facebook\.com\/([A-Za-z0-9.\-]+)\/?(?:[?#].*)?$/i);
  if (m) {
    const h = m[1];
    if (RESERVED.test(h)) return null;
    return { handle: h, fbPageUrl: `https://www.facebook.com/${h}/`, messengerUrl: messengerUrlFor(h) };
  }
  return null;
}
