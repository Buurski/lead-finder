import { NextRequest, NextResponse } from "next/server";
import { getLeads, getPauseStatus, enqueueSend } from "@/lib/sheets";
import { buildLeadEmail, NoMatchingTemplateError } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { type = "cold", override = false } = await req.json().catch(() => ({}));
    const leads = await getLeads();
    const { id } = await params;
    const rowIndex = parseInt(id) - 2;
    const lead = leads[rowIndex];

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.email) return NextResponse.json({ error: "Lead has no email" }, { status: 400 });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lead.email)) return NextResponse.json({ error: "Invalid email format" }, { status: 400 });

    // Respect the global halt/pause kill switch — even a manual single-send
    // must not fire while sends are halted, unless the caller explicitly
    // overrides. (Override does not bypass the SendQueue — it just lets
    // enqueue happen; send.mjs still checks master pause before dispatching.)
    if (!override) {
      const pause = await getPauseStatus("manual");
      if (pause.paused) {
        return NextResponse.json(
          { error: "Sends are halted (pause active). Pass { override: true } to force this one.", pausedUntil: pause.until },
          { status: 423 }
        );
      }
    }

    // Enqueue to SendQueue — send.mjs handles the actual Gmail dispatch with
    // 4-14 min spacing. Manual single-send is treated as kind="manual" so it
    // respects the manual-pause flag and is auditable separately from cold/
    // followup batches.
    const tpl = buildLeadEmail(lead, type as "cold" | "followup");
    const queueId = await enqueueSend({
      leadId: lead.id,
      toEmail: lead.email,
      kind: "manual",
      subject: tpl.subject,
      body: tpl.text,
      htmlBody: tpl.html,
    });

    return NextResponse.json({ ok: true, enqueued: true, queueId });
  } catch (err) {
    if (err instanceof NoMatchingTemplateError) {
      return NextResponse.json(
        { error: "no matching template — extend BRANCH_GROUP_MAP or NAME_OVERRIDES in src/lib/email.ts", branch: err.branch, leadName: err.leadName },
        { status: 422 }
      );
    }
    console.error("send-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
