import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { googleGscQuery, syncGsc } from "@/lib/hq/gsc";
import { copenhagenNow } from "@/lib/settings";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Mandag: Search Console-tal (28 dage + 90 dages dagserie) for hver aktiv kunde. Kun læsning.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const results = await withCronLog("gsc-snapshot", async () => {
      const results = await syncGsc(getDb(), await googleGscQuery(), copenhagenNow().date);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) throw new Error(failed.map((r) => `${r.company}: ${r.error}`).join("; "));
      const saved = results.filter((r) => r.property).length;
      const none = results.filter((r) => r.error === "ingen adgang").map((r) => r.company);
      return { result: results, note: `${saved} kunder målt${none.length ? `; ingen GSC-adgang: ${none.join(", ")}` : ""}` };
    });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
