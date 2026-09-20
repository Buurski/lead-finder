import PageHeader from "@/components/shell/PageHeader";
import { loadReplyShadow, type NaesteSkridt } from "@/lib/leads/reply-judgments";
import { getLeads } from "@/lib/sheets";

export const dynamic = "force-dynamic";

const th: React.CSSProperties = { textAlign: "left", padding: "8px 10px", fontSize: 11, color: "var(--text-dim)", borderBottom: "1px solid var(--bg-3)", whiteSpace: "nowrap" };
const td: React.CSSProperties = { padding: "8px 10px", fontSize: 12.5, color: "var(--text-muted)", borderBottom: "1px solid var(--bg-3)", verticalAlign: "top" };

const ACTION_LABEL: Record<NaesteSkridt, string> = {
  ring_i_dag: "Ring i dag",
  skriv_kort_svar: "Skriv kort svar",
  send_udkast_eller_pris: "Send udkast/pris",
  vent_og_foelg_op: "Vent og følg op",
  marker_kunde: "Markér kunde",
  luk_haefligt: "Luk høfligt",
};

function scale3(v: number | null): string {
  return typeof v === "number" ? `${v.toFixed(1)}/3` : "—";
}
function daysAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return String(Math.max(0, Math.floor((Date.now() - d.getTime()) / 86_400_000)));
}

export default async function JevRepliesPage() {
  const [records, leads] = await Promise.all([
    loadReplyShadow(),
    getLeads().catch(() => []),
  ]);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const judged = records.filter((r) => r.action !== null).length;
  const errors = records.filter((r) => !!r.error).length;
  const ranked = [...records].sort(
    (a, b) => (b.haster ?? -1) - (a.haster ?? -1) || (b.varme ?? -1) - (a.varme ?? -1),
  );

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Svar der venter på dig (Jev-forslag, observerer kun)"
        subtitle={`${judged} vurderet · ${errors} fejl · Jev foreslår næste skridt, sender og ændrer intet. SLÅET FRA indtil databehandleraftale med TypeSafe er på plads (JEV_REPLIES=1). Se dem i `}
      />
      <p style={{ margin: "-8px 0 16px", fontSize: 12.5 }}>
        <a href="/replies" className="cc-link">/replies</a> for at svare.
      </p>
      <section className="cc-card cc-card-pad" style={{ overflowX: "auto" }}>
        {ranked.length === 0 ? (
          <p className="cc-dim" style={{ fontSize: 13, margin: 0 }}>Ingen svar vurderet endnu. Cronnen kører natligt.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Navn</th>
                <th style={th}>By</th>
                <th style={th}>Branche</th>
                <th style={th}>Foreslået næste skridt</th>
                <th style={th}>Haster</th>
                <th style={th}>Varme</th>
                <th style={th}>Dage siden svar</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((r) => {
                const lead = leadById.get(r.leadId);
                return (
                  <tr key={r.leadId}>
                    <td style={td}>{r.name}</td>
                    <td style={td}>{lead?.city ?? "—"}</td>
                    <td style={td}>{lead?.branch ?? "—"}</td>
                    <td style={td}>{r.error === "no-reply-text" ? "svartekst mangler — kør \"Sync svar fra Gmail\" eller åbn /replies" : r.error ? `fejl: ${r.error}` : r.action ? ACTION_LABEL[r.action] : "—"}</td>
                    <td style={td}>{scale3(r.haster)}</td>
                    <td style={td}>{scale3(r.varme)}</td>
                    <td style={td}>{daysAgo(r.repliedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
