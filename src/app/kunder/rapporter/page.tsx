import Link from "next/link";
import { getDb } from "@/lib/db/client";
import PageHeader from "@/components/shell/PageHeader";
import { denneMaaned, oversigt, rapportFor, tjekMaaned } from "@/lib/hq/kunde-rapport";
import { maanedNavn } from "@/lib/hq/kunde-rapport-model";
import RapportListe, { type RapportRaekkeDTO } from "./RapportListe";
import "@/components/virksomheder/virksomheder.css";
import "./rapporter.css";

export const metadata = { title: "Månedsrapporter · Kinly HQ" };
export const dynamic = "force-dynamic";

function skift(ym: string, d: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function RapporterPage({ searchParams }: { searchParams: Promise<{ maaned?: string }> }) {
  const sp = await searchParams;
  const nu = denneMaaned();
  let ym = nu;
  try {
    if (sp.maaned) ym = tjekMaaned(sp.maaned);
  } catch {
    ym = nu;
  }

  const db = getDb();
  const o = await oversigt(db, ym);
  // Mailteksten bygges af samme model som rapporten, så de aldrig siger to ting.
  const raekker: RapportRaekkeDTO[] = await Promise.all(
    o.raekker.map(async (r) => ({
      ...r,
      mail: r.status !== "mangler" && r.domaene ? ((await rapportFor(db, r.domaene, ym))?.mail ?? null) : null,
    })),
  );

  const t = o.taeller;
  const tilmeldte = t.mangler + t.klar + t.sendt + t.sprunget;

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <PageHeader icon="FileText" title="Månedsrapporter" subtitle="Rapporterne sendes ikke automatisk. Gennemgå kladden og send selv fra HQ." />

      <nav className="rap-maaned" aria-label="Vælg måned">
        <Link className="virk-chip" href={`/kunder/rapporter?maaned=${skift(ym, -1)}`}>
          ← {maanedNavn(skift(ym, -1)).split(" ")[0]}
        </Link>
        <strong className="rap-maaned-navn">{maanedNavn(ym)}</strong>
        {ym < nu ? (
          <Link className="virk-chip" href={`/kunder/rapporter?maaned=${skift(ym, 1)}`}>
            {maanedNavn(skift(ym, 1)).split(" ")[0]} →
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <div className="rap-tal" role="list">
        <div role="listitem" className={`rap-tal-kort ${t.mangler ? "rap-tal-rod" : ""}`}>
          <span className="rap-tal-n">{t.mangler}</span>
          <span className="rap-tal-l">mangler måling</span>
        </div>
        <div role="listitem" className="rap-tal-kort">
          <span className="rap-tal-n">{t.klar}</span>
          <span className="rap-tal-l">klar til at sende</span>
        </div>
        <div role="listitem" className="rap-tal-kort">
          <span className="rap-tal-n">{t.sendt}</span>
          <span className="rap-tal-l">sendt</span>
        </div>
        <div role="listitem" className="rap-tal-kort">
          <span className="rap-tal-n">{t.sprunget}</span>
          <span className="rap-tal-l">sprunget over</span>
        </div>
      </div>

      {tilmeldte === 0 ? (
        <div className="cc-card cc-card-pad">
          <p className="cc-dim" style={{ fontSize: 13.5, margin: 0 }}>
            Ingen kunder har SEO på profilen. Sæt ydelsen &quot;SEO&quot; på en kunde, så står den her og skal have rapporten hver måned.
          </p>
        </div>
      ) : null}

      <RapportListe maaned={ym} raekker={raekker} />

      <details className="cc-card cc-card-pad rap-hjaelp">
        <summary>Sådan kommer en kunde på listen, og sådan kommer målingen ind</summary>
        <ul>
          <li>
            <strong>Hvem skal have den:</strong> alle kunder med ydelsen &quot;SEO&quot; på profilen. Mangler en, så sæt ydelsen dér.
          </li>
          <li>
            <strong>Målingen:</strong> kommer fra tjekket på serveren. Kun en måling hvor hele siden kunne læses, kommer ind. En blokeret kørsel bliver afvist, så der aldrig står gættede tal i en rapport.
          </li>
          <li>
            <strong>Pilene:</strong> sammenligner med den rapport kunden sidst fik. Første gang står der &quot;nulpunkt&quot;.
          </li>
          <li>
            <strong>Fund på en side vi selv har bygget:</strong> overvej at rette dem, før du sender. Så kan rapporten sige &quot;rettet&quot; i stedet for at vise vores egen fejl.
          </li>
        </ul>
      </details>
    </div>
  );
}
