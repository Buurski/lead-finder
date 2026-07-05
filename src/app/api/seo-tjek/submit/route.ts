// POST /api/seo-tjek/submit — the public funnel endpoint. Validates the form,
// rate-limits (public route that triggers paid Google API calls + a mail),
// runs the full free check inline, stores submission + report, sends the
// day 0 mail and answers with the report URL.
//
// Abuse guards, in order:
//  0. Honeypot — hidden "website2" field; if filled, silent-drop (no checks,
//     no mail) and bump the honeypot counter.
//  1. validateSubmission — SSRF-guarded URL + email + consent required.
//  2. Per-IP rate limit: 3 checks/hour (Vercel KV REST when configured).
//     Fail-closed on Vercel: no KV, or a failing KV call, refuses the request
//     (503/429) rather than run the paid check unguarded. In-memory fallback
//     is local-dev only.
//  3. Global daily cap on paid-API spend.
//  4. 24h dedupe on url+email — same person re-submitting gets the existing
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

  // Fail-closed on Vercel: this public route triggers paid Google API calls and
  // a mail, so it must never run without a durable rate-limit backend. If KV is
  // not configured in prod, refuse (treat as rate-limited). In-memory is a
  // best-effort fallback for local dev only. Mirrors the CRON_SECRET fund.
  if (!url || !tok) {
    if (process.env.VERCEL) return true;
    const now = Date.now();
    const hit = memHits.get(ip);
    if (!hit || hit.resetAt < now) {
      memHits.set(ip, { count: 1, resetAt: now + 3600_000 });
      return false;
    }
    hit.count++;
    return hit.count > RL_MAX_PER_HOUR;
  }

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
    if (!res.ok) throw new Error(`KV ${res.status}`);
    const json = (await res.json()) as Array<{ result?: number }>;
    const count = json?.[0]?.result ?? 0;
    return count > RL_MAX_PER_HOUR;
  } catch {
    // KV call failed. On Vercel, fail-closed (refuse) rather than let the paid
    // route run unguarded; locally, fall back to the in-memory counter.
    if (process.env.VERCEL) return true;
    const now = Date.now();
    const hit = memHits.get(ip);
    if (!hit || hit.resetAt < now) {
      memHits.set(ip, { count: 1, resetAt: now + 3600_000 });
      return false;
    }
    hit.count++;
    return hit.count > RL_MAX_PER_HOUR;
  }
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
  // x-forwarded-host er domænet brugeren faktisk ramte (fx *-three-beta.vercel.app).
  // VERCEL_URL er den interne per-deployment-URL — links i mails må ikke pege
  // derhen: den skifter ved hvert deploy og kan senere ryddes op/beskyttes.
  const fwd = (req.headers.get("x-forwarded-host") || "").split(",")[0].trim();
  if (fwd) return `https://${fwd}`;
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

  // Honeypot: a hidden field ("website2") no real user ever fills. A bot that
  // fills every input trips it. Silent drop — answer with a plausible success
  // shape and run NO checks/mail, so the bot cannot tell it was blocked.
  const website2 = (body as Record<string, unknown> | null)?.website2;
  if (typeof website2 === "string" && website2.trim() !== "") {
    await bumpStats("honeypot");
    return NextResponse.json({ ok: true, id: crypto.randomUUID(), reportUrl: baseUrl(req) + "/seo-tjek" });
  }

  const v = validateSubmission(body);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });

  const ip = clientIp(req);
  const limited = await rateLimited(ip);
  if (limited) {
    // On Vercel with no KV, rateLimited fail-closes for everyone — surface that
    // as a 503 "temporarily unavailable" rather than a misleading rate-limit.
    if (process.env.VERCEL && (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN)) {
      return NextResponse.json(
        { ok: false, error: "Tjenesten er midlertidigt utilgængelig. Prøv igen senere." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "Du har tjekket flere sider den seneste time. Prøv igen senere." },
      { status: 429 },
    );
  }

  // Global daily cap — the per-IP limit alone doesn't stop a distributed
  // farm from burning PageSpeed/Places quota. Soft counter (not atomic, fine
  // as a budget brake). SEO_TJEK_DAILY_CAP overrides the default 50.
  const dailyCap = parseInt(process.env.SEO_TJEK_DAILY_CAP || "50", 10);
  const dayKey = `seo-tjek-daycap-${new Date().toISOString().slice(0, 10)}`;
  try {
    const used = (await store.get<number>(dayKey)) ?? 0;
    if (used >= dailyCap) {
      return NextResponse.json(
        { ok: false, error: "Dagens gratis tjek er brugt op. Prøv igen i morgen." },
        { status: 429 },
      );
    }
    await store.put(dayKey, used + 1);
  } catch { /* cap is best-effort */ }

  const base = baseUrl(req);

  // 24h dedupe: same url+email answers with the existing report — no new spend.
  const dedupeKey = `seo-tjek-dedupe-${crypto.createHash("sha256").update(`${v.url}|${v.email}`).digest("hex").slice(0, 24)}`;
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
