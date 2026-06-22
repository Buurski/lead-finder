// One-time cleanup: reject any pending/approved draft whose lead has no usable
// email (channel !== "email"). Those belong to Messenger/SMS — not the mail
// queue. Keeps /godkendelse email-only.
//
// Why a dedicated cron route (2026-06-22): the same logic exists as a "cleanup-
// no-email" action in /api/approve/queue, but that route is behind Vercel Basic
// Auth (proxy.ts matcher doesn't include /api/approve/*), so terminal-triggered
// cleanup needs this /api/cron/ variant (which IS excluded from Basic Auth).
//
// Auth: ?key=<ADMIN_KEY> or Bearer CRON_SECRET/ADMIN_KEY. No key set ⇒ open
// (local dev). Idempotent: re-running is a no-op.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import { getLeads } from "@/lib/sheets";
import { leadChannel } from "@/lib/leads/channel";

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

  const [drafts, leads] = await Promise.all([readQueue(), getLeads().catch(() => [])]);
  const byId = new Map(leads.map((l) => [l.id, l]));

  let rejected = 0;
  const rejectedSample: Array<{ id: string; leadId?: string; name?: string }> = [];
  for (const d of drafts) {
    if (d.status !== "pending" && d.status !== "approved") continue;
    // Resolve by leadId ONLY — name fallback risks rejecting a valid same-named lead.
    const lead = d.leadId ? byId.get(d.leadId) : undefined;
    if (lead && leadChannel(lead) !== "email") {
      d.status = "rejected";
      d.updatedAt = new Date().toISOString();
      rejected++;
      if (rejectedSample.length < 10) {
        rejectedSample.push({ id: d.id, leadId: d.leadId, name: (lead as { name?: string }).name });
      }
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
