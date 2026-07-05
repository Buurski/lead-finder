import PageHeader from "@/components/shell/PageHeader";
import { SheetsFallback } from "@/components/finance/FinanceUI";
import { getClients, getTargets, getSnapshots, type Client, type Target, type Snapshot } from "@/lib/sheets";
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
  let snapshots: Snapshot[] = [];
  let sheetsOk = true;
  try {
    [clients, targets, snapshots] = await Promise.all([getClients(), getTargets(), getSnapshots()]);
  } catch {
    sheetsOk = false;
  }

  const target = targets.find((t) => t.quarter === quarter.key) ?? defaultTarget(quarter.key);
  const targetIsDefault = !targets.some((t) => t.quarter === quarter.key);

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Target"
        title="Økonomi"
        subtitle={sheetsOk
          ? `${quarter.key} · MRR, omsætning & mål · afledt af ${clients.length} klient-rækker + ${snapshots.length} snapshots`
          : "Kunne ikke nå Google Sheets — prøv at genindlæse."}
      />

      {!sheetsOk ? <SheetsFallback /> : (
        <OkonomiClient
          clients={clients}
          target={target}
          targetIsDefault={targetIsDefault}
          snapshots={snapshots}
          nowISO={nowISO}
        />
      )}
    </div>
  );
}
