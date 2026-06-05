// /api/leads/queue-deep-research — POST to add leads to the deep-research queue.
//
// Body (one of):
//   { leadIds: string[] }                  — queue specific leads
//   { top: number }                        — queue top N by shallow-score
//   { top: number, minShallow: number }    — queue top N with score >= minShallow
//
// Response:
//   { added: number, queueTotal: number, batchPromptUrl: string }
//
// Idempotent: re-queueing a lead that's already pending is a no-op.

import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { enqueue, readQueue, summary } from "@/lib/deep-research-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  leadIds?: string[];
  top?: number;
  minShallow?: number;
}

// Estimate a shallow score for a lead from existing fields. Real composite
// scoring will replace this in a follow-up. For now, a deterministic fallback
// derived from existing reviewsCount + score + website-tier.
function estimateShallow(lead: {
  score?: number;
  reviewsCount?: number;
  websiteQualityTier?: string;
}): number {
  let s = (lead.score ?? 0) * 0.6;
  s += Math.min(lead.reviewsCount ?? 0, 100) * 0.25;
  const tierBonus: Record<string, number> = {
    dead: 15, old: 12, mediocre: 6, modern: -8, none: 18,
  };
  s += tierBonus[lead.websiteQualityTier ?? ""] ?? 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const leads = await getLeads();
  const byId = new Map(leads.map((l) => [l.id, l]));

  let toQueue: typeof leads = [];

  if (Array.isArray(body.leadIds) && body.leadIds.length > 0) {
    toQueue = body.leadIds.map((id) => byId.get(id)).filter(Boolean) as typeof leads;
  } else if (typeof body.top === "number" && body.top > 0) {
    const minShallow = body.minShallow ?? 0;
    toQueue = leads
      .filter((l) => l.email && !l.status?.toLowerCase().includes("kontakt"))
      .map((l) => ({ ...l, _shallow: estimateShallow(l as never) }))
      .filter((l) => (l as never as { _shallow: number })._shallow >= minShallow)
      .sort((a, b) => (b as never as { _shallow: number })._shallow - (a as never as { _shallow: number })._shallow)
      .slice(0, body.top);
  } else {
    return NextResponse.json({ error: "missing leadIds or top" }, { status: 400 });
  }

  if (toQueue.length === 0) {
    return NextResponse.json({ added: 0, queueTotal: (await readQueue()).length, batchPromptUrl: "/api/leads/cowork-batch" });
  }

  const entries = toQueue.map((l) => ({
    leadId: l.id,
    name: l.name,
    branch: l.branch ?? "",
    city: l.city ?? "",
    website: l.website,
    email: l.email,
    shallowScore: (l as never as { _shallow?: number })._shallow ?? estimateShallow(l as never),
  }));

  const added = await enqueue(entries);
  const sum = await summary();

  return NextResponse.json({
    added,
    queueTotal: sum.total,
    pending: sum.pending,
    batchPromptUrl: "/api/leads/cowork-batch",
  });
}

export async function GET() {
  // Convenience: return queue summary so the UI can poll without a body.
  const sum = await summary();
  return NextResponse.json(sum);
}
