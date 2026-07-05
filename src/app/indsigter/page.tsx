import PageHeader from "@/components/shell/PageHeader";
import { SheetsFallback } from "@/components/finance/FinanceUI";
import { getClients, getSnapshots, getTargets, type Client, type Snapshot, type Target } from "@/lib/sheets";
import { quarterOf } from "@/lib/finance";
import IndsigterClient from "./IndsigterClient";

export const metadata = { title: "Indsigter · Command Center" };
export const dynamic = "force-dynamic";

export default async function IndsigterPage() {
  const nowISO = new Date().toISOString();
  const quarterKey = quarterOf(new Date()).key;

  let clients: Client[] = [];
  let snapshots: Snapshot[] = [];
  let targets: Target[] = [];
  let sheetsOk = true;
  try {
    [clients, snapshots, targets] = await Promise.all([getClients(), getSnapshots(), getTargets()]);
  } catch {
    sheetsOk = false;
  }
  const target = targets.find((t) => t.quarter === quarterKey) ?? null;

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Activity"
        title="Indsigter"
        subtitle={sheetsOk
          ? `Omsætning, konvertering & vækst · afledt af ${clients.length} klient-rækker + ${snapshots.length} snapshots`
          : "Kunne ikke nå Google Sheets — prøv at genindlæse."}
      />

      {!sheetsOk ? <SheetsFallback /> : (
        <IndsigterClient clients={clients} snapshots={snapshots} target={target} nowISO={nowISO} />
      )}
    </div>
  );
}
