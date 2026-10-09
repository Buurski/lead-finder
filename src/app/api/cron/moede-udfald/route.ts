import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { sweepMeetingOutcomes } from "@/lib/hq/meetings";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Hver time: møder der er slut får præcis én opgave "Hvordan gik mødet?" (idempotent, se hq/meetings.ts).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const result = await withCronLog("moede-udfald", async () => {
      const r = await sweepMeetingOutcomes(getDb());
      return { result: r, note: `${r.created} opgave(r) oprettet` };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
