import { hqWrite } from "@/lib/hq/api";
import { refreshKinlyGsc } from "@/lib/hq/kinly-gsc-refresh";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST — "Hent nu"-knappen på SEO-fanen: samme kinly.dk-hentning som mandags-cron'en.
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const doc = await refreshKinlyGsc();
    return { property: doc.property, clicks: doc.totals.clicks, impressions: doc.totals.impressions };
  });
}
