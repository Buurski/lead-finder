import PageHeader from "@/components/shell/PageHeader";
import Annoncer from "@/components/marketing/Annoncer";
import { loadAnnoncer, loadStudie } from "@/lib/hq/annoncer";

export const dynamic = "force-dynamic";
export const metadata = { title: "Annoncer · Marketing · Kinly HQ" };

export default async function AnnoncerPage() {
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Megaphone" title="Annonce-studie" subtitle="Vælg skærm og tekst, godkend, test 2 til 3 annoncer mod hinanden. Intet bliver lagt ud eller betalt herfra." />
      <Annoncer rows={loadAnnoncer()} initial={await loadStudie()} />
    </div>
  );
}
