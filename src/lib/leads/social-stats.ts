// social-stats.ts — Facebook follower counts for leads (council 2026-09-20).
// Owner's WHY: before a mail goes out he wants a sense of how big the
// business is ("Restaurant Berserk had 12,000 followers — we are not
// interested in those"). Plain server fetches to facebook.com are blocked
// (HTTP 400 for any User-Agent — verified), so this goes through Apify's
// apify/facebook-pages-scraper actor ($0.012/page). OFF by default so no
// money is ever spent unless Lucas opts in via ENABLE_SOCIAL_STATS=1.
//
// Guessed page slugs don't work — only a real facebookUrl already extracted
// from the business's own homepage (JevShadowRecord.socials?.facebook) is
// ever sent to Apify.

import { store } from "../store.ts";

export interface SocialStats {
  leadId: string;
  facebookUrl: string;
  followers: number | null;
  category?: string;
  adStatus?: string;
  createdAt?: string;
  fetchedAt: string;
  error?: string;
}

export const SOCIAL_PREFIX = "jev-social/";
const LOG_KEY = "jev-social-log";

export async function loadSocialStats(): Promise<SocialStats[]> {
  const keys = await store.list(SOCIAL_PREFIX);
  const recs = await Promise.all(keys.map((k) => store.get<SocialStats>(k)));
  return recs.filter((r): r is SocialStats => !!r);
}

export async function saveSocialStats(rec: SocialStats): Promise<void> {
  // Append-only log FIRST (audit source of truth, mirrors draft-judgments.ts):
  // if the put then fails, the lead simply has no current record and is
  // re-fetched next run instead of leaving an unlogged visible record.
  await store.append(LOG_KEY, rec);
  await store.put(SOCIAL_PREFIX + rec.leadId, rec);
}

/** Default OFF — a Facebook fetch costs real money. Both flags required. */
export function socialEnabled(): boolean {
  return Boolean(process.env.APIFY_TOKEN) && process.env.ENABLE_SOCIAL_STATS === "1";
}

/**
 * Fetch follower counts for a batch of real Facebook page URLs via Apify.
 * NEVER throws — network/HTTP/parse failure all return an empty Map. Never
 * logs the token or the response body, only the HTTP status.
 */
export async function fetchFacebookStats(
  urls: string[],
): Promise<Map<string, { followers: number | null; category?: string; adStatus?: string; createdAt?: string }>> {
  const out = new Map<string, { followers: number | null; category?: string; adStatus?: string; createdAt?: string }>();
  const token = process.env.APIFY_TOKEN;
  if (!token || urls.length === 0) return out;
  try {
    const res = await fetch(
      // Token i Authorization-headeren, ikke i query-strengen: URL'er havner i
      // proxy- og platformlogs, headers gør ikke.
      "https://api.apify.com/v2/acts/apify~facebook-pages-scraper/run-sync-get-dataset-items",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ startUrls: urls.map((u) => ({ url: u })) }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (!res.ok) {
      console.warn(`[social-stats] HTTP ${res.status}`);
      return out;
    }
    const items = (await res.json()) as unknown;
    if (!Array.isArray(items)) return out;
    items.forEach((raw, i) => {
      if (!raw || typeof raw !== "object") return;
      const item = raw as Record<string, unknown>;
      if ("error" in item && item.error) return; // not_available etc. — skip
      const key =
        (typeof item.facebookUrl === "string" && item.facebookUrl) ||
        (typeof item.pageUrl === "string" && item.pageUrl) ||
        urls[i];
      if (!key) return;
      out.set(key, {
        followers: typeof item.followers === "number" ? item.followers : null,
        category: typeof item.category === "string" ? item.category : undefined,
        adStatus: typeof item.ad_status === "string" ? item.ad_status : undefined,
        createdAt: typeof item.creation_date === "string" ? item.creation_date : undefined,
      });
    });
    return out;
  } catch (e) {
    console.warn(`[social-stats] ${e instanceof Error ? e.name : "error"}`);
    return out;
  }
}

/** Rounded, Danish-formatted follower bucket for the /approve card. Never an
 * exact number (that invites false precision on a scraped estimate). */
export function followerBucket(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(n)) return null;
  if (n < 200) return "under 200 følgere";
  if (n < 1_000) return `~${Math.round(n / 100) * 100} følgere`;
  const rounded = n < 5_000 ? Math.round(n / 500) * 500
    : n < 20_000 ? Math.round(n / 1_000) * 1_000
    : null;
  if (rounded == null) return "20.000+ følgere";
  return `${rounded.toLocaleString("da-DK")} følgere`;
}
