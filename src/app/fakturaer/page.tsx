import PageHeader from "@/components/shell/PageHeader";
import { listInvoices, getSubscriptions, nextDueDate } from "@/lib/invoices.ts";
import { getClients } from "@/lib/sheets";
import { invoiceCompanyMap } from "@/lib/hq/invoice-contacts.ts";
import { pgEnabled } from "@/lib/db/client.ts";
import FakturaClient from "./FakturaClient";

export const metadata = { title: "Fakturaer · Command Center" };
export const dynamic = "force-dynamic";

export default async function FakturaerPage({ searchParams }: { searchParams: Promise<{ clientName?: string }> }) {
  const today = new Date().toISOString().slice(0, 10);
  const query = await searchParams;
  const initialClientName = typeof query.clientName === "string" ? query.clientName : "";

  let clients: { id: string; name: string }[] = [];
  try {
    clients = (await getClients()).map((c) => ({ id: c.id, name: c.name }));
  } catch {
    // Sheets ude af drift må ikke vælte siden — fritekst-modtager virker stadig.
  }

  const [invoices, subscriptions] = await Promise.all([listInvoices(), getSubscriptions()]);
  const subsWithNext = subscriptions
    .filter((s) => s.active)
    .map((s) => ({ ...s, nextDue: nextDueDate(s, today) }));
  const companyByInvoice = pgEnabled() ? await invoiceCompanyMap().catch(() => ({})) : {};

  return (
    <div className="cc-fade">
      <PageHeader icon="Receipt" title="Fakturaer" subtitle={`${invoices.length} ${invoices.length === 1 ? "faktura" : "fakturaer"} · ${subsWithNext.length} ${subsWithNext.length === 1 ? "aktivt abonnement" : "aktive abonnementer"}`} />
      <FakturaClient invoices={invoices} subscriptions={subsWithNext} clients={clients} today={today} initialClientName={initialClientName} companyByInvoice={companyByInvoice} />
    </div>
  );
}
