import PageHeader from "@/components/shell/PageHeader";
import { getClients, getTargets, type Client, type Target } from "@/lib/sheets";
import { quarterOf } from "@/lib/finance";
import OkonomiClient from "./OkonomiClient";

export const metadata = { title: "Økonomi · Command Center" };
export const dynamic = "force-dynamic";

// Sensible starting target for a brand-new quarter before Lucas edits one in.
function defaultTarget(quarter: string): Target {
  return {
    quarter,
    target_new_clients: 6,
    target_setup_revenue: 30000,
    target_mrr_added: 8000,
    weekly_outreach_floor: 40,
    annual_mrr_goal: 25000,
  };
}

export default async function OkonomiPage() {
  const nowISO = new Date().toISOString();
  const quarter = quarterOf(new Date());

  let clients: Client[] = [];
  let targets: Target[] = [];
  let sheetsOk = true;
  try {
    [clients, targets] = await Promise.all([getClients(), getTargets()]);
  } catch {
    sheetsOk = false;
  }

  const target = targets.find((t) => t.quarter === quarter.key) ?? defaultTarget(quarter.key);
  const targetIsDefault = !targets.some((t) => t.quarter === quarter.key);

  return (
    <div className="cc-fade">
      <PageHeader
        icon="CircleDollarSign"
        title="Økonomi"
        subtitle={sheetsOk
          ? `${quarter.key} · afledt af ${clients.length} klient-rækker i Sheets`
          : "Kunne ikke nå Google Sheets — prøv at genindlæse."}
      />

      {!sheetsOk ? (
        <div className="cc-card cc-card-pad" role="status" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}>
          <span style={{ fontSize: 16 }} aria-hidden>⚠️</span>
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Kunne ikke hente klient-data lige nu. Tallene her er afledt af Sheets — genindlæs om et øjeblik.
          </span>
        </div>
      ) : (
        <OkonomiClient
          clients={clients}
          target={target}
          targetIsDefault={targetIsDefault}
          nowISO={nowISO}
        />
      )}
    </div>
  );
}
