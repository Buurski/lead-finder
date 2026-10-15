import PageHeader from "@/components/shell/PageHeader";
import Inspiration from "@/components/marketing/Inspiration";
import { getDb } from "@/lib/db/client";
import { listRefs } from "@/lib/hq/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspiration · Marketing · Kinly HQ" };

export default async function InspirationPage() {
  const items = await listRefs(getDb(), "inspiration");
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Wand" title="Inspiration" subtitle="Formater og mønstre fra videoer, der har klaret sig godt. Læg selv links ind." />
      <Inspiration initial={items} />
    </div>
  );
}
