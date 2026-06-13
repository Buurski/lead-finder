import { NextResponse } from "next/server";
import { syncReplies } from "@/lib/sync-replies";
import { withCronLog } from "@/lib/cron-log";

// GET /api/cron/sync-replies — the automatic reply-sync hook for Vercel Cron.
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const { synced, checked, names } = await withCronLog("sync-replies", async () => {
      const r = await syncReplies();
      return { result: r, note: `tjekket ${r.checked} · ${r.synced} nye svar`, meta: { synced: r.synced, checked: r.checked } };
    });
    return NextResponse.json({ ok: true, synced, checked, names, note: "svar synket — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
