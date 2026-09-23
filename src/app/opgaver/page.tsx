import { getDb } from "@/lib/db/client";
import { listMyDay } from "@/lib/hq/tasks";
import { copenhagenNow } from "@/lib/settings";
import { currentUser } from "@/lib/current-user";
import PageHeader from "@/components/shell/PageHeader";
import OpgaverBoard from "@/components/opgaver/OpgaverBoard";

// /opgaver — den daglige arbejdsløkke (bølge 3). Serveren henter den fulde,
// kryds-ejer liste én gang; fanerne/ejer-filteret er klient-side (OpgaverBoard).
export const dynamic = "force-dynamic";
export const metadata = { title: "Opgaver · Kinly HQ" };

export default async function OpgaverPage() {
  const { date: today } = copenhagenNow();
  const user = await currentUser();
  const defaultOwner = user === "lucas" || user === "charlie" ? user : "";
  const items = await listMyDay(getDb(), { today });

  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="ListChecks" title="Opgaver" subtitle="Min dag: opgaver og aftalers næste skridt, ét sted." />
      <OpgaverBoard initialItems={items} today={today} defaultOwner={defaultOwner} />
    </div>
  );
}
