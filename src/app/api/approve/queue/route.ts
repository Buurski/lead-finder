import { NextResponse } from "next/server";
import { readQueue, updateDraft } from "@/lib/queue";
import { validateDraft } from "@/lib/draft";
import { registerDraftApproved } from "@/lib/datalayer";

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
  action?: "approve" | "edit" | "reject";
  subject?: string;
  body?: string;
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
  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  if (action === "reject") {
    const updated = await updateDraft(id, { status: "rejected" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
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
