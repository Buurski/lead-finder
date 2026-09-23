import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { getHqSummary } from "@/lib/hq/summary";
import { listPipeline, DEAL_STAGES, STAGE_LABEL } from "@/lib/hq/deals";
import { copenhagenNow } from "@/lib/settings";
import PipelineBoard from "@/components/pipeline/PipelineBoard";
import "@/components/pipeline/pipeline.css";

// /pipeline — livsfase-funnel (fase 2 Task 2's getHqSummary) + deal-kanban
// (fase 2 Task 5). Data er altid frisk: deals ændrer sig konstant fra
// kortene, og siden er intern (ingen grund til ISR/cache).
export const dynamic = "force-dynamic";
export const metadata = { title: "Pipeline · Kinly HQ" };

const FUNNEL_LABEL: Record<string, string> = {
  ny: "Ny", kontaktet: "Kontaktet", svaret: "Svaret", interesseret: "Interesseret", kunde: "Kunde",
};

function needsAction(card: { nextStep: string | null; nextStepDue: string | null }, today: string): boolean {
  if (!card.nextStep) return true;
  const due = card.nextStepDue || "";
  return Boolean(due) && due < today;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string; action?: string }>;
}) {
  const sp = await searchParams;
  const owner = sp.owner === "lucas" || sp.owner === "charlie" ? sp.owner : "";
  const actionOnly = sp.action === "1";
  const { date: today } = copenhagenNow();

  const db = getDb();
  const [summary, allCards] = await Promise.all([getHqSummary(db, today), listPipeline(db)]);

  let cards = allCards;
  if (owner) cards = cards.filter((c) => c.owner === owner);
  if (actionOnly) cards = cards.filter((c) => needsAction(c, today));

  const stages = DEAL_STAGES.map((stage) => ({ stage, label: STAGE_LABEL[stage] }));

  return (
    <div className="cc-fade">
      <div className="pl-header">
        <div>
          <h1>Pipeline</h1>
          <p>Livsfaser til venstre for kontakt, aftaler til højre for penge. Træk et kort eller brug menuknappen (⋯) for at flytte fase.</p>
        </div>
      </div>

      <div className="cc-card cc-card-pad pl-funnel">
        <div className="pl-funnel-bar">
          {summary.funnel.map((f) => (
            <Link
              key={f.stage}
              href={`/virksomheder?fase=${f.stage}`}
              className="pl-funnel-seg"
              data-lit={f.n > 0}
              style={{ flexGrow: f.n || 0.4 }}
              aria-label={`${FUNNEL_LABEL[f.stage] ?? f.stage}: ${f.n}`}
            />
          ))}
        </div>
        <div className="pl-funnel-labels">
          {summary.funnel.map((f) => (
            <Link
              key={f.stage}
              href={`/virksomheder?fase=${f.stage}`}
              className="pl-funnel-label cc-focus"
              style={{ flexGrow: f.n || 0.4 }}
            >
              <span className="n">{f.n}</span>
              <span className="t">{FUNNEL_LABEL[f.stage] ?? f.stage}</span>
            </Link>
          ))}
        </div>
      </div>

      <PipelineBoard
        key={`${owner}:${actionOnly}`}
        initialCards={cards}
        stages={stages}
        today={today}
        owner={owner}
        actionOnly={actionOnly}
      />
    </div>
  );
}
