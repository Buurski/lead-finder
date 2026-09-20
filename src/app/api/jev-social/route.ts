// POST /api/jev-social — on-demand Facebook follower fetch for pending
// drafts (council 2026-09-20, owner's WHY: see how big a business is before
// mailing it — "Restaurant Berserk had 12,000 followers"). Deliberately NOT
// under /api/cron/: rides the normal proxy basic auth like /api/jev-run,
// never its own secret. Costs real money (Apify, $0.012/page) — refuses
// (200, not an exception) unless Lucas opted in via ENABLE_SOCIAL_STATS=1.

import { NextResponse } from "next/server";
import { readQueue } from "@/lib/queue";
import { loadShadow } from "@/lib/leads/jev-shadow";
import {
  socialEnabled,
  fetchFacebookStats,
  loadSocialStats,
  saveSocialStats,
  type SocialStats,
} from "@/lib/leads/social-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function clampLimit(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return 30;
  return Math.min(60, Math.floor(n));
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!socialEnabled()) {
    return NextResponse.json({ ok: false, error: "ENABLE_SOCIAL_STATS=1 og APIFY_TOKEN kræves" });
  }

  const url = new URL(req.url);
  let limitRaw: string | null = url.searchParams.get("limit");
  if (!limitRaw) {
    const body = await req.json().catch(() => null);
    if (body && typeof body === "object" && "limit" in body) {
      limitRaw = String((body as { limit?: unknown }).limit ?? "");
    }
  }
  const limit = clampLimit(limitRaw);

  try {
    const [queue, shadow, existingStats] = await Promise.all([
      readQueue(),
      loadShadow(),
      loadSocialStats(),
    ]);
    const shadowByLead = new Map(shadow.map((r) => [r.leadId, r]));
    const statsByLead = new Map(existingStats.map((r) => [r.leadId, r]));
    const now = Date.now();

    const candidates: { leadId: string; facebookUrl: string }[] = [];
    const seenLeads = new Set<string>();
    for (const d of queue) {
      if (d.status !== "pending") continue;
      if (seenLeads.has(d.leadId)) continue;
      const facebookUrl = shadowByLead.get(d.leadId)?.socials?.facebook;
      if (!facebookUrl) continue;
      const existing = statsByLead.get(d.leadId);
      if (existing && now - new Date(existing.fetchedAt).getTime() < THIRTY_DAYS_MS) continue;
      seenLeads.add(d.leadId);
      candidates.push({ leadId: d.leadId, facebookUrl });
      if (candidates.length >= limit) break;
    }

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, requested: 0, fetched: 0, costUsd: 0 });
    }

    const results = await fetchFacebookStats(candidates.map((c) => c.facebookUrl));
    const fetchedAt = new Date().toISOString();
    let fetched = 0;
    for (const c of candidates) {
      const r = results.get(c.facebookUrl);
      const rec: SocialStats = r
        ? { leadId: c.leadId, facebookUrl: c.facebookUrl, followers: r.followers, category: r.category, adStatus: r.adStatus, createdAt: r.createdAt, fetchedAt }
        : { leadId: c.leadId, facebookUrl: c.facebookUrl, followers: null, fetchedAt, error: "no-data" };
      if (r) fetched++;
      await saveSocialStats(rec);
    }

    return NextResponse.json({
      ok: true,
      requested: candidates.length,
      fetched,
      costUsd: +(candidates.length * 0.012).toFixed(2),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
