import { NextResponse } from "next/server";
import {
  updateLeadSkipReason,
  logSkipReason,
  type SkipReason,
} from "@/lib/sheets";
import { leadIdToRowIndex } from "@/lib/queue";

// POST /api/review/skip
// Body: { leadId: string, reason: SkipReason, notes?: string }
//
// Marks a single lead with a skip reason so the 10:00 scheduled-send drops
// it. Also appends an entry to the SkipReasons audit tab.

const VALID_REASONS = new Set<SkipReason>([
  "cloudflare_false_positive",
  "chain",
  "bad_fit",
  "wrong_template",
  "already_contacted_elsewhere",
  "other",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leadId: string = body.leadId;
    const reason: SkipReason = body.reason;
    const notes: string | undefined = body.notes;

    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }
    if (!reason || !VALID_REASONS.has(reason)) {
      return NextResponse.json({ error: "invalid reason" }, { status: 400 });
    }

    const rowIndex = leadIdToRowIndex(leadId);
    if (!Number.isFinite(rowIndex) || rowIndex < 0) {
      return NextResponse.json({ error: "invalid leadId" }, { status: 400 });
    }

    await updateLeadSkipReason(rowIndex, reason);
    await logSkipReason(leadId, reason, notes);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("review/skip failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
