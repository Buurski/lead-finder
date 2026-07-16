import PageHeader from "@/components/shell/PageHeader";
import { listInvoices, getSubscriptions, nextDueDate } from "@/lib/invoices.ts";
import { getClients } from "@/lib/sheets";
import FakturaClient from "./FakturaClient";

export const metadata = { title: "Fakturaer · Command Center" };
export const dynamic = "force-dynamic";

export default async function FakturaerPage() {
  const today = new Date().toISOString().slice(0, 10);

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

  return (
    <div className="cc-fade">
      <PageHeader icon="Receipt" title="Fakturaer" subtitle={`${invoices.length} fakturaer · ${subsWithNext.length} aktive abonnementer`} />
      <FakturaClient invoices={invoices} subscriptions={subsWithNext} clients={clients} today={today} />
    </div>
  );
}
