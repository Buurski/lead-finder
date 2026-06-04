import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { runEngine } from "@/lib/engine";

// GET /api/cron/engine — the morning auto-run hook for Vercel Cron.
//
// Guarded TWO ways: it no-ops unless Settings.autoEngine is armed (default OFF),
// and it only ever fills the approval queue (never sends mail). When armed it
// runs the engine for Settings.dailyLimit drafts. The cron schedule lives in
// vercel.json; this route decides whether to actually do anything.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Optional shared-secret guard for the cron caller.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const s = readSettings();
  if (!s.autoEngine) {
    return NextResponse.json({ ok: true, ran: false, reason: "auto-engine slukket i settings" });
  }

  try {
    const summary = await runEngine({ limit: s.dailyLimit, persist: true });
    return NextResponse.json({ ok: true, ran: true, drafted: summary.drafted, written: summary.written, note: "kø fyldt — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, ran: false, error: String(err) }, { status: 500 });
  }
}
