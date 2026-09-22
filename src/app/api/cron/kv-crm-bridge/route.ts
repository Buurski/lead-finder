import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { bridgeKvCrm, loadKvCrm } from "@/lib/pg/kv-bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Timelig bro: CRM-poster Hermes (crm-mail-sync) stadig skriver i KV → Postgres.
// Fail-closed på CRON_SECRET som de andre crons.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const added = await bridgeKvCrm(getDb(), await loadKvCrm());
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    console.error(JSON.stringify({ evt: "kv-crm-bridge.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "bro fejlede" }, { status: 500 });
  }
}
