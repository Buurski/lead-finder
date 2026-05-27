import { NextRequest, NextResponse } from "next/server";
import { getLeads, getPauseStatus, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

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

    // Respect the global halt/pause kill switch — even a manual single-send must
    // not fire while sends are halted, unless the caller explicitly overrides.
    if (!override) {
      const pause = await getPauseStatus();
      if (pause.paused) {
        return NextResponse.json(
          { error: "Sends are halted (pause active). Pass { override: true } to force this one.", pausedUntil: pause.until },
          { status: 423 }
        );
      }
    }

    await sendLeadEmail(lead, type as "cold" | "followup");

    const now = new Date().toISOString();
    const isFollowup = type === "followup";
    await updateLeadEmailStatus(rowIndex, {
      ...(isFollowup ? { followupSentAt: now } : { emailSentAt: now }),
      emailStatus: isFollowup ? lead.emailStatus || "sent" : "sent",
    });

    if (lead.status === "new") {
      await updateLeadStatus(rowIndex, "called");
    }

    return NextResponse.json({ ok: true, sentAt: now });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
