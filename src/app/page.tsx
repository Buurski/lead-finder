import { getLeads } from "@/lib/sheets";
import LeadTable from "@/components/LeadTable";
import ScrapeButton from "@/components/ScrapeButton";
import VerifyAllButton from "@/components/VerifyAllButton";
import BulkEmailPanel from "@/components/BulkEmailPanel";

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

      <BulkEmailPanel />

      {/* Local-only feature notice */}
      <div style={{
        background: "oklch(98% 0.01 250)",
        border: "1px solid oklch(88% 0.04 250)",
        borderRadius: 10,
        padding: "12px 16px",
        fontSize: 12,
        color: "oklch(40% 0.05 250)",
        lineHeight: 1.6,
      }}>
        <span style={{ fontWeight: 700, color: "oklch(35% 0.08 250)" }}>Kører du lokalt?</span>
        {" "}Du kan bruge alle funktioner. Kører du online (Vercel) virker kun{" "}
        <span style={{ color: "oklch(40% 0.15 145)", fontWeight: 600 }}>✓ Se leads · Ændre status · Se klienter · Udfylde brief</span>.
        {" "}Disse kræver din PC:{" "}
        <span style={{ color: "oklch(50% 0.15 25)", fontWeight: 600 }}>✗ Hent leads · Verificer alle · Deep research · Opret CLAUDE.md</span>.
      </div>

      <LeadTable leads={leads} />
    </div>
  );
}
