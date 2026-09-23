import type { HqSummary } from "@/lib/hq/summary";
import { timeAgo } from "./time";

const NAME: Record<string, string> = { lucas: "Lucas", charlie: "Charlie" };

export default function TeamCard({ team }: { team: HqSummary["team"] }) {
  return (
    <div className="hq-team-card cc-card cc-card-pad">
      <h3>Team</h3>
      {team.map((t) => (
        <div key={t.person} className="hq-team-row">
          <span className={`hq-avatar-sm ${t.person === "lucas" ? "l" : "c"}`} aria-hidden="true">
            {t.person === "lucas" ? "L" : "C"}
          </span>
          <div className="hq-team-body">
            <div className="who">{NAME[t.person] ?? t.person}</div>
            <div className="what">{t.summary || "Ingen registreret aktivitet endnu"}</div>
          </div>
          {t.at && <div className="hq-team-time hq-mono">{timeAgo(t.at)}</div>}
        </div>
      ))}
    </div>
  );
}
