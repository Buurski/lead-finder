import { NextResponse } from "next/server";
import { getLeads, updateLeadWebsiteStatus } from "@/lib/sheets";
import { verifyWebsite } from "@/lib/website-verify";
import { withCronLog } from "@/lib/cron-log";

export const maxDuration = 300;

// 04:30 UTC daily — re-verifies every lead currently flagged dead, then flips
// the false-negatives back to "ok/mediocre" so the cold mail never claims a
// working site has issues. See pre-cleanup comment history for the full story.
const CONCURRENCY = 5;

interface RecoveredLead { id: string; name: string; website: string; method: "direct" | "jina"; }

export async function GET() {
  try {
    const { checked, recovered, stillDead } = await withCronLog("pre-cleanup", async () => {
      const leads = await getLeads();
      const candidates = leads
        .map((lead, rowIndex) => ({ lead, rowIndex }))
        .filter(({ lead }) => lead.website && (lead.websiteStatus === "dead" || lead.websiteQualityTier === "dead"));

      const recoveredOut: RecoveredLead[] = [];
      const stillDeadOut: { id: string; name: string; website: string }[] = [];

      for (let i = 0; i < candidates.length; i += CONCURRENCY) {
        const batch = candidates.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map(async ({ lead, rowIndex }) => {
          const result = await verifyWebsite(lead.website);
          return { lead, rowIndex, result };
        }));
        for (const { lead, rowIndex, result } of results) {
          if (result.alive && result.method) {
            try {
              await updateLeadWebsiteStatus(rowIndex, "ok", "mediocre");
              recoveredOut.push({ id: lead.id, name: lead.name, website: lead.website, method: result.method });
            } catch (err) { console.error(`pre-cleanup: failed to update row ${rowIndex}`, err); }
          } else {
            stillDeadOut.push({ id: lead.id, name: lead.name, website: lead.website });
          }
        }
      }
      return {
        result: { checked: candidates.length, recovered: recoveredOut.length, stillDead: stillDeadOut.length },
        note: `genskabt ${recoveredOut.length} af ${candidates.length} døde leads`,
        meta: { recovered: recoveredOut.length, stillDead: stillDeadOut.length },
      };
    });
    return NextResponse.json({ checked, recovered, stillDead });
  } catch (err) {
    console.error("pre-cleanup failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() { return GET(); }
