// POST /api/jev-run — run a Jev-rescoring batch on demand, so Lucas doesn't
// have to wait for the 03:30 cron (which needs a CRON_SECRET he can't read
// in production). Deliberately NOT under /api/cron/: src/proxy.ts's matcher
// excludes api/cron/ from basic auth but leaves normal app routes protected,
// so this route rides the existing browser session instead of needing its
// own secret. OBSERVES ONLY, same three phases as the cron.

import { NextResponse } from "next/server";
import { runJevBatch, clampBatch } from "@/lib/leads/jev-run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const url = new URL(req.url);
    let limitRaw: string | null = url.searchParams.get("limit");
    if (!limitRaw) {
      const body = await req.json().catch(() => null);
      if (body && typeof body === "object" && "limit" in body) limitRaw = String((body as { limit?: unknown }).limit ?? "");
    }
    const limit = clampBatch(limitRaw);
    const r = await runJevBatch({ limit });
    return NextResponse.json({ ok: true, leads: r.leads, drafts: r.drafts, replies: r.replies });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
