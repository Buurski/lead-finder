import { NextResponse } from "next/server";
import { readSettings, writeSettings, copenhagenNow } from "@/lib/settings";
import { runEngine } from "@/lib/engine";

// GET /api/cron/engine — the morning auto-run hook for Vercel Cron (Pro).
//
// The cron fires HOURLY (vercel.json) and this route decides whether to run:
//   1. autoEngine must be armed in Settings (default OFF).
//   2. The current Copenhagen hour must equal Settings.autoEngineHour — so the
//      "time (hour)" Lucas picks is REAL and DST-correct despite the UTC cron.
//   3. It runs at most ONCE per Copenhagen day (lastAutoRunDate idempotency), so a
//      double-fire in the armed hour can't double-fill the queue.
// It only ever fills the approval queue — it never sends mail. ?force=1 (with a
// valid secret) bypasses the hour + idempotency gates for manual testing.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Optional shared-secret guard for the cron caller (Vercel Cron sends it when
  // CRON_SECRET is set).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const force = new URL(req.url).searchParams.get("force") === "1";
  const s = await readSettings();
  if (!s.autoEngine) {
    return NextResponse.json({ ok: true, ran: false, reason: "auto-engine slukket i settings" });
  }

  const { date, hour } = copenhagenNow();
  if (!force) {
    if (hour !== s.autoEngineHour) {
      return NextResponse.json({ ok: true, ran: false, reason: `ikke den armede time (nu ${hour}, sat ${s.autoEngineHour})` });
    }
    if (s.lastAutoRunDate === date) {
      return NextResponse.json({ ok: true, ran: false, reason: `allerede kørt i dag (${date})` });
    }
  }

  // Claim the day BEFORE running so a Vercel retry (e.g. after a long run times
  // out) can't fire runEngine a second time and double-fill the queue. If the run
  // itself fails we revert the stamp so a later legitimate retry can still run.
  const prevStamp = s.lastAutoRunDate ?? "";
  await writeSettings({ lastAutoRunDate: date });
  try {
    const summary = await runEngine({ limit: s.dailyLimit, persist: true });
    return NextResponse.json({ ok: true, ran: true, drafted: summary.drafted, written: summary.written, note: "kø fyldt — ingen mail sendt" });
  } catch (err) {
    await writeSettings({ lastAutoRunDate: prevStamp }).catch(() => {});
    return NextResponse.json({ ok: false, ran: false, error: String(err) }, { status: 500 });
  }
}
