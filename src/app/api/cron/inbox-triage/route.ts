import { NextResponse } from "next/server";
import { readSettings, writeSettings, copenhagenNow } from "@/lib/settings";
import { loadDigest, saveDigest } from "@/lib/inbox-digest";
import { liveScanDigest } from "@/lib/inbox-live";

// GET /api/cron/inbox-triage — the HYBRID fallback for inbox triage.
//
// Fires hourly (vercel.json). Runs the scan ITSELF only when:
//   1. autoInboxFallback is armed in Settings, AND
//   2. it's past fallbackCutoffHour (Copenhagen), AND
//   3. the Cowork "daily ops" task hasn't already posted a fresh digest today, AND
//   4. it hasn't already run today (idempotency).
// → tokens/effort are spent only when Cowork didn't deliver. ?force=1 (with secret)
// bypasses gates 2–4 for the manual "Scan nu" button. Never sends mail.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const force = new URL(req.url).searchParams.get("force") === "1";
  if (secret && !force) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const s = await readSettings();
  const { date, hour } = copenhagenNow();

  if (!force) {
    if (!s.autoInboxFallback) return NextResponse.json({ ok: true, ran: false, reason: "fallback slukket" });
    if (hour < (s.fallbackCutoffHour ?? 9)) return NextResponse.json({ ok: true, ran: false, reason: `før cutoff (${hour} < ${s.fallbackCutoffHour})` });
    if (s.lastInboxFallbackDate === date) return NextResponse.json({ ok: true, ran: false, reason: "allerede kørt i dag" });
    // Cowork already delivered a fresh digest today? Then don't spend tokens.
    const existing = await loadDigest();
    if (existing && existing.generatedBy === "cowork-opus" && existing.generatedAt.slice(0, 10) === date) {
      return NextResponse.json({ ok: true, ran: false, reason: "Cowork-digest allerede frisk i dag" });
    }
  }

  const live = await liveScanDigest();
  if (!live.ok || !live.digest) {
    return NextResponse.json({ ok: false, ran: false, error: live.error ?? "scan failed" }, { status: 200 });
  }
  await saveDigest(live.digest);
  if (!force) await writeSettings({ lastInboxFallbackDate: date });
  return NextResponse.json({ ok: true, ran: true, items: live.digest.items.length, needsReply: live.digest.items.filter((i) => i.needsReply).length });
}
