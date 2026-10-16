import PageHeader from "@/components/shell/PageHeader";
import DraftBoard from "@/components/marketing/DraftBoard";
import { getDb } from "@/lib/db/client";
import { listDrafts, listRefs } from "@/lib/hq/marketing";
import { todayCph } from "@/lib/hq/marketing-calc";

export const dynamic = "force-dynamic";
export const metadata = { title: "Kladder · Marketing · Kinly HQ" };

export default async function KladderPage({ searchParams }: { searchParams: Promise<{ kladde?: string }> }) {
  const { kladde } = await searchParams;
  const db = getDb();
  const [drafts, notes] = await Promise.all([listDrafts(db), listRefs(db, "note")]);
  const duoNotes = notes.filter((n) => n.data.section === "charlie" || n.extKey === "kinly:shotlist-duo").map((n) => ({ id: n.id, title: n.title, body: n.body }));
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Megaphone" title="Kladder" subtitle="Videoer vi overvejer at lægge ud. Godkend, ret eller drop dem. Prioritet bestemmer rækkefølgen." />
      <DraftBoard initial={drafts} today={todayCph()} duoNotes={duoNotes} openId={kladde} />
    </div>
  );
}
