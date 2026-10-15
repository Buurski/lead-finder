import PageHeader from "@/components/shell/PageHeader";
import HooksView from "@/components/marketing/HooksView";
import { getDb } from "@/lib/db/client";
import { listRefs } from "@/lib/hq/marketing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Hooks · Marketing · Kinly HQ" };

export default async function HooksPage() {
  const refs = await listRefs(getDb(), "hook");
  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Sparkles" title="Hooks" subtitle="Åbninger der får folk til at blive. Hvert mønster har et eksempel til Kinly." />
      <HooksView refs={refs} />
    </div>
  );
}
