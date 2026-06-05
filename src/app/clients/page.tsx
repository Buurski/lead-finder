import { getClients } from "@/lib/sheets";
import ClientCard from "@/components/ClientCard";
import PageHeader from "@/components/shell/PageHeader";

export const revalidate = 0;

export default async function ClientsPage() {
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  try {
    clients = await getClients();
  } catch {
    // not configured yet
  }

  const totalMRR = clients.reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);
  const totalSetup = clients.reduce((sum, c) => sum + (parseFloat(c.setupFee) || 0), 0);
  const payingCount = clients.filter((c) => (parseFloat(c.monthlyFee) || 0) > 0).length;

  return (
    <div className="cc-fade" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        icon="Briefcase"
        title="Klienter"
        subtitle={
          <>
            {clients.length} i CRM · <strong style={{ color: "var(--text)" }}>{payingCount} betalende</strong>
            {clients.length > 0 && (
              <> · <strong style={{ color: "var(--text)" }}>MRR: {totalMRR.toLocaleString("da-DK")} kr</strong> · Setup: {totalSetup.toLocaleString("da-DK")} kr</>
            )}
          </>
        }
      />

      {clients.length === 0 ? (
        <div style={{
          border: "1px dashed var(--border-light)",
          borderRadius: 12,
          padding: "80px 0",
          textAlign: "center",
          color: "var(--text-dim)",
          fontSize: 14,
        }}>
          Ingen klienter endnu. Marker et lead som &quot;Klient ✓&quot; for at tilføje dem her.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}
