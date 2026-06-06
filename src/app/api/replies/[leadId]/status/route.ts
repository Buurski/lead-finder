import { NextResponse } from "next/server";
import { updateLeadStatus, updateCallbackDate } from "@/lib/sheets";
import { queueNote } from "@/lib/notes-queue";

// POST /api/replies/[leadId]/status — mark a lead from the Svar page.
//   { status: "interested" | "not-interested" | "maybe-later", leadName? }
// not-interested → status set so the engine + messenger never contact again.
// maybe-later    → callbackDate +30 days (resurfaces later), status untouched.
// Every change also queues an Obsidian note (a Cowork mirror-task writes it into
// the said-no / maybe-later lists). leadId is the sheet row id (String(row)).
export const dynamic = "force-dynamic";

interface Body {
  status?: "interested" | "not-interested" | "maybe-later";
  leadName?: string;
}

export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await ctx.params;
  const rowNum = parseInt(leadId, 10);
  if (!Number.isFinite(rowNum) || rowNum < 2) {
    return NextResponse.json({ error: "bad leadId" }, { status: 400 });
  }
  const rowIndex = rowNum - 2; // sheets writers add +2 back

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const status = body.status;
  const leadName = body.leadName;

  try {
    if (status === "not-interested") {
      await updateLeadStatus(rowIndex, "not-interested");
      await queueNote({ bucket: "said-no", text: `${leadName ?? leadId} sagde nej tak.`, leadId, leadName });
    } else if (status === "interested") {
      await updateLeadStatus(rowIndex, "interested");
      await queueNote({ bucket: "interested", text: `${leadName ?? leadId} er interesseret.`, leadId, leadName });
    } else if (status === "maybe-later") {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      await updateCallbackDate(rowIndex, d.toISOString().slice(0, 10));
      await queueNote({ bucket: "maybe-later", text: `${leadName ?? leadId} — måske senere (kontakt ~${d.toISOString().slice(0, 10)}).`, leadId, leadName });
    } else {
      return NextResponse.json({ error: "unknown status" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, leadId, status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
