import { getClients, type Client } from "@/lib/sheets";
import { listInvoices, getSubscriptions, clientEconomy, type ClientEconomy } from "@/lib/invoices";
import { canonicalClientName, unmatchedNames } from "@/lib/client-alias";
import ClientCard from "@/components/ClientCard";
import AddClientForm from "@/components/AddClientForm";
import PageHeader from "@/components/shell/PageHeader";
import WarnBanner from "@/components/WarnBanner";
import Link from "next/link";

export const revalidate = 0;

// Kunde-arbejdsflade, ikke kartotek. Kunderne grupperes efter afstand til
// handling — rækkefølgen ER prioriteringen.
//
// Bevidst udeladt i v1: "seneste lead eller svar" pr. kunde. Den eneste
// join-nøgle mellem Client og leads/svar/udkast er firmanavn-strengen (fri
// tekst, ingen normalisering), og et forkert match ville vise én kundes svar
// på en andens kort. Det står som en ærlig note nederst i stedet.

// Live kunde uden pris = leverer gratis, eller nogen har glemt at taste den ind.
function missingPrice(c: Client): boolean {
  return c.websiteStatus === "live" && !c.monthlyFee.trim();
}

export default async function ClientsPage() {
  let clients: Client[] = [];
  let sheetsOk = true;
  try {
    clients = await getClients();
  } catch {
    // Couldn't reach Sheets — flag it so an empty list isn't shown as "no
    // clients yet" (which looks like the client list was wiped).
    sheetsOk = false;
  }

  // Fakturaer hentes ÉN gang og grupperes — ikke ét opslag pr. kundekort.
  // Fejler kilden, får ingen kunde en økonomi-linje (i stedet for en falsk en).
  let economy = new Map<string, ClientEconomy>();
  let allInvoices: Awaited<ReturnType<typeof listInvoices>> = [];
  let allSubs: Awaited<ReturnType<typeof getSubscriptions>> = [];
  try {
    const [invoices, subs] = await Promise.all([listInvoices(), getSubscriptions()]);
    allInvoices = invoices;
    allSubs = subs;
    const today = new Date().toISOString().slice(0, 10);
    for (const c of clients) {
      economy.set(c.name, clientEconomy(
        invoices.filter((i) => canonicalClientName(i.clientName) === canonicalClientName(c.name)),
        subs.find((sub) => canonicalClientName(sub.clientName) === canonicalClientName(c.name)),
        today,
      ));
    }
  } catch {
    economy = new Map();
  }

  // Council-krav 13/9: faktura-navne der ikke kan kobles til en kunde skal
  // FLAGES — ikke forsvinde stille. (Kilde til stille fejl: forkert kunde.)
  const orphanNames = unmatchedNames(
    [...allInvoices.map((i) => i.clientName), ...allSubs.map((s) => s.clientName)],
    clients.map((c) => c.name),
  );

  // MRR = kun LIVE kunder (samme definition som forsiden/deck) — aftaler under
  // bygning tæller ikke med, før de er live (Lucas 13/9).
  const liveClients = clients.filter((c) => c.websiteStatus === "live");
  const totalMRR = liveClients.reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);
  const payingCount = liveClients.filter((c) => (parseFloat(c.monthlyFee) || 0) > 0).length;

  const running = clients.filter((c) => c.websiteStatus === "live");
  const inProgress = clients.filter((c) => c.websiteStatus !== "live");
  const priceGaps = running.filter(missingPrice);

  const groups: { key: string; title: string; sub: string; items: Client[] }[] = [
    { key: "running", title: "Kører", sub: "Live sites — leveres der.", items: running },
    { key: "progress", title: "I gang", sub: "Demo eller under bygning — ikke live endnu.", items: inProgress },
  ];

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader
        icon="Briefcase"
        title="Kunder & sites"
        subtitle={!sheetsOk ? "Google Sheets er offline. Ingen kundedata er slettet." : (
          <>
            {clients.length} i CRM · <strong style={{ color: "var(--text)" }}>{payingCount} betalende</strong>
            {clients.length > 0 && (
              <> · <strong style={{ color: "var(--text)" }}>MRR: {totalMRR.toLocaleString("da-DK")} kr</strong></>
            )}
          </>
        )}
      />

      {!sheetsOk ? (
        <WarnBanner>
          Kunne ikke nå Google Sheets lige nu — dine klienter er der stadig. Genindlæs om et øjeblik.
        </WarnBanner>
      ) : clients.length === 0 ? (
        <div className="cc-card cc-card-pad">
          <div className="cc-empty">Ingen klienter endnu. Marker et lead som &quot;Klient ✓&quot; for at tilføje dem her.</div>
        </div>
      ) : (
        <>
          {/* Næste skridt — én konkret handling, aldrig en liste af lige vigtige ting. */}
          {priceGaps.length > 0 ? (
            <div className="cc-card cc-card-pad kinly-focus-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div className="cc-kicker">Næste skridt</div>
                <div style={{ marginTop: 4 }}>
                  {priceGaps.length === 1
                    ? <>{priceGaps[0].name} er live uden pris.</>
                    : <>{priceGaps.length} live sites mangler pris — start med {priceGaps[0].name}.</>}
                </div>
              </div>
              <Link href="/clients" className="cc-btn kinly-next-action" style={{ marginLeft: "auto", textDecoration: "none" }}>
                Sæt pris
              </Link>
            </div>
          ) : (
            <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--kinly-signal)", flexShrink: 0 }} />
              Ingen kunder kræver handling.{" "}
              {inProgress.length > 0
                ? `${inProgress.length} ${inProgress.length === 1 ? "kunde er" : "kunder er"} i gang.`
                : "Alt kører."}
            </div>
          )}

          {orphanNames.length > 0 && (
            <div className="cc-card cc-card-pad" role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "var(--text-muted)" }}>
              <span className="cc-chip" style={{ background: "var(--red-dim)", color: "var(--red)" }}>tjek</span>
              <span style={{ minWidth: 0 }}>
                Faktura-navne uden kunde: {orphanNames.join(", ")} — opret kunden eller tilføj et alias i <code>client-alias.ts</code>.
              </span>
            </div>
          )}

          {groups.map((g) => g.items.length === 0 ? null : (
            <section key={g.key} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>
                  {g.title} <span className="cc-dim" style={{ fontWeight: 500 }}>· {g.items.length}</span>
                </h2>
                <p className="cc-dim" style={{ fontSize: 12.5, marginTop: 2 }}>{g.sub}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(280px, 100%), 1fr))", gap: 12 }}>
                {g.items.map((client) => <ClientCard key={client.id} client={client} economy={economy.get(client.name)} />)}
              </div>
            </section>
          ))}

          <p className="cc-dim" style={{ fontSize: 12 }}>
            Seneste lead og svar vises ikke pr. kunde endnu — leads, udkast og indbakke kan i dag kun kobles
            til en kunde via firmanavnet, og et forkert match ville vise den forkerte kundes historik.
            Se dem i <Link className="cc-link" href="/replies">Svar</Link> og <Link className="cc-link" href="/leads">Pipeline</Link>.
          </p>
        </>
      )}

      <AddClientForm />
    </div>
  );
}
