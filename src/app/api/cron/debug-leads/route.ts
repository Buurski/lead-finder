// debug-leads.ts — TEMPORARY debug route (2026-06-18).
// Shows the lead pick-filter chain result so we can see why the engine
// returns 0 leads. Fjernes igen når test-batch er færdig.
import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { isUnworkedStatus } from "@/lib/leads/pick-filter";
import { isContactable } from "@/lib/leads/contactable";
import { leadChannel } from "@/lib/leads/channel";
import { compositeScore } from "@/lib/leads/composite-score";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const all = await getLeads();
    const total = all.length;
    const buckets: Record<string, number> = {};
    const statusBreakdown: Record<string, number> = {};
    const channelBreakdown: Record<string, number> = {};
    const candidates: Array<{ name: string; branch: string; city: string; email: string; status: string; emailStatus: string; score: number; comp: number }> = [];
    for (const l of all) {
      const st = (l.status ?? "").toString().trim().toLowerCase() || "(blank)";
      statusBreakdown[st] = (statusBreakdown[st] ?? 0) + 1;
      const ch = leadChannel(l);
      channelBreakdown[ch] = (channelBreakdown[ch] ?? 0) + 1;

      const passesFilter = l.name && isUnworkedStatus(l.status) && isContactable(l) && leadChannel(l) === "email";
      const key = `${st}|${passesFilter ? "PASS" : "FAIL"}`;
      buckets[key] = (buckets[key] ?? 0) + 1;
      if (passesFilter) {
        candidates.push({ name: l.name, branch: l.branch, city: l.city, email: l.email, status: l.status, emailStatus: l.emailStatus, score: l.score, comp: compositeScore(l) });
      }
    }
    candidates.sort((a, b) => b.comp - a.comp);
    return NextResponse.json({
      total,
      statusBreakdown,
      channelBreakdown,
      buckets,
      candidatesCount: candidates.length,
      top10: candidates.slice(0, 10),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
