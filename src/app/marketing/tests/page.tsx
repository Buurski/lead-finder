import PageHeader from "@/components/shell/PageHeader";
import AbTests from "@/components/marketing/AbTests";
import { getDb } from "@/lib/db/client";
import { listMeasures, listRefs } from "@/lib/hq/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "A/B-tests · Marketing · Kinly HQ" };

export default async function MarketingTestsPage() {
  const db = getDb();
  const [tests, measures] = await Promise.all([listRefs(db, "ab"), listMeasures(db)]);
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Scale" title="A/B-tests" subtitle="To udgaver af samme video, målt på rigtige opslag. Siden her siger, hvornår vi tør tro på tallene." />
      <AbTests initialTests={tests} measures={measures} />
    </div>
  );
}
