import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { hermesCronRuns } from "@/lib/hermes";
import { timeAgo } from "./time";
import AskHermesButton from "./AskHermesButton";

const DAY_MS = 24 * 60 * 60 * 1000;

// Plain helper (not a component) — Date.now() here doesn't trip the
// react-hooks/purity render-time check the way it would inside AgentCard().
function recentRuns(jobs: Awaited<ReturnType<typeof hermesCronRuns>>) {
  const cutoff = Date.now() - DAY_MS;
  return jobs
    .flatMap((j) => j.runs.map((r) => ({ job: j.name, ...r })))
    .filter((r) => Date.parse(r.timestamp) >= cutoff)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function statusDot(status: string): string {
  if (status === "ok") return "ok";
  if (status === "error") return "bad";
  return "warn";
}

function statusWord(status: string): string {
  if (status === "ok") return "ok";
  if (status === "error") return "fejlet";
  return status;
}

// Mørkt agent-kort — Hermes må gerne være nede uden at vælte forsiden
// (pakket i Suspense af page.tsx); denne komponent fanger selv fejlen og
// viser en rolig tekst i stedet for at kaste videre.
export default async function AgentCard() {
  let jobs: Awaited<ReturnType<typeof hermesCronRuns>> = [];
  let unreachable = false;
  try {
    jobs = await hermesCronRuns(5);
  } catch {
    unreachable = true;
  }

  const runs = recentRuns(jobs);
  const bad = runs.filter((r) => r.status === "error").length;

  const headline =
    runs.length === 0
      ? "Ingen jobs kørt de seneste 24 timer"
      : bad > 0
        ? `${runs.length} job${runs.length === 1 ? "" : "s"} kørte — ${bad} fejlede`
        : `${runs.length} job${runs.length === 1 ? "" : "s"} kørte — alle ok`;

  return (
    <div className="hq-agent-card">
      <div className="hq-agent-head">
        <span className="hq-agent-who">
          <Icon name="Sparkles" style={{ width: 16, height: 16 }} />
          Hermes
        </span>
        {runs[0] && <span className="hq-agent-ago hq-mono">{timeAgo(runs[0].timestamp)}</span>}
      </div>

      {unreachable ? (
        <p className="hq-agent-error">Hermes svarer ikke lige nu.</p>
      ) : (
        <>
          <h3>{headline}</h3>
          {runs.length > 0 && (
            <div className="hq-agent-jobs">
              {runs.slice(0, 3).map((r, i) => (
                <div key={`${r.job}-${r.timestamp}-${i}`} className="hq-agent-job">
                  <span className={`dot ${statusDot(r.status)}`} aria-hidden="true" />
                  {r.job} · {statusWord(r.status)} · {timeAgo(r.timestamp)}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="hq-agent-actions">
        <AskHermesButton />
        <Link href="/hermes" className="hq-agent-link cc-focus">
          Se agenter
        </Link>
      </div>
    </div>
  );
}
