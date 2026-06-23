// Bulk: smart version of back-to-pending. Only moves drafts to "pending" if:
//   - created today (2026-06-23) OR yesterday (2026-06-22)
//   - status is currently "edited"
//   - NOT already sent (emailSentAt is null OR < 2026-06-22)
//   - HAS a usable recipientEmail (lead is contactable NOW — drafts without
//     email stay in "edited" so find-emails cron can fill them, then they
//     show up after the user manually moves them or via a future cron).
//
// Use case 2026-06-23: Lucas wanted "afventer" to show the same ~170 drafts
// he had in the morning, plus the 75 new ones from today's cron — but ONLY
// those that are actually contactable. Sent drafts must stay sent.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import { hasUsableEmail } from "@/lib/leads/channel";

export const dynamic = "force-dynamic";

const CUTOFF_FROM = "2026-06-22T00:00:00.000Z";

export async function POST(req: Request) {
  let payload: { dryRun?: boolean; fromDate?: string } = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body is OK */
  }
  const dryRun = payload.dryRun ?? false;
  const fromDate = payload.fromDate ?? CUTOFF_FROM;

  const drafts = await readQueue();
  const moved: Array<{ id: string; name: string; reason: string }> = [];
  const skipped: Record<string, number> = {
    tooOld: 0,
    notEdited: 0,
    alreadySent: 0,
    noEmail: 0,
  };

  for (const d of drafts) {
    if (d.status !== "edited") {
      if (d.status === "sent" || d.status === "rejected") skipped.notEdited++;
      continue;
    }
    if (d.createdAt < fromDate) {
      skipped.tooOld++;
      continue;
    }
    if (d.emailSentAt) {
      skipped.alreadySent++;
      continue;
    }
    if (!hasUsableEmail(d.recipientEmail)) {
      skipped.noEmail++;
      continue;
    }
    if (!dryRun) {
      d.status = "pending";
      d.updatedAt = new Date().toISOString();
    }
    if (moved.length < 30) {
      moved.push({
        id: d.id,
        name: d.name,
        reason: `created=${d.createdAt.slice(0, 10)} hasEmail=${d.recipientEmail}`,
      });
    }
  }

  if (!dryRun) await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    dryRun,
    movedCount: moved.length,
    movedSample: moved,
    skipped,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST with optional { dryRun: boolean, fromDate: string } — moves edited drafts from fromDate onwards (default 2026-06-22) to pending, skipping sent/rejected/no-email",
  });
}
