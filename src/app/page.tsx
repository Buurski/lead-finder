import { Suspense } from "react";
import { getDb } from "@/lib/db/client";
import { getHqSummary } from "@/lib/hq/summary";
import { copenhagenNow } from "@/lib/settings";
import { readPreviewRequests } from "@/lib/preview-queue";
import { currentUser } from "@/lib/current-user";
import Greeting from "@/components/hq/Greeting";
import KpiRow, { type KpiItem } from "@/components/hq/KpiRow";
import PipelineStrip from "@/components/hq/PipelineStrip";
import NextStepsTable from "@/components/hq/NextStepsTable";
import MoneyCard from "@/components/hq/MoneyCard";
import TeamCard from "@/components/hq/TeamCard";
import AgentCard from "@/components/hq/AgentCard";
import OmverdenSection from "@/components/hq/OmverdenSection";
import { AgentCardSkeleton, OmverdenSkeleton } from "@/components/hq/Skeletons";
import "@/components/hq/hq.css";

// HQ-forsiden. Alt tal-data læses fra Postgres (getHqSummary) i én omgang;
// Hermes og Omverden hentes af deres egne komponenter og streamer ind via
// Suspense, så et dødt VPS-kald aldrig blokerer resten af siden.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { date, hour } = copenhagenNow();
  const [summary, previewRequests, user] = await Promise.all([
    getHqSummary(getDb(), date),
    readPreviewRequests().catch(() => []),
    currentUser(),
  ]);

  const inbound = previewRequests.filter((p) => p.status === "ny").length;

  const kpiItems: KpiItem[] = [
    { label: "Godkend kladder", value: summary.kpi.draftsPending, sub: "Venter i Indbakke", href: "/approve", hero: true },
    { label: "Nye svar", value: summary.kpi.newReplies, sub: "Kræver svar", href: "/replies" },
    { label: "Henvendelser fra kinly.dk", value: inbound, sub: "Ubehandlede", href: "/previews" },
    { label: "Forfaldne næste skridt", value: summary.kpi.overdueNextSteps, sub: "På tværs af Lucas og Charlie", href: "/pipeline" },
  ];

  return (
    <div className="hq-page">
      <Greeting user={user} hour={hour} date={date} />

      <div className="hq-section-label">I dag</div>
      <KpiRow items={kpiItems} />

      <PipelineStrip funnel={summary.funnel} />

      <div className="hq-columns">
        <div className="hq-col-left">
          <NextStepsTable steps={summary.nextSteps} today={date} />
          <MoneyCard money={summary.money} />
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
