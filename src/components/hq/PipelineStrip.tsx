import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { FunnelStage } from "@/lib/hq/summary";
import { STAGE_LABEL, type DealStage } from "@/lib/hq/deal-stages";

const LABEL: Record<FunnelStage, string> = {
  ny: "Ny",
  kontaktet: "Kontaktet",
  svaret: "Svaret",
  interesseret: "Interesseret",
  kunde: "Kunde",
};

// "Svaret" er den fase der kræver en menneskelig handling nu — den eneste
// der får lime i baren.
const HIGHLIGHT: FunnelStage = "svaret";

// Hvert segment er et link til virksomhedslisten filtreret på trinnet
// (livsfase for leads, aftale-trin for aftaler — virksomheder/page.tsx forstår begge).
const faseHref = (fase: string) => `/virksomheder?fase=${fase}`;

export default function PipelineStrip({
  funnel,
  deals,
}: {
  funnel: Array<{ stage: FunnelStage; n: number }>;
  deals: Array<{ stage: DealStage; n: number }>;
}) {
  const total = funnel.reduce((sum, f) => sum + f.n, 0);
  // Min-bredde så et lille tal (fx 3) stadig er synligt ved siden af 300+.
  const weight = (n: number) => (total > 0 ? Math.max(n, total * 0.045) : 1);

  return (
    <div className="hq-pipeline-card cc-card">
      <div className="hq-pipeline-head">
        <h2>Pipeline</h2>
        <Link href="/pipeline" className="hq-open-link cc-focus">
          Åbn <Icon name="ChevronRight" style={{ width: 16, height: 16 }} />
        </Link>
      </div>
      <div className="hq-seg-bar">
        {funnel.map((f) => (
          <Link key={f.stage} href={faseHref(f.stage)} aria-label={`${LABEL[f.stage]}: ${f.n}`} className={`hq-seg cc-focus${f.stage === HIGHLIGHT ? " on" : ""}`} style={{ flexGrow: weight(f.n) }} />
        ))}
      </div>
      <div className="hq-seg-labels">
        {funnel.map((f) => (
          <Link key={f.stage} href={faseHref(f.stage)} className="hq-seg-label cc-focus" style={{ flexGrow: weight(f.n) }}>
            <span className="n tnum">{f.n}</span>
            <span className="t">{LABEL[f.stage]}</span>
          </Link>
        ))}
      </div>

      <div className="hq-seg-sub">Aftaler</div>
      <div className="hq-seg-bar hq-seg-bar-deals">
        {deals.map((d) => (
          <Link key={d.stage} href={faseHref(d.stage)} aria-label={`${STAGE_LABEL[d.stage]}: ${d.n}`} className={`hq-seg cc-focus${d.n > 0 ? " on" : ""}`} style={{ flex: "1 1 0" }} />
        ))}
      </div>
      <div className="hq-seg-labels hq-seg-labels-deals">
        {deals.map((d) => (
          <Link key={d.stage} href={faseHref(d.stage)} className="hq-seg-label cc-focus">
            <span className="n tnum">{d.n}</span>
            <span className="t">{STAGE_LABEL[d.stage]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
