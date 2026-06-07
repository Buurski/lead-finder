import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readQueue, updateDraft } from "@/lib/queue";

// POST /api/approve/send — send the APPROVED drafts.
//
// TEST-MODE (current): every mail goes ONLY to buur.aigro@gmail.com so Lucas can see
// the real outreach without anything reaching a lead. The recipient is hard-locked,
// exactly like the QA reply path. Going live later = flip TEST_MODE off + send to the
// lead's real email (which lives on the lead row, not the draft) behind canSendTo +
// the pause-guard. Until then this NEVER mails a lead.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QA_RECIPIENT = "buur.aigro@gmail.com";
const TEST_MODE = true; // go-live is a deliberate, separate change

export async function POST() {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Ingen mail-creds." }, { status: 200 });
  }
  const drafts = await readQueue();
  const approved = drafts.filter((d) => d.status === "approved");
  if (approved.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, note: "Ingen godkendte udkast at sende." });
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  let sent = 0;
  let failed = 0;
  for (const d of approved) {
    const to = TEST_MODE ? QA_RECIPIENT : ""; // go-live: resolve the lead's real email here
    if (!to) { failed++; continue; }
    try {
      await transporter.sendMail({
        from: `Lucas Buur <${process.env.GMAIL_USER}>`,
        to, // hard-locked to QA in TEST_MODE — never a lead
        subject: TEST_MODE ? `[TEST → ${d.name}] ${d.subject}` : d.subject,
        text: TEST_MODE
          ? `TEST-kopi af et godkendt udkast. Ville være sendt til: ${d.name} (${d.branch}, ${d.city}).\nGik IKKE til kunden.\n\n---\n\n${d.body}`
          : d.body,
      });
      await updateDraft(d.id, { status: "sent" });
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, mode: TEST_MODE ? "test" : "live", recipient: TEST_MODE ? QA_RECIPIENT : "lead" });
}
