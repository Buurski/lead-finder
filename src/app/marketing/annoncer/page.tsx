import PageHeader from "@/components/shell/PageHeader";
import Annoncer from "@/components/marketing/Annoncer";
import { listBeslutninger, loadAnnoncer } from "@/lib/hq/annoncer";
import { motiver } from "@/lib/hq/annoncer-types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Annoncer · Marketing · Kinly HQ" };

export default async function AnnoncerPage() {
  const rows = loadAnnoncer();
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Megaphone" title="Annoncer" subtitle="Billeder og tekster til Facebook og Instagram, bygget af rigtige hjemmesider. Intet bliver lagt ud herfra." />
      <Annoncer motiver={motiver(rows)} initial={await listBeslutninger()} />
    </div>
  );
}
