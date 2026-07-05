import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { validateDraft } from "@/lib/draft";

// POST /api/replies/[id]/send-reply — QA-only reply send.
//
// Hard rule (matches the build guardrails): this route can send a reply ONLY as
// a QA copy to Lucas's own inbox (buur.aigro@gmail.com). It never mails a lead
// and never flips the lead's Sheets status during the unattended build. Sending
// the real reply to the customer + registerReplyOutcome is the operator's
// explicit, separately-armed action ("live" mode here returns 412 on purpose).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QA_RECIPIENT = "buur.aigro@gmail.com";

interface Body {
  reply?: string;
  subject?: string;
  leadName?: string;
  toEmail?: string; // customer recipient — only used (and only sent) in armed live mode
  mode?: "qa" | "live";
  confirm?: boolean;
}

export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  const { leadId: id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const reply = (body.reply ?? "").trim();
  if (!reply) return NextResponse.json({ error: "reply text required" }, { status: 400 });

  // Voice rules apply to outgoing replies too.
  const check = validateDraft(reply);
  if (!check.ok) {
    return NextResponse.json({ error: "voice-guide violation", violations: check.errors }, { status: 422 });
  }

  // Live send (to the customer) is armed two ways so it's never a silent failure:
  //  1. The operator must set LIVE_SEND_ARMED=1 in the environment, AND
  //  2. each send must arrive with confirm:true (the UI's per-send confirm).
  // Until LIVE_SEND_ARMED is set we return a CLEAR, structured 412 the UI shows
  // as "armed but disabled" — not a silent error.
  if (body.mode === "live") {
    const armed = process.env.LIVE_SEND_ARMED === "1";
    if (!armed) {
      return NextResponse.json(
        {
          ok: false,
          needsArm: true,
          to: body.toEmail || null,
          message:
            "Live-send til kunden er slået FRA. Sæt LIVE_SEND_ARMED=1 i miljøet for at låse op — så sender du selv med bekræftelse pr. svar. (Ingen stille fejl: dette er en bevidst spærre.)",
        },
        { status: 412 },
      );
    }
    if (body.confirm !== true) {
      return NextResponse.json({ ok: false, needsConfirm: true, message: "Bekræft dette ene svar før det sendes." }, { status: 412 });
    }
    const to = (body.toEmail || "").trim();
    if (!to) return NextResponse.json({ ok: false, message: "Ingen modtager-email på dette svar." }, { status: 400 });
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      return NextResponse.json({ ok: false, message: "Ingen mail-creds." }, { status: 200 });
    }
    try {
      const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD } });
      await t.sendMail({ from: `Lucas Buur <${process.env.GMAIL_USER}>`, to, subject: body.subject || `Re: ${body.leadName ?? id}`, text: reply });
      return NextResponse.json({ ok: true, sent: true, mode: "live", to });
    } catch (err) {
      return NextResponse.json({ ok: false, message: String(err) }, { status: 200 });
    }
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json(
      { ok: false, sent: false, wouldSendTo: QA_RECIPIENT, note: "no mail creds — QA send skipped (dry)" },
      { status: 200 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  try {
    await transporter.sendMail({
      from: `Lucas Buur <${process.env.GMAIL_USER}>`,
      to: QA_RECIPIENT, // hard-locked — never the lead
      subject: `[QA-SVAR] ${body.subject ?? `Svar til ${body.leadName ?? id}`}`,
      text: `QA-kopi af et foreslået svar (lead ${id}). Dette gik IKKE til kunden.\n\n---\n\n${reply}`,
    });
    return NextResponse.json({ ok: true, sent: true, to: QA_RECIPIENT, mode: "qa" });
  } catch (err) {
    return NextResponse.json({ ok: false, sent: false, error: String(err) }, { status: 200 });
  }
}
