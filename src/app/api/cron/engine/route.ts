import { NextResponse } from "next/server";
import { readSettings } from "@/lib/settings";
import { runEngine } from "@/lib/engine";
import { withCronLog } from "@/lib/cron-log";

// GET /api/cron/engine — the morning auto-run hook for Vercel Cron.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const s = await readSettings();
  if (!s.autoEngine) {
    withCronLog("engine", async () => ({
      result: { ok: true } as { ok: true },
      note: "auto-engine slukket i settings — ingen kørsel",
    })).catch(() => {});
    return NextResponse.json({ ok: true, ran: false, reason: "auto-engine slukket i settings" });
  }
  try {
    const summary = await withCronLog("engine", async () => {
      const r = await runEngine({ limit: s.dailyLimit, persist: true });
      return { result: r, note: `draftet ${r.drafted} · skrevet ${r.written}`, meta: { drafted: r.drafted, written: r.written } };
    });
    return NextResponse.json({ ok: true, ran: true, drafted: summary.drafted, written: summary.written, note: "kø fyldt — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, ran: false, error: String(err) }, { status: 500 });
  }
}
