import { NextResponse } from "next/server";
import { syncReplies } from "@/lib/sync-replies";

// GET /api/cron/sync-replies — the automatic reply-sync hook for Vercel Cron.
//
// Runs every morning (see vercel.json) so inbound replies land in the CRM by
// themselves — no need to open the dashboard and press the button. Like the
// engine cron it shares an optional CRON_SECRET guard. It only reads the inbox
// and flips matching leads to "replied"; it never sends mail.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const { synced, checked, names } = await syncReplies();
    return NextResponse.json({ ok: true, synced, checked, names, note: "svar synket — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
