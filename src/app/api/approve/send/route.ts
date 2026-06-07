import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { readQueue, updateDraft } from "@/lib/queue";
import { getLeads, getPauseStatus, updateLeadEmailStatus } from "@/lib/sheets";
import { canSendTo } from "@/lib/canSendTo";

// POST /api/approve/send — send the approved drafts FOR REAL (Lucas authorized
// go-live 2026-06-07/08). Human, paced sending — NEVER a burst.
//
// Safety, in order:
//   1. PAUSE / halt-flag — if PauseSchedule is active, send NOTHING and report it.
//   2. NEVER re-contact — skip any lead that already has emailSentAt set, plus
//      canSendTo (chain/public/hostile/bounced/replied/unsubscribed/no-email).
//   3. PER-RUN CAP — at most SEND_CAP per click; the rest wait for the next click.
//   4. HUMAN SPACING — a randomised pause between each send (never all at once).
//   5. On success — mark the draft "sent" + stamp the lead emailSentAt + emailStatus
//      "sent" so it can never be contacted again.
//
// Selection includes status "approved" PLUS old "sent" drafts whose lead was never
// actually emailed (the earlier test-mode runs marked drafts "sent" but didn't stamp
// the lead) — so the previously-approved batch goes out for real now. The emailSentAt
// guard makes this idempotent: a truly-contacted lead is always skipped.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEND_CAP = 6;            // most per click — paced, not a blast (fits maxDuration with gaps)
const GAP_MIN_MS = 22_000;    // human spacing between sends: 22–45s
const GAP_MAX_MS = 45_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randGap = () => GAP_MIN_MS + Math.floor(Math.random() * (GAP_MAX_MS - GAP_MIN_MS));
// "Already contacted" = a REAL send happened: emailSentAt is stamped, OR a real
// outcome status (replied/bounced/unsubscribed). A bare emailStatus "sent" WITHOUT
// emailSentAt is a stale/queued marker from the May limit-hit batch (mails were
// queued, marked, but never actually went out) — those are still sendable.
const alreadyEmailed = (l: { emailSentAt?: string; emailStatus?: string }) =>
  Boolean(l.emailSentAt && l.emailSentAt.trim()) ||
  /^(replied|bounced|unsubscribed)$/i.test((l.emailStatus || "").trim());

export async function POST(req: Request) {
  // ?force=1 overrides ONLY the never-re-contact guard (emailSentAt) — used for the
  // May limit-hit batch where emailSentAt was stamped optimistically but the mail
  // never actually went out (verified via Gmail). pause + canSendTo still apply.
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, error: "Ingen mail-creds." }, { status: 200 });
  }

  // 1. Never send while paused / halted.
  const pause = await getPauseStatus("cold");
  if (pause.paused) {
    return NextResponse.json({
      ok: false, paused: true, until: pause.until, sent: 0,
      error: `Afsendelse er på pause${pause.until ? ` til ${pause.until}` : ""}.`,
    });
  }

  const drafts = await readQueue();
  const candidates = drafts.filter((d) => d.status === "approved" || d.status === "sent");
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: [], note: "Ingen udkast at sende." });
  }

  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `Kunne ikke læse leads: ${String(err)}` }, { status: 200 });
  }
  const byId = new Map(leads.map((l) => [l.id, l]));

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  });

  let sent = 0;
  let failed = 0;
  let remaining = 0;
  const skipped: { name: string; reason: string }[] = [];

  for (const d of candidates) {
    const lead = (d.leadId && byId.get(d.leadId)) ||
      leads.find((l) => l.name.trim().toLowerCase() === d.name.trim().toLowerCase());
    if (!lead) { skipped.push({ name: d.name, reason: "lead ikke fundet" }); continue; }

    // 2. NEVER re-contact (unless force-overriding a known-false stamp).
    if (!force && alreadyEmailed(lead)) { skipped.push({ name: d.name, reason: "allerede kontaktet" }); continue; }
    const decision = canSendTo({ name: lead.name, branch: lead.branch, email: lead.email, emailStatus: lead.emailStatus, status: lead.status });
    if (!decision.ok) { skipped.push({ name: d.name, reason: decision.reason ?? "blokeret" }); continue; }

    // 3. Per-run cap — leave the rest for the next click.
    if (sent >= SEND_CAP) { remaining++; continue; }

    // 4. Human spacing before each send (except the first).
    if (sent > 0) await sleep(randGap());

    try {
      await transporter.sendMail({
        from: `Lucas Buur <${process.env.GMAIL_USER}>`,
        to: lead.email,
        subject: d.subject,
        text: d.body,
      });
      await updateDraft(d.id, { status: "sent" });
      const rowIndex = parseInt(lead.id, 10) - 2;
      if (Number.isFinite(rowIndex) && rowIndex >= 0) {
        await updateLeadEmailStatus(rowIndex, { emailSentAt: new Date().toISOString(), emailStatus: "sent" }).catch(() => {});
      }
      sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, sent, failed, remaining, skipped, mode: "live" });
}
