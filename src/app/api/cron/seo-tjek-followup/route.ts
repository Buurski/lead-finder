// GET /api/cron/seo-tjek-followup — day 7 follow-up for the free SEO-check
// funnel. Daily via Vercel Cron. For every submission that (a) got its day 0
// report mail, (b) is 7+ days old, (c) has not been followed up and (d) has
// not unsubscribed, send the retainer-upsell mail (Vida case) and stamp
// day7SentAt. Capped per run so a backlog can never burst.

import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { withCronLog } from "@/lib/cron-log";
import { day7Mail, bumpStats, SUB_PREFIX, type SeoTjekSubmission } from "@/lib/seo-tjek";
import { defaultSender, getTransporter, formatFrom, isSenderAvailable } from "@/lib/senders";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_PER_RUN = 20;
const DAY7_MS = 7 * 24 * 60 * 60 * 1000;

function baseUrl(): string {
  const env = (process.env.APP_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function GET(req: Request): Promise<NextResponse> {
  // Stricter than the other crons: this route mails REAL visitor addresses, so
  // on Vercel it refuses to run without a configured secret (council fund).
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.VERCEL) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET mangler — nægter at sende mails uden auth" }, { status: 401 });
  }
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    type RunResult = { sent: number; due: number; skipped?: string; errors?: string[] };
    const result = await withCronLog<RunResult>("seo-tjek-followup", async () => {
      const senderId = defaultSender();
      if (!isSenderAvailable(senderId)) {
        return { result: { sent: 0, due: 0, skipped: "ingen mail-konto" }, note: "springet over: ingen mail-konto", meta: {} };
      }
      const base = baseUrl();
      const now = Date.now();
      const keys = await store.list(SUB_PREFIX);
      let sent = 0;
      let due = 0;
      const errors: string[] = [];

      for (const key of keys) {
        if (sent >= MAX_PER_RUN) break;
        const sub = await store.get<SeoTjekSubmission>(key);
        if (!sub?.day0SentAt || sub.day7SentAt || sub.unsubscribedAt) continue;
        if (now - Date.parse(sub.createdAt) < DAY7_MS) continue;
        due++;
        try {
          const reportUrl = `${base}/seo-tjek/rapport/${sub.id}`;
          const to = (process.env.SEO_TJEK_TEST_RECIPIENT || "").trim() || sub.email;
          const mail = day7Mail(sub, reportUrl);
          await getTransporter(senderId).sendMail({
            from: formatFrom(senderId),
            to,
            subject: mail.subject,
            text: mail.text,
            html: mail.html,
          });
          sub.day7SentAt = new Date().toISOString();
          await store.put(key, sub);
          await bumpStats("day7Sent");
          sent++;
        } catch (err) {
          errors.push(`${sub.id}: ${String(err).slice(0, 80)}`);
        }
      }
      return {
        result: { sent, due, errors },
        note: `${sent} af ${due} opfølgninger sendt`,
        meta: { sent, due },
      };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
