import { NextResponse } from "next/server";
import {
  getLeads,
  updateLeadWebsiteStatus,
} from "@/lib/sheets";
import { verifyWebsite } from "@/lib/website-verify";

export const maxDuration = 300;

// 06:30 UTC daily — re-verifies every lead currently flagged dead.
//
// The original verify-all uses a bot User-Agent and a single direct fetch,
// which Cloudflare / Sucuri / BunnyCDN often answer with 403/429/503. Those
// leads then got marked websiteStatus=dead / qualityTier=dead, and the cold
// mail templates went out claiming "der ser ud til at være nogle tekniske
// udfordringer på jeres hjemmeside" — to leads whose sites are perfectly fine.
//
// This route runs BEFORE morning-review and re-checks each dead lead with
// verifyWebsite() (browser UA → Jina fallback). If either method finds real
// content, we flip the lead back to websiteStatus="ok" + tier="mediocre" as
// a best guess. The next verify-all pass will determine the real tier
// (modern / mediocre / old) using its quality-score heuristics.

const CONCURRENCY = 5;

interface RecoveredLead {
  id: string;
  name: string;
  website: string;
  method: "direct" | "jina";
}

export async function GET() {
  try {
    const leads = await getLeads();

    const candidates = leads
      .map((lead, rowIndex) => ({ lead, rowIndex }))
      .filter(({ lead }) =>
        lead.website &&
        (lead.websiteStatus === "dead" || lead.websiteQualityTier === "dead")
      );

    const recovered: RecoveredLead[] = [];
    const stillDead: { id: string; name: string; website: string }[] = [];

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      const batch = candidates.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async ({ lead, rowIndex }) => {
          const result = await verifyWebsite(lead.website);
          return { lead, rowIndex, result };
        })
      );

      for (const { lead, rowIndex, result } of results) {
        if (result.alive && result.method) {
          // Conservative: tier="mediocre" is the best guess until verify-all
          // gives us a real quality score. We don't want to default to
          // "modern" (would exclude from cold queue entirely) or "old"
          // (would still trigger old-website copy).
          try {
            await updateLeadWebsiteStatus(rowIndex, "ok", "mediocre");
            recovered.push({
              id: lead.id,
              name: lead.name,
              website: lead.website,
              method: result.method,
            });
          } catch (err) {
            console.error(`pre-cleanup: failed to update row ${rowIndex}`, err);
          }
        } else {
          stillDead.push({ id: lead.id, name: lead.name, website: lead.website });
        }
      }
    }

    return NextResponse.json({
      checked: candidates.length,
      recovered: recovered.length,
      stillDead: stillDead.length,
      details: { recovered, stillDead: stillDead.slice(0, 50) },
    });
  } catch (err) {
    console.error("pre-cleanup failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel cron sends GET; allow POST too for manual triggering from a curl.
export async function POST() {
  return GET();
}
