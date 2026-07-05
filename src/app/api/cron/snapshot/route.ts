import { NextResponse } from "next/server";
import { getClients, getLeads, appendSnapshot } from "@/lib/sheets";
import { computeSnapshot } from "@/lib/history";
import { copenhagenNow } from "@/lib/settings";
import { withCronLog } from "@/lib/cron-log";

// GET /api/cron/snapshot — append (or refresh) today's finance snapshot.
//
// Idempotent: appendSnapshot upserts by Copenhagen date, so a double-fire in the
// same day updates the one row rather than duplicating it. Read-only w.r.t. the
// Clients tab — it only writes the Snapshots history tab (auto-created on first
// run). Exempt from basic auth via the /api/cron/ matcher in proxy.ts; guarded
// by CRON_SECRET like the other crons.
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
    const result = await withCronLog("snapshot", async () => {
      // Copenhagen day so the snapshot buckets align with the rest of the app.
      const { date } = copenhagenNow();
      const now = new Date(`${date}T12:00:00`);
      const [clients, leads] = await Promise.all([getClients(), getLeads()]);
      const snap = computeSnapshot(clients, now, leads.length);
      const { appended } = await appendSnapshot(snap);
      return {
        result: { ok: true as const, appended, snapshot: snap },
        note: `${appended ? "tilføjet" : "opdateret"} ${snap.date}: MRR ${snap.mrr_runrate}, ${snap.clients_live} live, ${snap.open_deal_count} åbne`,
      };
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ ok: false, error: "snapshot failed" }, { status: 500 });
  }
}
