import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { selectMessengerCandidates, isMessengerEligible } from "@/lib/messenger/select";
import { loadMessengerState, handledIds } from "@/lib/messenger/state";

// GET /api/messenger — the Messenger workspace feed.
//
// Reads leads from Sheets, selects the best FB-only candidates to DM (quota-
// balanced, ranked), minus the ones already sent/skipped. Read-only: it never
// messages anyone — the panel just hands Lucas the page link, the direct
// Messenger link, and a ready draft to paste.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const limit = Math.min(25, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "12", 10) || 12));

  let leads;
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, candidates: [] }, { status: 200 });
  }

  const state = await loadMessengerState();
  const handled = handledIds(state);
  const candidates = selectMessengerCandidates(leads, { limit, excludeIds: handled });

  const eligibleTotal = leads.filter(isMessengerEligible).length;
  const sentCount = Object.keys(state.sent).length;
  const skippedCount = Object.keys(state.skipped).length;

  return NextResponse.json({
    ok: true,
    candidates,
    pool: {
      eligible: eligibleTotal,          // currently eligible in the sheet
      remaining: Math.max(0, eligibleTotal - handled.size), // not yet worked
      shown: candidates.length,
      sent: sentCount,
      skipped: skippedCount,
      depleted: eligibleTotal - handled.size <= 0,
    },
  });
}
