import PageHeader from "@/components/shell/PageHeader";
import { listExperiments } from "@/lib/hq/experiments";
import TestsBoard from "./TestsBoard";

// /tests (fane under Pipeline) — idéer fra Konkurrenter/SEO som Kinly afprøver på
// kinly.dk i en uge. Hermes vurderer og planlægger om natten (eksperimenter.py);
// Lucas starter testen og afgør behold/drop. Data: experiments/list i store.ts.
export const dynamic = "force-dynamic";
export const metadata = { title: "Tests · Kinly HQ" };

// Serverens klokke sendes med, så "dag x/7" er ens i server- og klient-render.
const nowMs = () => Date.now();

export default async function TestsPage() {
  const items = await listExperiments();
  return (
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="Target"
        title="Tests"
        subtitle="Idéer vi afprøver på kinly.dk i en uge. Hermes vurderer og lægger planen — du laver ændringen, starter testen og afgør."
      />
      <TestsBoard initial={items} now={nowMs()} />
    </div>
  );
}
