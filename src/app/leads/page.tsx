import { getLeads } from "@/lib/sheets";
import ScrapeButton from "@/components/ScrapeButton";
import VerifyAllButton from "@/components/VerifyAllButton";
import BulkEmailPanel from "@/components/BulkEmailPanel";
import EmailDashboardClient from "@/components/EmailDashboardClient";

export const revalidate = 60;

// Mobile Safari ran out of memory rendering/filtering all ~8000 leads client-side
// ("This page couldn't load"). Cap what we hand the client to the top N by score;
// the full database still lives in Sheets and the lead-gen feed surfaces fresh ones.
const LEADS_CAP = 1000;

export default async function LeadsPage() {
  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  let sheetsOk = true;
  try {
    leads = await getLeads();
  } catch {
    // Couldn't reach Sheets (rate limit / network / not configured). Keep the
    // empty list but flag it, so the page doesn't masquerade a fetch failure as
    // "0 leads / Hent leads" — that looks like the whole database vanished.
    sheetsOk = false;
  }

  // Normalize Sheets status (stray whitespace/casing) so the pipeline counts
  // are correct even on dirty rows — same robustness as Mission Control.
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const byStatus = {
    new: leads.filter((l) => norm(l.status) === "new").length,
    interested: leads.filter((l) => norm(l.status) === "interested").length,
    client: leads.filter((l) => norm(l.status) === "client").length,
  };

  const totalLeads = leads.length;
  // Hand the client only the top-scored slice so mobile doesn't OOM.
  const capped = [...leads].sort((a, b) => b.score - a.score).slice(0, LEADS_CAP);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {!sheetsOk && (
        <div
          className="cc-card cc-card-pad"
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}
        >
          <span style={{ fontSize: 16 }} aria-hidden>⚠️</span>
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Kunne ikke nå Google Sheets lige nu — dine leads er der stadig. Genindlæs om et øjeblik.
          </span>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 className="cc-h1">Lead Pipeline</h1>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[
              { label: "total", value: leads.length, color: "var(--text-muted)" },
              { label: "nye", value: byStatus.new, color: "var(--blue)" },
              { label: "interesserede", value: byStatus.interested, color: "var(--amber)" },
              { label: "klienter", value: byStatus.client, color: "var(--accent-ink)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color }}>{value}</span>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <VerifyAllButton />
          <ScrapeButton />
        </div>
      </div>

      {totalLeads > LEADS_CAP && (
        <div className="cc-card cc-card-pad" role="status" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          Viser de {LEADS_CAP.toLocaleString("da-DK")} højest scorede af {totalLeads.toLocaleString("da-DK")} leads (for hastighed). Brug søgning/filtre for at finde resten.
        </div>
      )}

      <BulkEmailPanel />

      <EmailDashboardClient leads={capped} />
    </div>
  );
}
