import { NextResponse } from "next/server";
import { updateLeadStatus, updateCallbackDate } from "@/lib/sheets";
import { queueNote } from "@/lib/notes-queue";

// POST /api/actions/mark-lead — confirmed lead-status action from the chat.
//   { leadId, leadName?, status: "interested"|"not-interested"|"maybe-later" }
// Mirrors /api/replies/[leadId]/status. Idempotent. not-interested suppresses
// future contact; maybe-later sets callbackDate +30d. Queues an Obsidian note.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { leadId?: string; leadName?: string; status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const rowNum = parseInt(String(body.leadId ?? ""), 10);
  if (!Number.isFinite(rowNum) || rowNum < 2) return NextResponse.json({ error: "bad leadId" }, { status: 400 });
  const rowIndex = rowNum - 2;
  const name = body.leadName ?? body.leadId;

  try {
    if (body.status === "not-interested") {
      await updateLeadStatus(rowIndex, "not-interested");
      await queueNote({ bucket: "said-no", text: `${name} sagde nej tak.`, leadId: body.leadId, leadName: body.leadName });
    } else if (body.status === "interested") {
      await updateLeadStatus(rowIndex, "interested");
      await queueNote({ bucket: "interested", text: `${name} er interesseret.`, leadId: body.leadId, leadName: body.leadName });
    } else if (body.status === "maybe-later") {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      await updateCallbackDate(rowIndex, d.toISOString().slice(0, 10));
      await queueNote({ bucket: "maybe-later", text: `${name} — måske senere (~${d.toISOString().slice(0, 10)}).`, leadId: body.leadId, leadName: body.leadName });
    } else {
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, leadId: body.leadId, status: body.status, message: `Markeret: ${name} → ${body.status}` });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
