import Link from "next/link";
import type { AgentFeedRow } from "@/lib/hq/agent-feed";
import { timeAgo } from "@/components/hq/time";

const ACTOR_LABEL: Record<string, string> = { hermes: "Hermes", claude: "Claude", codex: "Codex", lucas: "Lucas", charlie: "Charlie" };

export default function AgentFeed({ rows }: { rows: AgentFeedRow[] }) {
  return (
    <div className="hq-table-card cc-card">
      {rows.length === 0 ? (
        <div className="hq-empty">Ingen aktivitet fra agenterne endnu.</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="agenter-feed-row">
            <span className="agenter-actor-pill" data-actor={r.actor}>{ACTOR_LABEL[r.actor] ?? r.actor}</span>
            <div className="agenter-feed-body">
              <div className="agenter-feed-summary">{r.summary}</div>
              {r.companyId && (
                <div className="agenter-feed-company">
                  <Link href={`/virksomheder/${r.companyId}`} className="cc-focus">{r.companyName}</Link>
                </div>
              )}
            </div>
            <span className="agenter-feed-time hq-mono">{timeAgo(r.at)}</span>
          </div>
        ))
      )}
    </div>
  );
}
