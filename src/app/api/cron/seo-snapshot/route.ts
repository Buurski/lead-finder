import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { runSeoSnapshots } from "@/lib/hq/seo-history";

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
    return NextResponse.json({ ok: true, ...await runSeoSnapshots(getDb()) });
  } catch (error) {
    console.error(JSON.stringify({ evt: "seo-snapshot.failed", error: String(error).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "måling fejlede" }, { status: 500 });
  }
}
