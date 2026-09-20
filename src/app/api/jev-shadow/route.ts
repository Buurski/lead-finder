// GET /api/jev-shadow — read-only view over the Jev shadow store. Same
// cron-secret gate as the cron route, but also open locally (no VERCEL env)
// for dev convenience.

import { NextResponse } from "next/server";
import { loadShadow } from "@/lib/leads/jev-shadow";

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (process.env.VERCEL) {
    if (!secret) {
      return NextResponse.json({ ok: false, error: "CRON_SECRET mangler" }, { status: 401 });
    }
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const all = await loadShadow();
  const judged = all.filter((r) => r.judgment !== null).length;
  const errors = all.filter((r) => !!r.error).length;
  const ranked = [...all]
    .sort((a, b) => (b.attractiveness ?? -1) - (a.attractiveness ?? -1))
    .map((r) => ({
      leadId: r.leadId,
      name: r.name,
      city: r.city,
      branch: r.branch,
      url: r.url,
      sheetScore: r.sheetScore,
      sheetTier: r.sheetTier,
      attractiveness: r.attractiveness,
      reasons: r.reasons,
      judgment: r.judgment,
      isChain: r.isChain,
      judgedAt: r.judgedAt,
      error: r.error,
    }));

  return NextResponse.json({ ok: true, count: all.length, judged, errors, ranked });
}
