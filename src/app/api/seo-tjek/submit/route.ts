// POST /api/seo-tjek/submit — the public funnel endpoint. Validates the form,
// rate-limits (public route that triggers paid Google API calls + a mail),
// runs the full free check inline, stores submission + report, sends the
// day 0 mail and answers with the report URL.
//
// Abuse guards, in order:
//  1. validateSubmission — SSRF-guarded URL + email + consent required.
//  2. Per-IP rate limit: 3 checks/hour (Vercel KV REST when configured,
//     in-memory fallback locally).
//  3. 24h dedupe on url+email — same person re-submitting gets the existing
//     report instead of new API spend.

import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import {
  validateSubmission,
  runFreeCheck,
  day0Mail,
  bumpStats,
  SUB_PREFIX,
  REPORT_PREFIX,
  type SeoTjekSubmission,
} from "@/lib/seo-tjek";
import { store } from "@/lib/store";
import { defaultSender, getTransporter, formatFrom, isSenderAvailable } from "@/lib/senders";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RL_MAX_PER_HOUR = 3;
const memHits = new Map<string, { count: number; resetAt: number }>();

async function rateLimited(ip: string): Promise<boolean> {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (url && tok) {
    try {
      const res = await fetch(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
        body: JSON.stringify([
          ["INCR", `seotjek:rl:${ip}`],
          ["EXPIRE", `seotjek:rl:${ip}`, "3600", "NX"],
        ]),
        signal: AbortSignal.timeout(2500),
      });
      const json = res.ok ? ((await res.json()) as Array<{ result?: number }>) : null;
      const count = json?.[0]?.result ?? 0;
      return count > RL_MAX_PER_HOUR;
    } catch {
      // KV unreachable — fall through to the in-memory counter.
    }
  }
  const now = Date.now();
  const hit = memHits.get(ip);
  if (!hit || hit.resetAt < now) {
    memHits.set(ip, { count: 1, resetAt: now + 3600_000 });
    return false;
  }
  hit.count++;
  return hit.count > RL_MAX_PER_HOUR;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function baseUrl(req: NextRequest): string {
  const env = (process.env.APP_URL || "").trim();
  if (env) return env.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return new URL(req.url).origin;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Ugyldigt input." }, { status: 400 });
  }

  const v = validateSubmission(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const ip = clientIp(req);
  if (await rateLimited(ip)) {
    return NextResponse.json(
      { ok: false, error: "Du har tjekket flere sider den seneste time. Prøv igen senere." },
      { status: 429 },
    );
  }

  const base = baseUrl(req);

  // 24h dedupe: same url+email answers with the existing report — no new spend.
  const dedupeKey = `seo-tjek/dedupe-${crypto.createHash("sha1").update(`${v.url}|${v.email}`).digest("hex").slice(0, 20)}`;
  try {
    const prior = await store.get<{ id: string; createdAt: string }>(dedupeKey);
    if (prior && Date.now() - Date.parse(prior.createdAt) < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ ok: true, id: prior.id, reportUrl: `${base}/seo-tjek/rapport/${prior.id}`, deduped: true });
    }
  } catch { /* dedupe is best-effort */ }

  const now = new Date().toISOString();
  const sub: SeoTjekSubmission = {
    id: crypto.randomUUID(),
    url: v.url,
    email: v.email,
    branch: v.branch,
    city: v.city,
    consent: true,
    consentAt: now,
    createdAt: now,
    ip,
  };
  await store.put(`${SUB_PREFIX}${sub.id}`, sub);
  await bumpStats("submissions");

  const report = await runFreeCheck(sub);
  await store.put(`${REPORT_PREFIX}${sub.id}`, report);
  sub.reportReady = true;
  await bumpStats("reports");

  const reportUrl = `${base}/seo-tjek/rapport/${sub.id}`;

  // Day 0 mail. SEO_TJEK_TEST_RECIPIENT (dev/preview) redirects every funnel
  // mail to the test inbox so a real visitor address is never mailed from test.
  let mailError: string | null = null;
  try {
    const senderId = defaultSender();
    if (!isSenderAvailable(senderId)) throw new Error("ingen mail-konto konfigureret");
    const to = (process.env.SEO_TJEK_TEST_RECIPIENT || "").trim() || sub.email;
    const mail = day0Mail(sub, report, reportUrl);
    await getTransporter(senderId).sendMail({
      from: formatFrom(senderId),
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    sub.day0SentAt = new Date().toISOString();
    await bumpStats("day0Sent");
  } catch (err) {
    mailError = String(err).slice(0, 160);
  }

  await store.put(`${SUB_PREFIX}${sub.id}`, sub);
  try {
    await store.put(dedupeKey, { id: sub.id, createdAt: sub.createdAt });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, id: sub.id, reportUrl, mailError });
}
