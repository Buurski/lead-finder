import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { checkAllSites } from "@/lib/hq/site-health";

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
    return NextResponse.json({ ok: true, ...(await checkAllSites(getDb())) });
  } catch (err) {
    console.error(JSON.stringify({ evt: "site-health.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "tjek fejlede" }, { status: 500 });
  }
}
