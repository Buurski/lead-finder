import PageHeader from "@/components/shell/PageHeader";
import { CARD, H2, DIM, StatTile, SheetsFallback } from "@/components/finance/FinanceUI";
import { getClients, type Client } from "@/lib/sheets";
import { periodRevenue, bookedPerMonth, weekPeriod, monthPeriod, yearPeriod, dkk } from "@/lib/finance";

export const metadata = { title: "Indsigter · Command Center" };
export const dynamic = "force-dynamic";

// Read-only — no editing here, so this stays a plain server component
// (the interactive editing lives on Salg/Økonomi, which share the same data).
export default async function IndsigterPage() {
  let clients: Client[] = [];
  let sheetsOk = true;
  try {
    clients = await getClients();
  } catch {
    sheetsOk = false;
  }

  const now = new Date();
  const revenue = {
    week: periodRevenue(clients, weekPeriod(now)),
    month: periodRevenue(clients, monthPeriod(now)),
    year: periodRevenue(clients, yearPeriod(now)),
  };
  const booked = bookedPerMonth(clients, now, 6);
  const max = Math.max(...booked.map((b) => b.value), 1);

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Activity"
        title="Indsigter"
        subtitle={sheetsOk
          ? `Indtjening & trends · afledt af ${clients.length} klient-rækker i Sheets`
          : "Kunne ikke nå Google Sheets — prøv at genindlæse."}
      />

      {!sheetsOk ? <SheetsFallback /> : (
        <section className="cc-card cc-card-pad" style={CARD}>
          <h2 style={H2}>Indtjening</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <StatTile label="Denne uge" value={dkk(revenue.week)} sub="setup + recurring" />
            <StatTile label="Denne måned" value={dkk(revenue.month)} sub="setup + recurring" />
            <StatTile label="I år" value={dkk(revenue.year)} sub="setup + recurring" />
          </div>
          <div>
            <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>Booket setup pr. måned</span>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${booked.length}, 1fr)`, alignItems: "end", gap: 8, height: 96, marginTop: 10 }}>
              {booked.map((b) => (
                <div key={b.key} style={{ display: "grid", justifyItems: "center", gap: 5, height: "100%", gridTemplateRows: "1fr auto auto" }}>
                  <div style={{ alignSelf: "end", width: "100%", maxWidth: 34, height: `${Math.max((b.value / max) * 100, b.value > 0 ? 6 : 0)}%`, background: b.value > 0 ? "var(--accent)" : "var(--bg-3)", borderRadius: "5px 5px 0 0" }} title={dkk(b.value)} />
                  <span style={{ fontSize: 10.5, color: DIM }}>{b.value > 0 ? Math.round(b.value / 1000) + "k" : "–"}</span>
                  <span style={{ fontSize: 10.5, color: DIM }}>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
