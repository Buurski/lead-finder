import PageHeader from "@/components/shell/PageHeader";
import Measure from "@/components/marketing/Measure";
import { getDb } from "@/lib/db/client";
import { listDrafts, listMeasures, listRefs } from "@/lib/hq/marketing";
import { todayCph } from "@/lib/hq/marketing-calc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Måling · Marketing · Kinly HQ" };

export default async function MaalingPage() {
  const db = getDb();
  const [drafts, tests, measures] = await Promise.all([listDrafts(db), listRefs(db, "ab"), listMeasures(db)]);
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="BarChart3" title="Måling" subtitle="Skriv tallene fra Instagram og TikTok ind her. Intet hentes automatisk." />
      <Measure drafts={drafts} tests={tests} initial={measures} today={todayCph()} />
    </div>
  );
}
