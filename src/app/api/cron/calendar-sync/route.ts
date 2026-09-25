import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { listMyDay } from "@/lib/hq/tasks";
import { googleCalApi, syncCalendar, type CalOwner, type SyncResult } from "@/lib/hq/gcal-sync";
import { copenhagenNow } from "@/lib/settings";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Hver time: åbne opgaver + aftalers næste skridt → Google Kalender med påmindelser.
// Kalender-id pr. person i env (HQ_GCAL_LUCAS / HQ_GCAL_CHARLIE); kalenderen skal være
// delt med service-accountens mail med "Foretag ændringer i begivenheder".
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  const calendars = (["lucas", "charlie"] as CalOwner[])
    .map((owner) => ({ owner, id: process.env[`HQ_GCAL_${owner.toUpperCase()}`]?.trim() }))
    .filter((c): c is { owner: CalOwner; id: string } => !!c.id);
  try {
    const results = await withCronLog("calendar-sync", async () => {
      if (!calendars.length) return { result: [] as SyncResult[], note: "ikke sat op — HQ_GCAL_LUCAS mangler" };
      const { date } = copenhagenNow();
      const items = await listMyDay(getDb(), { today: date });
      const api = await googleCalApi();
      const out: SyncResult[] = [];
      for (const c of calendars) out.push(await syncCalendar(api, c.id, c.owner, items, date));
      return { result: out, note: out.map((r) => `${r.owner}: +${r.inserted} ~${r.updated} −${r.removed}`).join(", ") };
    });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
