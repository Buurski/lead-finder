import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { FunnelStage } from "@/lib/hq/summary";

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

export default function PipelineStrip({ funnel }: { funnel: Array<{ stage: FunnelStage; n: number }> }) {
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
          <div key={f.stage} className={`hq-seg${f.stage === HIGHLIGHT ? " on" : ""}`} style={{ flexGrow: weight(f.n) }} />
        ))}
      </div>
      <div className="hq-seg-labels">
        {funnel.map((f) => (
          <div key={f.stage} className="hq-seg-label" style={{ flexGrow: weight(f.n) }}>
            <span className="n tnum">{f.n}</span>
            <span className="t">{LABEL[f.stage]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
