import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { fetchKinlyGsc, googleGscInspect, googleGscQuery, inspectBlogUrls, syncGsc } from "@/lib/hq/gsc";
import { listPosts } from "@/lib/hq/posts";
import { saveKinlyGsc } from "@/lib/hq/seo-signals";
import { copenhagenNow } from "@/lib/settings";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Mandag: Search Console-tal (28 dage + 90 dages dagserie) for hver aktiv kunde + kinly.dk
// (inkl. blog-sider og indeks-status pr. udgivet indlæg). Kun læsning.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const results = await withCronLog("gsc-snapshot", async () => {
      const q = await googleGscQuery();
      const today = copenhagenNow().date;
      // kinly.dk selv (SEO-fanen). Må ikke vælte kundernes måling.
      // + /blog/-sider og om de udgivne indlæg er i Googles indeks (URL Inspection).
      const kinly = await fetchKinlyGsc(q, today).then(async (doc) => {
        if (doc.property) {
          const urls = (await listPosts(getDb(), { stage: "udgivet" })).map((p) => p.publishedUrl).filter((u): u is string => !!u);
          if (urls.length) doc.index = await inspectBlogUrls(await googleGscInspect(), doc.property, urls);
        }
        return saveKinlyGsc(doc);
      }).then(() => "", (e) => `; kinly.dk fejlede: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      const results = await syncGsc(getDb(), q, today);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) throw new Error(failed.map((r) => `${r.company}: ${r.error}`).join("; "));
      const saved = results.filter((r) => r.property).length;
      const none = results.filter((r) => r.error === "ingen adgang").map((r) => r.company);
      return { result: results, note: `${saved} kunder målt${none.length ? `; ingen GSC-adgang: ${none.join(", ")}` : ""}${kinly}` };
    });
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
