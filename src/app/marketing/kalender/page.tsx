import PageHeader from "@/components/shell/PageHeader";
import Calendar from "@/components/marketing/Calendar";
import { getDb } from "@/lib/db/client";
import { listDrafts } from "@/lib/hq/marketing";
import { todayCph } from "@/lib/hq/marketing-calc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kalender · Marketing · Kinly HQ" };

export default async function KalenderPage() {
  const drafts = await listDrafts(getDb());
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Calendar" title="Kalender" subtitle="Fire uger frem. Sæt en dato på de videoer, I har godkendt." />
      <Calendar initial={drafts} today={todayCph()} />
    </div>
  );
}
