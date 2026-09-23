import { Suspense } from "react";
import PageHeader from "@/components/shell/PageHeader";
import { getDb } from "@/lib/db/client";
import { getHqSummary } from "@/lib/hq/summary";
import { getAgentFeed } from "@/lib/hq/agent-feed";
import { copenhagenNow } from "@/lib/settings";
import TeamCard from "@/components/hq/TeamCard";
import AgentCard from "@/components/hq/AgentCard";
import OmverdenSection from "@/components/hq/OmverdenSection";
import { AgentCardSkeleton, OmverdenSkeleton } from "@/components/hq/Skeletons";
import AgentFeed from "@/components/agenter/AgentFeed";
import "@/components/hq/hq.css";
import "@/components/agenter/agenter.css";

// Agenter-oversigten (spec §4, §10): hvad Hermes/Claude/Codex har lavet, hvem
// fra teamet der er i gang, og Hermes' driftsstatus — samlet ét sted i stedet
// for spredt over /hermes og /drift (som stadig findes som faner herover).
export const dynamic = "force-dynamic";
export const metadata = { title: "Agenter · Kinly HQ" };

export default async function AgenterPage() {
  const { date } = copenhagenNow();
  const db = getDb();
  // Sekventielt, ikke Promise.all: getHqSummary kører selv 7 parallelle
  // forespørgsler internt, og pglite-server tåler ikke flere samtidige
  // forespørgsler oven i det (se ui-common3.md #19/#23).
  const feed = await getAgentFeed(db, 25);
  const summary = await getHqSummary(db, date);

  return (
    <div className="hq-page">
      <PageHeader icon="Sparkles" title="Agenter" subtitle="Hvad Hermes, Claude og Codex har lavet, og hvem fra teamet er i gang." />

      <div className="hq-columns">
        <div className="hq-col-left">
          <div className="hq-section-label">Seneste fra agenterne</div>
          <AgentFeed rows={feed} />
        </div>
        <div className="hq-col-right">
          <Suspense fallback={<AgentCardSkeleton />}>
            <AgentCard />
          </Suspense>
          <TeamCard team={summary.team} />
        </div>
      </div>

      <Suspense fallback={<OmverdenSkeleton />}>
        <OmverdenSection />
      </Suspense>
    </div>
  );
}
