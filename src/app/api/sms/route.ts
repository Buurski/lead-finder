import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { selectSmsCandidates, isSmsEligible } from "@/lib/sms/select";
import { loadSmsState, handledIds, markSms } from "@/lib/sms/state";

// GET /api/sms — the SMS workspace feed: phone-only leads (no email, no Facebook),
// ranked by attractiveness, minus the ones already texted/skipped. Read-only — it
// never sends; it hands Lucas a tel:/sms: link + a ready draft.
// POST /api/sms { id, action: "sent" | "skipped" } — mark one handled.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const limit = Math.min(40, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "20", 10) || 20));
  let leads;
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, candidates: [] }, { status: 200 });
  }
  const state = await loadSmsState();
  const handled = handledIds(state);
  const candidates = selectSmsCandidates(leads, { limit, excludeIds: handled });
  const eligibleTotal = leads.filter(isSmsEligible).length;
  return NextResponse.json({
    ok: true,
    candidates,
    pool: {
      eligible: eligibleTotal,
      remaining: Math.max(0, eligibleTotal - handled.size),
      shown: candidates.length,
      sent: Object.keys(state.sent).length,
      skipped: Object.keys(state.skipped).length,
    },
  });
}

export async function POST(req: Request) {
  const { id, action } = await req.json().catch(() => ({}));
  if (!id || (action !== "sent" && action !== "skipped")) {
    return NextResponse.json({ error: "id + action (sent|skipped) required" }, { status: 400 });
  }
  await markSms(String(id), action);
  return NextResponse.json({ ok: true });
}
