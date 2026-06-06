import { getLeads } from "@/lib/sheets";
import ScrapeButton from "@/components/ScrapeButton";
import VerifyAllButton from "@/components/VerifyAllButton";
import BulkEmailPanel from "@/components/BulkEmailPanel";
import EmailDashboardClient from "@/components/EmailDashboardClient";
import DeepResearchPanel from "@/components/DeepResearchPanel";

export const revalidate = 60;

export default async function LeadsPage() {
  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  try {
    leads = await getLeads();
  } catch {
    // Sheets not configured yet
  }

  // Normalize Sheets status (stray whitespace/casing) so the pipeline counts
  // are correct even on dirty rows — same robustness as Mission Control.
  const norm = (s?: string) => (s ?? "").trim().toLowerCase();
  const byStatus = {
    new: leads.filter((l) => norm(l.status) === "new").length,
    interested: leads.filter((l) => norm(l.status) === "interested").length,
    client: leads.filter((l) => norm(l.status) === "client").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
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

      <DeepResearchPanel />

      <BulkEmailPanel />

      <EmailDashboardClient leads={leads} />
    </div>
  );
}
