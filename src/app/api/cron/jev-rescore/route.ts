// GET /api/cron/jev-rescore — nightly shadow rescoring of leads with Jev.
// OBSERVES ONLY: writes to the jev-shadow/* store namespace, never to the
// Sheet, never to Lead.enrichedInfo, never sends/deletes/changes status.
// Skips quietly when TYPESAFE_API_KEY isn't set.

import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { withCronLog } from "@/lib/cron-log";
import { jevEnabled } from "@/lib/jev";
import { loadShadow, saveShadow, pickBatch, judgeLead } from "@/lib/leads/jev-shadow";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_BATCH = 40;
const CONCURRENCY = 5;

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
    type RunResult = { judged: number; errors: number; remaining: number };
    const result = await withCronLog<RunResult>("jev-rescore", async () => {
      if (!jevEnabled()) {
        return { result: { judged: 0, errors: 0, remaining: 0 }, note: "TYPESAFE_API_KEY mangler", meta: {} };
      }
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit");
      const max = limitParam ? Number(limitParam) : Number(process.env.JEV_RESCORE_BATCH ?? DEFAULT_BATCH);

      const leads = await getLeads();
      const existing = await loadShadow();
      const batch = pickBatch(leads, existing, max);

      let judged = 0;
      let errors = 0;
      let i = 0;
      async function worker() {
        while (i < batch.length) {
          const lead = batch[i++];
          const rec = await judgeLead(lead);
          await saveShadow(rec);
          judged++;
          if (rec.error) errors++;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

      const eligibleCount = pickBatch(leads, existing, Number.MAX_SAFE_INTEGER).length;
      return {
        result: { judged, errors, remaining: Math.max(0, eligibleCount - judged) },
        note: `${judged} leads vurderet (${errors} fejl)`,
        meta: { judged, errors },
      };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
