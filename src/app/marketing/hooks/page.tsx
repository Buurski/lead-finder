import PageHeader from "@/components/shell/PageHeader";
import HooksView from "@/components/marketing/HooksView";
import { getDb } from "@/lib/db/client";
import { listDrafts, listRefs } from "@/lib/hq/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hooks · Marketing · Kinly HQ" };

export default async function HooksPage() {
  const db = getDb();
  const refs = await listRefs(db, "hook");
  const drafts = (await listDrafts(db)).map((d) => ({ id: d.id, hook: d.hook, status: d.status, title: d.title }));
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Sparkles" title="Hooks" subtitle="Åbninger der får folk til at blive. Hvert mønster har et eksempel til Kinly." />
      <HooksView refs={refs} drafts={drafts} />
    </div>
  );
}
