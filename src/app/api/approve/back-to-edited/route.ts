// Bulk: move drafts back to status="edited" so they show up in
// /godkendelse "alle" / "afgjort" filters and DON'T pollute "afventer".
//
// Use cases:
//   - 2026-06-23: After back-to-pending ran, 385 drafts (many old from
//     2026-06-06 to 2026-06-22) flooded "afventer". Lucas wanted to revert
//     so only NEW leads (created today) show up in afventer.
//   - General: any time drafts that shouldn't be in afventer accidentally
//     get marked pending.
//
// Rules:
//   - Only moves drafts that are currently "pending" (the only state we
//     want to de-clutter). Sent/rejected/edited/approved are NEVER touched.
//   - Optionally accepts { ids: [...] } to move a subset.
//   - Without { ids }, moves ALL pending drafts.
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
  let skippedNotPending = 0;
  const skippedNotFound = 0;

  for (const d of drafts) {
    if (idsSet && !idsSet.has(d.id)) continue;
    if (d.status !== "pending") {
      skippedNotPending++;
      continue;
    }
    if (!dryRun) {
      d.status = "edited";
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
    skippedNotPending,
  });
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "POST with optional { ids: string[], dryRun: boolean }" });
}
