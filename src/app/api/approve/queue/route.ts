import { NextResponse } from "next/server";
import { readQueue, updateDraft, writeQueue } from "@/lib/queue";
import type { Demo } from "@/lib/demos";
import { validateDraft } from "@/lib/draft";
import { registerDraftApproved, unregisterDraftApproved } from "@/lib/datalayer";
import { getLeads } from "@/lib/sheets";
import { leadChannel, hasUsableEmail, isBlockedEmail } from "@/lib/leads/channel";

// Reads/writes the engine's approval queue at request time — never cache.
export const dynamic = "force-dynamic";

// GET /api/approve/queue — return all drafts (newest first).
export async function GET() {
  const drafts = await readQueue();
  drafts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
  return NextResponse.json({ drafts, count: drafts.length });
}

interface ActionBody {
  id?: string;
  action?:
    | "approve"
    | "edit"
    | "reject"
    | "unapprove"
    | "set-demos"
    | "set-sender"
    | "reset-sent"
    | "cleanup-no-email";
  subject?: string;
  body?: string;
  demoPair?: Demo[];
  sender?: "lucas" | "charlie";
}

// POST /api/approve/queue — approve | edit | reject a draft.
// "approve" only marks status=approved (mark-for-send). NO mail is sent here.
export async function POST(req: Request) {
  let payload: ActionBody;
  try {
    payload = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { id, action } = payload;

  // One-time cleanup (no id needed): the old test-mode marked drafts "sent" without
  // really mailing. Flip those back to "approved" so they show under Godkendt + can
  // be sent for real.
  if (action === "reset-sent") {
    const drafts = await readQueue();
    let reset = 0;
    for (const d of drafts) {
      if (d.status === "sent") { d.status = "approved"; d.updatedAt = new Date().toISOString(); reset++; }
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, reset });
  }

  // One-time cleanup (no id): reject any pending/approved draft whose
  // recipientEmail is set-but-blocked (bureau mail, placeholder, junk). Drafts
  // WITHOUT any email stay in the queue so find-emails cron can fill them later.
  // See /api/cron/cleanup-no-email/route.ts for full rationale.
  if (action === "cleanup-no-email") {
    const drafts = await readQueue();
    let rejected = 0;
    for (const d of drafts) {
      if (d.status !== "pending" && d.status !== "approved") continue;
      const email = (d.recipientEmail || "").trim();
      if (!email) continue;                       // no email → keep for find-emails
      if (hasUsableEmail(email)) continue;       // good email → keep
      if (!isBlockedEmail(email)) continue;      // malformed but not blocked → keep
      d.status = "rejected";
      d.updatedAt = new Date().toISOString();
      rejected++;
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, rejected });
  }

  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  if (action === "reject") {
    const updated = await updateDraft(id, { status: "rejected" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  // Lucas fortrød en godkendelse — fjern den. Vi flytter draften til
  // "rejected" (så queue.ts's 14-dages reject-blok kicker ind), og sætter
  // lead-status i Sheets til "skip" så engine'en aldrig re-picker.
  // Bevidste valg:
  // - status="sent" kan IKKE unapproves: vi kan ikke un-sende en mail.
  // - kun approved/edited drafts kan unapproves (det er dem der vises som
  //   "godkendt" i UI'en). Pending/rejected → 400.
  if (action === "unapprove") {
    const existing = await readQueue();
    const target = existing.find((d) => d.id === id);
    if (!target) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    if (target.status === "sent") {
      return NextResponse.json(
        { error: "draft is already sent — cannot un-send", status: target.status },
        { status: 409 },
      );
    }
    if (target.status !== "approved" && target.status !== "edited") {
      return NextResponse.json(
        { error: `cannot unapprove from status "${target.status}"`, status: target.status },
        { status: 400 },
      );
    }
    const updated = await updateDraft(id, { status: "rejected" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    // Sheets-cleanup: best-effort. En Sheets-fejl må aldrig blokere unapprove
    // — queue-laget er stadig sandheden, og 14-dages-blokken virker uanset.
    const sync = await unregisterDraftApproved(updated);
    return NextResponse.json({
      draft: updated,
      sync,
      note: "moved to rejected — lead blocked from engine for 14 days",
    });
  }

  if (action === "edit") {
    // Enforce the HARD RULES on edited copy too — a human edit must not
    // reintroduce price/kr or a robot CTA.
    const candidate = payload.body ?? "";
    const check = validateDraft(candidate);
    if (!check.ok) {
      return NextResponse.json(
        { error: "voice-guide violation", violations: check.errors },
        { status: 422 }
      );
    }
    const updated = await updateDraft(id, {
      status: "edited",
      subject: payload.subject,
      body: payload.body,
    });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "set-demos") {
    // Lucas picked different demos for this draft. The client sends the new pair
    // (2 from the catalog) + the body with the URLs already swapped. We validate
    // the body and persist demoPair + body WITHOUT changing status (still pending).
    const pair = Array.isArray(payload.demoPair) ? payload.demoPair.filter((d) => d && typeof d.url === "string" && d.url) : [];
    if (pair.length === 0) return NextResponse.json({ error: "demoPair required" }, { status: 400 });
    const candidate = payload.body ?? "";
    const check = validateDraft(candidate);
    if (!check.ok) {
      return NextResponse.json({ error: "voice-guide violation", violations: check.errors }, { status: 422 });
    }
    const updated = await updateDraft(id, { demoPair: pair, body: payload.body });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "set-sender") {
    // Per-lead afsender-valg (Lucas/Charlie) på /godkendelse. Ændrer KUN hvem
    // mailen sendes fra + underskriften ved afsendelse — ikke draft-status. Må
    // vælges på pending/approved/edited (også efter godkendelse), aldrig sent.
    const sender = payload.sender === "charlie" ? "charlie" : "lucas";
    const existing = await readQueue();
    const target = existing.find((d) => d.id === id);
    if (!target) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    if (target.status === "sent") {
      return NextResponse.json({ error: "draft already sent — afsender kan ikke ændres", status: target.status }, { status: 409 });
    }
    const updated = await updateDraft(id, { sender });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "approve") {
    const updated = await updateDraft(id, { status: "approved" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    // Register back to Sheets so the lead leaves the engine's "new" pool — the
    // single-data-layer bridge. Best-effort: a Sheets failure never blocks the
    // approval (the queue is still the source of truth for the draft itself).
    const sync = await registerDraftApproved(updated);
    return NextResponse.json({
      draft: updated,
      sync,
      note: "marked approved — not sent (sending is a later layer)",
    });
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
}
