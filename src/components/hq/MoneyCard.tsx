import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { HqSummary } from "@/lib/hq/summary";

function formatKr(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr`;
}

export default function MoneyCard({ money }: { money: HqSummary["money"] }) {
  return (
    <div className="hq-money-card cc-card cc-card-pad">
      <div className="hq-money-head">
        <h3>Penge</h3>
        <Link href="/fakturaer" className="hq-money-link cc-focus" aria-label="Se fakturaer">
          <Icon name="ArrowUpRight" style={{ width: 14, height: 14 }} />
        </Link>
      </div>
      <div className="hq-money-block">
        <div className="hq-mrr-label">MRR</div>
        <div className="hq-mrr-num tnum">{formatKr(money.mrr)}/md</div>
      </div>
      <div className="hq-money-stats">
        <div className="hq-money-stat">
          <span className="k">Udestående</span>
          <span className="v tnum">{formatKr(money.outstanding)}</span>
        </div>
        <div className="hq-money-stat">
          <span className="k">Forfaldne fakturaer</span>
          <span className={`v tnum${money.overdueCount > 0 ? " risk" : ""}`}>{money.overdueCount}</span>
        </div>
      </div>
    </div>
  );
}
