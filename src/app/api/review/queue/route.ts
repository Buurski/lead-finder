import { NextResponse } from "next/server";
import { computeTodaysQueue } from "@/lib/queue";
import { getPauseSnapshot } from "@/lib/sheets";

// GET /api/review/queue
//
// JSON view of the review page's data — same shape ReviewQueueClient
// receives from the server component, used by the client-side 30s
// polling refresh. force-dynamic + revalidate=0 so we never serve a
// stale snapshot.

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const [queue, pauseSnapshot] = await Promise.all([
      computeTodaysQueue(),
      getPauseSnapshot(),
    ]);

    const entries = queue.entries.map((e) => ({
      id: e.lead.id,
      name: e.lead.name,
      branch: e.lead.branch,
      city: e.lead.city,
      score: e.lead.score,
      website: e.lead.website,
      email: e.lead.email,
      websiteQualityTier: e.lead.websiteQualityTier,
      kind: e.kind,
      concern: e.concern,
      willClaimBroken: e.willClaimBroken,
      treatedAsAlive: e.treatedAsAlive,
      daysSinceSent: e.daysSinceSent,
      skipReason: e.lead.skipReason,
    }));

    return NextResponse.json({
      entries,
      summary: queue.summary,
      overflow: queue.overflow,
      paused: pauseSnapshot.master.paused,
      pausedUntil: pauseSnapshot.master.until,
      pauseSnapshot,
      fetchedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("review/queue failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
