// GET /api/cron/jev-rescore — nightly shadow rescoring of leads with Jev.
// OBSERVES ONLY: writes to the jev-shadow/* store namespace, never to the
// Sheet, never to Lead.enrichedInfo, never sends/deletes/changes status.
// Skips quietly when TYPESAFE_API_KEY isn't set.

import { NextResponse } from "next/server";
import { withCronLog } from "@/lib/cron-log";
import { jevEnabled } from "@/lib/jev";
import { runJevBatch, clampBatch } from "@/lib/leads/jev-run";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export { clampBatch };

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.VERCEL) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET mangler — nægter at køre uden auth" }, { status: 401 });
  }
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    type RunResult = Awaited<ReturnType<typeof runJevBatch>>;
    const result = await withCronLog<RunResult>("jev-rescore", async () => {
      if (!jevEnabled()) {
        const empty = { judged: 0, errors: 0, remaining: 0 };
        return { result: { leads: empty, drafts: empty, replies: empty }, note: "TYPESAFE_API_KEY mangler", meta: {} };
      }
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit");
      const max = clampBatch(limitParam ?? process.env.JEV_RESCORE_BATCH);
      const r = await runJevBatch({ limit: max });
      return {
        result: r,
        note: `${r.leads.judged} leads vurderet (${r.leads.errors} fejl), ${r.drafts.judged} kladder vurderet (${r.drafts.errors} fejl), ${r.replies.judged} svar vurderet (${r.replies.errors} fejl)`,
        meta: {
          judged: r.leads.judged, errors: r.leads.errors,
          draftsJudged: r.drafts.judged, draftsErrors: r.drafts.errors,
          repliesJudged: r.replies.judged, repliesErrors: r.replies.errors,
        },
      };
    });
    return NextResponse.json({ ok: true, judged: result.leads.judged, errors: result.leads.errors, remaining: result.leads.remaining, drafts: result.drafts, replies: result.replies });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
