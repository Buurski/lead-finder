import { NextResponse } from "next/server";
import { computeTodaysQueue } from "@/lib/queue";
import { getPauseStatus } from "@/lib/sheets";
import { transporter } from "@/lib/email";

export const maxDuration = 60;

// 07:00 UTC daily (≈09:00 local CEST). Sends Lucas one notification email
// summarising today's planned cold + follow-up queue, with a link to the
// review page where he can skip individual leads or halt all sends.

const REVIEW_URL = "https://lead-finder-three-beta.vercel.app/review";
const HALT_URL = "https://lead-finder-three-beta.vercel.app/review/halt";
const NOTIFY_TO = "buur.aigro@gmail.com";

function getAppUrl(): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://lead-finder-three-beta.vercel.app";
}

export async function GET() {
  try {
    const pause = await getPauseStatus();
    if (pause.paused) {
      return NextResponse.json({
        skipped: "paused",
        pausedUntil: pause.until,
      });
    }

    const queue = await computeTodaysQueue();
    const { summary } = queue;

    if (summary.total === 0) {
      // Still send a "nothing today" mail so Lucas knows the cron ran —
      // silence is worse than a boring inbox.
      await transporter.sendMail({
        from: `Lead Finder <${process.env.GMAIL_USER}>`,
        to: NOTIFY_TO,
        subject: "🌅 Lead review · 0 leads i dag",
        text: `Ingen leads klar til afsendelse i dag (hverken cold eller follow-up).\n\nDashboard: ${getAppUrl()}/email\nKø: ${REVIEW_URL}\n`,
      });
      return NextResponse.json({ sent: true, total: 0 });
    }

    const subject = `🌅 Lead review · ${summary.cold} cold + ${summary.followups} follow-ups · ${summary.concerning} concerning`;

    // Body in Danish since Lucas is reading on his phone. Keep it short — the
    // bulk of the value is the link to /review where he can actually act.
    const bodyTextLines = [
      `${summary.total} leads queued i dag (cap ${summary.cap}).`,
      ``,
      `• ${summary.cold} cold-mails`,
      `• ${summary.followups} follow-ups`,
      ``,
      `Heraf:`,
      `• ${summary.brokenClaim} mails der ville claime "broken website"`,
      `• ${summary.chains} mulige kæder`,
      `• ${summary.standard} standard`,
      ``,
      `Åbn review-køen: ${REVIEW_URL}`,
      `Stop alt i dag:   ${HALT_URL}`,
      ``,
      `Køen sender automatisk kl. 10:00 UTC (≈12:00 CEST). Skip enkelte leads`,
      `eller tryk "Stop alt" hvis noget ser galt ud.`,
    ];
    if (queue.overflow.cold > 0 || queue.overflow.followups > 0) {
      bodyTextLines.push(
        ``,
        `Ikke i dag pga. cap: ${queue.overflow.cold} cold + ${queue.overflow.followups} follow-ups — ryger med i morgen.`
      );
    }
    const text = bodyTextLines.join("\n");

    const html = `<!DOCTYPE html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.5; max-width: 520px;">
  <p style="font-size: 17px; margin-bottom: 4px;"><strong>${summary.total} leads queued i dag</strong> <span style="color:#888;">(cap ${summary.cap})</span></p>
  <p style="margin-top: 0;">
    ${summary.cold} cold-mails · ${summary.followups} follow-ups
  </p>
  <ul style="margin: 12px 0; padding-left: 18px;">
    <li>${summary.brokenClaim} mails der ville claime "broken website"</li>
    <li>${summary.chains} mulige kæder</li>
    <li>${summary.standard} standard</li>
  </ul>
  <p style="margin-top: 20px;">
    <a href="${REVIEW_URL}" style="display:inline-block; padding:10px 16px; background:#2563eb; color:#fff; border-radius:6px; text-decoration:none; font-weight:600;">Åbn review-køen</a>
    &nbsp;
    <a href="${HALT_URL}" style="display:inline-block; padding:10px 16px; background:#dc2626; color:#fff; border-radius:6px; text-decoration:none; font-weight:600;">🛑 Stop alt i dag</a>
  </p>
  <p style="color:#888; font-size:13px; margin-top: 24px;">
    Køen sender automatisk kl. 10:00 UTC (≈12:00 CEST). Skip enkelte leads eller tryk "Stop alt" hvis noget ser galt ud.
  </p>
  ${queue.overflow.cold > 0 || queue.overflow.followups > 0
    ? `<p style="color:#888; font-size:13px;">Ikke i dag pga. cap: ${queue.overflow.cold} cold + ${queue.overflow.followups} follow-ups — ryger med i morgen.</p>`
    : ""}
</body></html>`;

    await transporter.sendMail({
      from: `Lead Finder <${process.env.GMAIL_USER}>`,
      to: NOTIFY_TO,
      subject,
      text,
      html,
    });

    return NextResponse.json({
      sent: true,
      summary,
      overflow: queue.overflow,
    });
  } catch (err) {
    console.error("morning-review failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
