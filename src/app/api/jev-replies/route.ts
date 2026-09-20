// GET /api/jev-replies — read-only view over the Jev reply-suggestion shadow
// store. Same cron-secret gate as /api/jev-shadow: required on Vercel, open
// locally for dev convenience.

import { NextResponse } from "next/server";
import { loadReplyShadow } from "@/lib/leads/reply-judgments";
import { getLeads } from "@/lib/sheets";

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

  const [all, leads] = await Promise.all([
    loadReplyShadow(),
    getLeads().catch(() => [] as Awaited<ReturnType<typeof getLeads>>),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const judged = all.filter((r) => r.action !== null).length;
  const errors = all.filter((r) => !!r.error).length;

  const ranked = [...all]
    .sort((a, b) => (b.haster ?? -1) - (a.haster ?? -1) || (b.varme ?? -1) - (a.varme ?? -1))
    .map((r) => {
      const lead = leadById.get(r.leadId);
      return {
        leadId: r.leadId,
        name: r.name,
        city: lead?.city ?? "",
        branch: lead?.branch ?? "",
        action: r.action,
        actionConfidence: r.actionConfidence,
        haster: r.haster,
        varme: r.varme,
        spoergsmaal: r.spoergsmaal,
        judgedAt: r.judgedAt,
        error: r.error,
      };
    });

  return NextResponse.json({ ok: true, count: all.length, judged, errors, ranked });
}
