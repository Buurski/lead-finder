// KundeRapportOversigt — server-komponent: har hver kunde fået månedens
// SEO-rapport? Læser filerne fra rapport-jobbet (se lib/hq/kunde-rapport.ts).
// Ligger på /kundeopdateringer, fordi det er samme spørgsmål som siden stiller:
// hvad er der på vej ud til kunderne, og hvad er allerede sendt.
import Icon from "@/components/shell/Icon";
import { kortDato, loadKundeRapport, type RapportFlag } from "@/lib/hq/kunde-rapport";

const FLAG: Record<RapportFlag, { label: string; fg: string; bg: string }> = {
  mangler: { label: "ingen rapport", fg: "var(--red)", bg: "var(--red-dim)" },
  afventer: { label: "ikke sendt", fg: "var(--amber)", bg: "var(--amber-dim)" },
  sprunget: { label: "sprunget", fg: "var(--text-dim)", bg: "var(--surface-2)" },
  sendt: { label: "sendt", fg: "var(--green)", bg: "var(--green-dim)" },
};

const STATUS_LABEL: Record<string, string> = { koert: "kørt", kladde: "kladde", sendt: "sendt", sprunget: "sprunget" };
const VARIANT_LABEL: Record<string, string> = { "med-adgang": "med adgang", "uden-adgang": "uden adgang" };

export default async function KundeRapportOversigt() {
  const o = await loadKundeRapport();
  const { mangler, afventer, sprunget, sendt } = o.taeller;

  return (
    <section className="cc-card" aria-label="Månedlig SEO-rapport">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", borderBottom: "1px solid var(--border)" }}>
        <Icon name="Mail" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Månedlig SEO-rapport · {o.maaned}</h2>
        <span className="cc-dim" style={{ fontSize: 12.5 }}>
          {sendt} sendt · {afventer} ikke sendt · {sprunget} sprunget over
        </span>
      </div>

      {mangler > 0 && (
        <div style={{ padding: "10px 22px", background: "var(--red-dim)", color: "var(--red)", fontSize: 13, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
          {mangler} {mangler === 1 ? "kunde har" : "kunder har"} ikke fået rapporten for {o.maaned}.
        </div>
      )}

      {o.raekker.length === 0 ? (
        <div className="cc-card-pad">
          <p className="cc-dim" style={{ fontSize: 13, margin: 0 }}>
            Ingen rapporter endnu ({o.kilde === "ingen" ? (o.note ?? "kunne ikke læses") : o.note ?? `kilden er ${o.kilde}`}).
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {o.raekker.map((r) => {
            const f = FLAG[r.flag];
            return (
              <li
                key={`${r.domaene}-${r.maaned}`}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 22px", borderBottom: "1px solid var(--border)", fontSize: 12.5, flexWrap: "wrap" }}
              >
                <span style={{ fontWeight: 600 }}>{r.kunde}</span>
                <span className="cc-dim">{r.domaene}</span>
                <span className="cc-dim cc-mono">{r.maaned}</span>
                {r.variant && <span className="cc-chip">{VARIANT_LABEL[r.variant] ?? r.variant}</span>}
                <span className="cc-chip" style={{ color: f.fg, background: f.bg, fontWeight: 700 }}>
                  {r.flag === "mangler" ? f.label : STATUS_LABEL[r.status] ?? r.status}
                </span>
                <span className="cc-dim" style={{ marginLeft: "auto", textAlign: "right" }}>
                  {r.sendt ? `sendt ${kortDato(r.sendt)}` : r.note}
                </span>
                {r.pdf && (
                  <span className="cc-mono" title={r.pdf} style={{ fontSize: 11, color: "var(--text-dim)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.pdf.split("/").pop()}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="cc-card-pad cc-dim" style={{ fontSize: 11.5, borderTop: "1px solid var(--border)" }}>
        Kilden er filerne i <code>~/.hermes/state/kunde-rapport/</code> ({o.kilde === "filer" ? "læst lokalt" : o.kilde === "bro" ? "læst gennem VPS-broen" : "ikke læst"}).
        Status sættes med <code>kunde_rapport_status.py set &lt;domæne&gt; &lt;måned&gt; sendt</code>. PDF-stien er filen på serveren.
      </div>
    </section>
  );
}
