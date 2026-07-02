// Bulk: move drafts back to status="pending" so they show up in
// /godkendelse "afventer" filter and can be approved/rejected via the UI.
//
// Use cases:
//   - 2026-06-23: After pipeline changes (new opener, em-dash fix) 385 drafts
//     were marked "edited" but were never actually user-edited. UI hid them
//     from "afventer", so Lucas couldn't approve them.
//   - General: any time a draft is stuck in a non-pending state but the user
//     wants to review/approve it fresh.
//
// Rules:
//   - Only moves drafts that are currently "edited" (the only stuck-but-not-
//     finalized state). Sent/rejected/approved are NEVER touched.
//   - Optionally accepts { ids: [...] } to move a subset.
//   - Without { ids }, moves ALL edited drafts.
//   - Auth: Basic via middleware (same as /api/approve/*).
//
// This does NOT modify subject or body — only status.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: { ids?: string[]; dryRun?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    // empty body is OK
  }
  const dryRun = payload.dryRun ?? false;
  const idsSet = payload.ids ? new Set(payload.ids) : null;

  const drafts = await readQueue();
  const moved: Array<{ id: string; name: string }> = [];
  let skippedSentOrApproved = 0;
  let skippedNotFound = 0;

  for (const d of drafts) {
    if (idsSet && !idsSet.has(d.id)) continue;
    if (d.status !== "edited") {
      if (d.status === "sent" || d.status === "approved" || d.status === "rejected") {
        skippedSentOrApproved++;
      } else if (idsSet) {
        skippedNotFound++;
      }
      continue;
    }
    if (!dryRun) {
      d.status = "pending";
      d.updatedAt = new Date().toISOString();
    }
    if (moved.length < 20) {
      moved.push({ id: d.id, name: d.name });
    }
  }

  if (!dryRun) await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    dryRun,
    movedCount: moved.length,
    movedSample: moved,
    skippedSentOrApproved,
    skippedNotFound,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "POST with optional { ids: string[], dryRun: boolean }" });
}