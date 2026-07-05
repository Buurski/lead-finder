// GET /api/seo-tjek/stats — funnel tracking for Lucas. Deliberately NOT in the
// proxy exemption list, so it sits behind basic auth like the rest of the CRM.
// Counters + the submission list (report ready? mails sent? unsubscribed?).

import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { STATS_KEY, SUB_PREFIX, type SeoTjekStats, type SeoTjekSubmission } from "@/lib/seo-tjek";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const stats = (await store.get<SeoTjekStats>(STATS_KEY)) ?? {
    submissions: 0,
    reports: 0,
    day0Sent: 0,
    day7Sent: 0,
    unsubscribes: 0,
    honeypot: 0,
  };
  const keys = await store.list(SUB_PREFIX);
  const submissions: Array<Record<string, unknown>> = [];
  for (const key of keys.slice(0, 200)) {
    const s = await store.get<SeoTjekSubmission>(key);
    if (!s) continue;
    submissions.push({
      id: s.id,
      url: s.url,
      email: s.email,
      branch: s.branch ?? null,
      city: s.city ?? null,
      createdAt: s.createdAt,
      reportReady: s.reportReady ?? false,
      day0SentAt: s.day0SentAt ?? null,
      day7SentAt: s.day7SentAt ?? null,
      unsubscribedAt: s.unsubscribedAt ?? null,
    });
  }
  submissions.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return NextResponse.json({ stats, count: submissions.length, submissions });
}
