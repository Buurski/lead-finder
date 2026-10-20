import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { runSeoSnapshots } from "@/lib/hq/seo-history";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Ugentligt pga. PageSpeed-tid og kvote. Kan gøres dagligt, hvis kapaciteten tillader det.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const out = await withCronLog("seo-snapshot", async () => ({ result: await runSeoSnapshots(getDb()) }));
    return NextResponse.json({ ok: true, ...out });
  } catch (error) {
    console.error(JSON.stringify({ evt: "seo-snapshot.failed", error: String(error).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "måling fejlede" }, { status: 500 });
  }
}
