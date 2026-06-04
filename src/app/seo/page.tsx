import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import Icon from "@/components/shell/Icon";
import { getClients } from "@/lib/sheets";
import type { Client } from "@/lib/sheets";

export const metadata = { title: "SEO · Command Center" };
export const dynamic = "force-dynamic";

export default async function SeoPage() {
  let clients: Client[] = [];
  let ok = true;
  try {
    clients = await getClients();
  } catch {
    ok = false;
  }

  return (
    <div className="cc-fade">
      <PageHeader icon="Search" title="SEO" subtitle="Søgning og AI-synlighed pr. klient — vi tilbyder det gratis." />
      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card" aria-label="Klienter">
          <div className="cc-card-pad" style={{ borderBottom: clients.length ? "1px solid var(--border)" : "none" }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Klienter</h2>
          </div>
          {!ok ? (
            <div className="cc-empty"><Icon name="Activity" /><div>Kunne ikke nå Sheets.</div></div>
          ) : clients.length === 0 ? (
            <div className="cc-empty"><Icon name="Search" /><div>Ingen klienter endnu.</div></div>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {clients.map((c, i) => (
                <li key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                    <div className="cc-dim" style={{ fontSize: 12.5 }}>{c.branch}</div>
                  </div>
                  <span className="cc-chip">{c.websiteStatus}</span>
                  <span className="cc-dim" style={{ fontSize: 12, width: 92, textAlign: "right" }}>SEO: Fase C</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <FaseNote
          phase="Fase C"
          title="Hvad SEO-modulet skal vise"
          points={[
            "Pr. klient: rangering på nøgleord, AI-søgnings-synlighed og hvad der mangler.",
            "Live web-data via Firecrawl, så status er ægte og ikke gæt.",
            "Et gratis tilbud (fx VIDA) bliver målbart her.",
          ]}
        />
      </div>
    </div>
  );
}
