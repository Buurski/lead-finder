import PageHeader from "@/components/shell/PageHeader";
import { SheetsFallback } from "@/components/finance/FinanceUI";
import { getClients, type Client } from "@/lib/sheets";
import SalgClient from "./SalgClient";

export const metadata = { title: "Salg · Command Center" };
export const dynamic = "force-dynamic";

export default async function SalgPage() {
  const nowISO = new Date().toISOString();
  let clients: Client[] = [];
  let sheetsOk = true;
  try {
    clients = await getClients();
  } catch {
    sheetsOk = false;
  }

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Workflow"
        title="Salg"
        subtitle={sheetsOk
          ? `Vægtet deal-pipeline · afledt af ${clients.length} klient-rækker i Sheets`
          : "Kunne ikke nå Google Sheets — prøv at genindlæse."}
      />

      {!sheetsOk ? <SheetsFallback /> : <SalgClient clients={clients} nowISO={nowISO} />}
    </div>
  );
}
