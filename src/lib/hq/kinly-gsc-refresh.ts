import { getDb } from "@/lib/db/client";
import { fetchKinlyGsc, googleGscInspect, googleGscQuery, inspectBlogUrls } from "@/lib/hq/gsc";
import { listPosts } from "@/lib/hq/posts";
import { saveKinlyGsc, type KinlyGsc } from "@/lib/hq/seo-signals";
import { copenhagenNow } from "@/lib/settings";

/** kinly.dk i Search Console (+ indeks-status for udgivne indlæg) → gemt til SEO-fanen.
 *  Bruges af mandags-cron'en og af "Hent nu"-knappen. Kun læsning i GSC. */
export async function refreshKinlyGsc(): Promise<KinlyGsc> {
  const doc = await fetchKinlyGsc(await googleGscQuery(), copenhagenNow().date);
  if (doc.property) {
    const urls = (await listPosts(getDb(), { stage: "udgivet" })).map((p) => p.publishedUrl).filter((u): u is string => !!u);
    if (urls.length) doc.index = await inspectBlogUrls(await googleGscInspect(), doc.property, urls);
  }
  await saveKinlyGsc(doc);
  return doc;
}
