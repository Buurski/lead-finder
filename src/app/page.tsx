import { getLeads } from "@/lib/sheets";
import LeadTable from "@/components/LeadTable";
import ScrapeButton from "@/components/ScrapeButton";
import VerifyAllButton from "@/components/VerifyAllButton";

export const revalidate = 0;

export default async function LeadsPage() {
  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  try {
    leads = await getLeads();
  } catch {
    // Sheets not configured yet
  }

  const byStatus = {
    new: leads.filter((l) => l.status === "new").length,
    interested: leads.filter((l) => l.status === "interested").length,
    client: leads.filter((l) => l.status === "client").length,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 26,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
          }}>
            Lead Pipeline
          </h1>
          <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
            {[
              { label: "total", value: leads.length, color: "var(--text-muted)" },
              { label: "nye", value: byStatus.new, color: "#6366f1" },
              { label: "interesserede", value: byStatus.interested, color: "#f59e0b" },
              { label: "klienter", value: byStatus.client, color: "#22c55e" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 20, fontWeight: 700, color }}>{value}</span>
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

      <LeadTable leads={leads} />
    </div>
  );
}
