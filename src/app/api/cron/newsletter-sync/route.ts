import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { syncNewsletters } from "@/lib/hq/newsletter-sync";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dagligt: henter nyhedsbrev-aggregater fra kundernes egne sites (kun GET, kun tal). Fail-closed på CRON_SECRET.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  const results = await withCronLog("newsletter-sync", async () => {
    const results = await syncNewsletters(getDb());
    for (const r of results) if (!r.ok) console.warn(JSON.stringify({ evt: "newsletter-sync.failed", ...r }));
    // Manglende token tæller også som fejl: ellers står health grøn, mens intet synkes.
    const failed = results.filter((r) => !r.ok);
    if (failed.length) throw new Error(failed.map((r) => `${r.account}: ${r.error}`).join("; "));
    return { result: results, note: `${results.filter((r) => r.ok).length} af ${results.length} konti hentet` };
  }).catch((err: unknown) => [{ account: "*", ok: false, error: err instanceof Error ? err.message : String(err) }]);
  const ok = results.every((r) => r.ok);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
}
