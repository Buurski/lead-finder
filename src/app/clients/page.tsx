import { getClients, type Client } from "@/lib/sheets";
import { listInvoices, getSubscriptions, clientEconomy, type ClientEconomy } from "@/lib/invoices";
import ClientCard from "@/components/ClientCard";
import AddClientForm from "@/components/AddClientForm";
import PageHeader from "@/components/shell/PageHeader";
import WarnBanner from "@/components/WarnBanner";
import Link from "next/link";

export const revalidate = 0;

// Kunde-arbejdsflade, ikke kartotek. Kunderne grupperes efter afstand til
// handling — rækkefølgen ER prioriteringen, så det der blokerer ligger øverst.
//
// Bevidst udeladt i v1: "seneste lead eller svar" pr. kunde. Den eneste
// join-nøgle mellem Client og leads/svar/udkast er firmanavn-strengen (fri
// tekst, ingen normalisering), og et forkert match ville vise én kundes svar
// på en andens kort. Det står som en ærlig note nederst i stedet.

// Blokeret = kan ikke bygges videre på. Live sites er aldrig blokerede, selv
// hvis brief-feltet står tomt — dér mangler der data, ikke arbejde.
function isBlocked(c: Client): boolean {
  return !c.briefFilled && c.websiteStatus !== "live";
}
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
  try {
    const [invoices, subs] = await Promise.all([listInvoices(), getSubscriptions()]);
    const today = new Date().toISOString().slice(0, 10);
    for (const c of clients) {
      economy.set(c.name, clientEconomy(
        invoices.filter((i) => i.clientName === c.name),
        subs.find((sub) => sub.clientName === c.name),
        today,
      ));
    }
  } catch {
    economy = new Map();
  }

  const totalMRR = clients.reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);
  const payingCount = clients.filter((c) => (parseFloat(c.monthlyFee) || 0) > 0).length;

  const blocked = clients.filter(isBlocked);
  const running = clients.filter((c) => !isBlocked(c) && c.websiteStatus === "live");
  const inProgress = clients.filter((c) => !isBlocked(c) && c.websiteStatus !== "live");
  const priceGaps = running.filter(missingPrice);

  const groups: { key: string; title: string; sub: string; items: Client[] }[] = [
    { key: "blocked", title: "Kræver handling", sub: "Mangler brief, og sitet er ikke live endnu — der kan ikke bygges videre.", items: blocked },
    { key: "progress", title: "I gang", sub: "Demo eller under bygning. Ikke blokeret.", items: inProgress },
    { key: "running", title: "Kører", sub: "Live sites. En manglende brief her blokerer intet — sitet står allerede oppe.", items: running },
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
          {blocked.length > 0 ? (
            <div className="cc-card cc-card-pad kinly-focus-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ minWidth: 0 }}>
                <div className="cc-kicker">Næste skridt</div>
                <div style={{ marginTop: 4 }}>
                  {blocked.length === 1
                    ? <>{blocked[0].name} mangler brief.</>
                    : <>{blocked.length} kunder mangler brief — start med {blocked[0].name}.</>}
                </div>
              </div>
              <Link href={`/clients/${blocked[0].id}/brief`} className="cc-btn kinly-next-action" style={{ marginLeft: "auto", textDecoration: "none" }}>
                Udfyld brief
              </Link>
            </div>
          ) : (
            <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 9, alignItems: "center", color: "var(--text-muted)", fontSize: 13.5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--kinly-signal)", flexShrink: 0 }} />
              Ingen kunder er blokerede.{" "}
              {priceGaps.length > 0
                ? `${priceGaps.length} live ${priceGaps.length === 1 ? "site mangler" : "sites mangler"} pris.`
                : inProgress.length > 0
                  ? `${inProgress.length} ${inProgress.length === 1 ? "kunde er" : "kunder er"} i gang.`
                  : "Alt kører."}
            </div>
          )}

          {priceGaps.length > 0 && (
            <div className="cc-card cc-card-pad" role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 13, color: "var(--text-muted)" }}>
              <span className="cc-chip" style={{ background: "var(--amber-dim)", color: "var(--amber)" }}>økonomi</span>
              <span style={{ minWidth: 0 }}>Live uden pris: {priceGaps.map((c) => c.name).join(", ")}. Prisfeltet er tomt — er det aftalt gratis, så skriv 0.</span>
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
