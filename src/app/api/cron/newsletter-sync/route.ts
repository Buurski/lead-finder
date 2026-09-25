import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { syncNewsletters } from "@/lib/hq/newsletter-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dagligt: henter nyhedsbrev-aggregater fra kundernes egne sites (kun GET, kun tal). Fail-closed på CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  const results = await syncNewsletters(getDb());
  for (const r of results) if (!r.ok) console.warn(JSON.stringify({ evt: "newsletter-sync.failed", ...r }));
  return NextResponse.json({ ok: results.every((r) => r.ok || r.error === "token ikke sat"), results });
}
