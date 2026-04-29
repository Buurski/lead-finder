import { getClients } from "@/lib/sheets";
import ClientCard from "@/components/ClientCard";

export const revalidate = 0;

export default async function ClientsPage() {
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  try {
    clients = await getClients();
  } catch {
    // not configured yet
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.03em",
        }}>
          Klienter
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4 }}>
          {clients.length} bekræftede klienter
        </p>
      </div>

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
