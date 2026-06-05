import { NextResponse } from "next/server";
import { getLeads, purgeAndArchiveLeads } from "@/lib/sheets";
import { classifyLeadForCleanup, summarizeCleanup } from "@/lib/leads/cleanup-classify";

// POST /api/leads/aggressive-cleanup
//
//   { dryRun: true }                 — count what would happen, NO changes (default)
//   { confirm: "DELETE_PERMANENT" }  — actually archive + delete
//
// Hard-deletes uncontacted leads with no email / chain / <15 reviews; archives
// the rest of the uncontacted into Dead Leads (recoverable); keeps every engaged
// lead untouched. Default is always dryRun — execution needs the exact keyword.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CONFIRM_KEYWORD = "DELETE_PERMANENT";
const ARCHIVE_REASON = "aggressive-cleanup-2026-06";

export async function POST(req: Request) {
  let body: { dryRun?: boolean; confirm?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  let leads;
  try {
    leads = await getLeads();
  } catch (e) {
    return NextResponse.json({ error: "sheets_unreachable", message: e instanceof Error ? e.message : "unknown" }, { status: 502 });
  }

  const classified = leads.map((l) => ({ lead: l, ...classifyLeadForCleanup(l) }));
  const summary = summarizeCleanup(classified);

  const wantsExecute = body.confirm !== undefined && body.dryRun !== true;

  // Default + explicit dryRun: report only.
  if (!wantsExecute) {
    const examples = classified
      .filter((c) => c.decision !== "keep")
      .slice(0, 10)
      .map((c) => ({ id: c.lead.id, name: c.lead.name, decision: c.decision, reason: c.reason }));
    return NextResponse.json({ mode: "dryRun", ...summary, examples });
  }

  if (body.confirm !== CONFIRM_KEYWORD) {
    return NextResponse.json({ error: "bad_confirm", expected: CONFIRM_KEYWORD }, { status: 400 });
  }

  const toDelete = classified.filter((c) => c.decision === "delete").map((c) => c.lead);
  const toArchive = classified.filter((c) => c.decision === "archive").map((c) => c.lead);

  console.warn(JSON.stringify({
    evt: "aggressive-cleanup.execute",
    deleting: toDelete.length,
    archiving: toArchive.length,
    keeping: summary.wouldKeep,
    ts: new Date().toISOString(),
  }));

  try {
    const res = await purgeAndArchiveLeads(toDelete, toArchive, ARCHIVE_REASON);
    return NextResponse.json({ mode: "executed", ...res, kept: summary.wouldKeep });
  } catch (e) {
    return NextResponse.json({ error: "execute_failed", message: e instanceof Error ? e.message : "unknown" }, { status: 500 });
  }
}
