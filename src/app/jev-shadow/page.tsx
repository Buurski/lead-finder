import PageHeader from "@/components/shell/PageHeader";
import { loadShadow } from "@/lib/leads/jev-shadow";
import RunButton from "./run-button";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--text-dim)", borderBottom: "1px solid var(--bg-3)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, color: "var(--text-muted)", borderBottom: "1px solid var(--bg-3)", verticalAlign: "top" };

function pct(v: number | undefined): string {
  return typeof v === "number" ? `${Math.round(v * 100)}%` : "—";
}

export default async function JevShadowPage() {
  const records = await loadShadow();
  const judged = records.filter((r) => r.judgment !== null).length;
  const errors = records.filter((r) => !!r.error).length;
  const lastJudgedAt = records.reduce<string>((max, r) => (r.judgedAt > max ? r.judgedAt : max), "");
  const ranked = [...records].sort((a, b) => (b.attractiveness ?? -1) - (a.attractiveness ?? -1));

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Jev-skygge: attraktivitet (observerer kun, ændrer intet)"
        subtitle={`${judged} vurderet · ${errors} fejl${lastJudgedAt ? ` · sidst vurderet ${new Date(lastJudgedAt).toLocaleString("da-DK")}` : ""}`}
        action={<RunButton />}
      />
      <section className="cc-card cc-card-pad" style={{ overflowX: "auto" }}>
        {ranked.length === 0 ? (
          <p className="cc-dim" style={{ fontSize: 13, margin: 0 }}>Ingen leads vurderet endnu. Cronnen kører to gange i døgnet (03:30 og 13:30 UTC).</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Navn</th>
                <th style={th}>By</th>
                <th style={th}>Branche</th>
                <th style={th}>Ark-score</th>
                <th style={th}>Ark-tier</th>
                <th style={th}>Redesign</th>
                <th style={th}>Booking</th>
                <th style={th}>Budget</th>
                <th style={th}>Kæde</th>
                <th style={th}>Attraktivitet</th>
                <th style={th}>Begrundelse</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.leadId}>
                  <td style={td}>
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="cc-link">{r.name}</a>
                    ) : (
                      r.name
                    )}
                  </td>
                  <td style={td}>{r.city}</td>
                  <td style={td}>{r.branch}</td>
                  <td style={td}>{r.sheetScore}</td>
                  <td style={td}>{r.sheetTier || "—"}</td>
                  <td style={td}>{r.judgment ? r.judgment.redesign.toFixed(1) : "—"}</td>
                  <td style={td}>{r.judgment ? pct(r.judgment.onlineBooking) : "—"}</td>
                  <td style={td}>{r.judgment?.budget ?? "—"}</td>
                  <td style={td}>{r.isChain ? "ja" : "nej"}</td>
                  <td style={td}>{typeof r.attractiveness === "number" ? r.attractiveness : "—"}</td>
                  <td style={td}>{r.error ? `fejl: ${r.error}` : r.reasons.join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
