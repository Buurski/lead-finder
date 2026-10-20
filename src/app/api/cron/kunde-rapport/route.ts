import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { denneMaaned, oversigt } from "@/lib/hq/kunde-rapport";
import { iArbejdstid, klarTilAuto, sendKundeRapport } from "@/lib/hq/kunde-rapport-send";
import { withCronLog } from "@/lib/cron-log";

// GET /api/cron/kunde-rapport — hver time (vercel.json). Sender månedsrapporter hvis
// frist er gået og som ikke har en stop-grund (autoStop), kun på hverdage kl. 8-17.
// Kigger også på forrige måned: en måling fra d. 30. kl. 23 har sin frist d. 1.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const forrige = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }); // fail-closed
  }
  const nu = new Date();
  // Logges også uden for arbejdstid, ellers står jobbet forældet efter hver weekend.
  const out = await withCronLog<{ sendt: string[]; fejl: string[]; note?: string }>("kunde-rapport", async () => {
    if (!iArbejdstid(nu)) return { result: { sendt: [], fejl: [], note: "uden for arbejdstid" }, note: "uden for arbejdstid" };

    const db = getDb();
    const sendt: string[] = [];
    const fejl: string[] = [];
    const ym = denneMaaned(nu);
    for (const m of [forrige(ym), ym]) {
      for (const r of klarTilAuto((await oversigt(db, m)).raekker, nu)) {
        try {
          const res = await sendKundeRapport(db, r.domaene, m, "auto", { nu });
          sendt.push(`${r.domaene} ${m} → ${res.til}`);
        } catch (e) {
          // Én kundes fejl stopper ikke de andre; låsen (keyS) viser den i HQ som "afbrudt".
          fejl.push(`${r.domaene} ${m}: ${e instanceof Error ? e.message : String(e)}`);
          console.error("kunde-rapport cron:", r.domaene, m, e);
        }
      }
    }
    // cron-health er offentlig: ingen kundedomæner i fejlteksten (detaljerne står i Vercel-loggen).
    return { result: { sendt, fejl }, ok: fejl.length === 0,
      error: fejl.length ? `${fejl.length} rapport(er) fejlede` : undefined,
      note: `sendt ${sendt.length}` };
  });
  return NextResponse.json({ ok: out.fejl.length === 0, ...out });
}
