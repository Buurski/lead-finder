import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { checkAllSites } from "@/lib/hq/site-health";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dagligt tjek af kundernes live sites (se lib/hq/site-health.ts). Fail-closed på CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const out = await withCronLog("site-health", async () => ({ result: await checkAllSites(getDb()) }));
    return NextResponse.json({ ok: true, ...out });
  } catch (err) {
    console.error(JSON.stringify({ evt: "site-health.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "tjek fejlede" }, { status: 500 });
  }
}
