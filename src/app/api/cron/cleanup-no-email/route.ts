// One-time cleanup: reject any pending/approved draft whose recipientEmail is
// set-but-blocked (bureau mail, placeholder, junk). NOT leads with no email —
// those belong to find-emails cron and must stay in the queue.
//
// Why a dedicated cron route (2026-06-22): the same logic exists as a "cleanup-
// no-email" action in /api/approve/queue, but that route is behind Vercel Basic
// Auth (proxy.ts matcher doesn't include /api/approve/*), so terminal-triggered
// cleanup needs this /api/cron/ variant (which IS excluded from Basic Auth).
//
// History (2026-06-23): original logic rejected `leadChannel(lead) !== "email"`
// which caught 40 leads without ANY email — they were trapped forever because
// find-emails skips `rejected` drafts. Now we only reject drafts where the mail
// is structurally present but unusable (bureau/placeholder/junk).
//
// Auth: ?key=<ADMIN_KEY> or Bearer CRON_SECRET/ADMIN_KEY. No key set ⇒ open
// (local dev). Idempotent: re-running is a no-op.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import {
  hasUsableEmail,
  isBlockedEmail,
} from "@/lib/leads/channel";

export const dynamic = "force-dynamic";

function checkAuth(req: Request): boolean {
  const expected = process.env.ADMIN_KEY || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const h = req.headers.get("authorization") || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  // Vercel Cron injects "Bearer CRON_SECRET" — accept it so this route can be a cron.
  if (cronSecret && bearer === cronSecret) return true;
  if (!expected) return true; // open if ADMIN_KEY isn't configured
  const url = new URL(req.url);
  if ((url.searchParams.get("key") || "") === expected) return true;
  return bearer === expected;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const drafts = await readQueue();

  let rejected = 0;
  const rejectedSample: Array<{ id: string; leadId?: string; name?: string; recipientEmail?: string }> = [];
  for (const d of drafts) {
    if (d.status !== "pending" && d.status !== "approved") continue;
    // ONLY reject drafts that have a recipientEmail that is set-but-blocked
    // (bureau footer mail, placeholder, noreply@, junk domain). Drafts WITHOUT
    // any email stay in the queue so find-emails cron can fill them in later.
    const email = (d.recipientEmail || "").trim();
    if (!email) continue;                                  // no email → keep, find-emails handles
    if (hasUsableEmail(email)) continue;                  // good email → keep
    if (!isBlockedEmail(email)) continue;                 // malformed but not blocked → keep (find-emails will retry/verify)
    d.status = "rejected";
    d.updatedAt = new Date().toISOString();
    rejected++;
    if (rejectedSample.length < 10) {
      rejectedSample.push({ id: d.id, leadId: d.leadId, name: d.name, recipientEmail: email });
    }
  }
  await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    rejected,
    sample: rejectedSample,
    queueSize: drafts.length,
  });
}