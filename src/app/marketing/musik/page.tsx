import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Info from "@/components/marketing/Info";
import { getDb } from "@/lib/db/client";
import { listDrafts, listRefs } from "@/lib/hq/marketing";
import { MUSIC_LABEL, MUSIC_LICENSE_OK, TRACK_LABEL } from "@/lib/hq/marketing-types";
import "@/components/marketing/marketing.css";

// Kinly er en erhvervskonto: kun musik med licens "erhverv-ok", eller original lyd. Ingen trending lyde.
export const dynamic = "force-dynamic";
export const metadata = { title: "Musik · Marketing · Kinly HQ" };

export default async function MusikPage() {
  const db = getDb();
  const [drafts, notes] = await Promise.all([listDrafts(db), listRefs(db, "note")]);
  const live = drafts.filter((d) => d.status !== "droppet");
  const withMusic = live.filter((d) => d.musicKind !== "ingen");
  const noMusic = live.length - withMusic.length;
  const sect = (s: string) => notes.filter((n) => n.data.section === s);
  const advice = [...sect("musik"), ...sect("optagelse").filter((n) => n.extKey !== "kinly:shotlist-duo")];

  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Radio" title="Musik" subtitle="Hvilken lyd må vi bruge? Kinly er en erhvervskonto, så reglerne er strengere end for private." />
      <div className="mk-wrap">
        <div className="mk-warn" role="note">
          <strong>Vigtigt: Kinly er en erhvervskonto</strong>
          <span>Brug kun musik med licensen “{MUSIC_LICENSE_OK}”, eller original lyd (jeres egen stemme eller lyd). Brug ikke trending lyde fra Instagram eller TikTok. De er ofte kun til private konti og kan give fjernede videoer eller krav.</span>
        </div>

        <section className="cc-card mk-card" aria-labelledby="mk-m-valg">
          <h2 className="mk-h2" id="mk-m-valg">
            Tre valg
            <Info label="Hvad er original lyd?">Original lyd er lyd, vi selv har lavet: en stemme, optaget lyd eller en voiceover. Den har ingen ophavsretsproblemer. 13 ud af 15 undersøgte videoer brugte den.</Info>
          </h2>
          <ul className="mk-p" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
            <li><strong>Original lyd</strong>: sikreste valg. Brug den som standard.</li>
            <li><strong>Licenseret musik</strong>: kun hvis licensen er “{MUSIC_LICENSE_OK}”. Skriv licensen på kladden, ellers kan den ikke godkendes.</li>
            <li><strong>Ingen musik</strong>: helt fint. Tekst på skærmen kan bære videoen.</li>
          </ul>
        </section>

        <section className="cc-card mk-card" aria-labelledby="mk-m-kladder">
          <h2 className="mk-h2" id="mk-m-kladder">Musik på kladderne</h2>
          {live.length === 0 ? (
            <p className="mk-p">Ingen kladder endnu.</p>
          ) : (
            <>
              <p className="mk-p mk-small">{withMusic.length} af {live.length} har valgt lyd. {noMusic} har ingen musik. Ret det på kladden under <Link className="cc-link" style={{ textDecoration: "underline" }} href="/marketing/kladder">Kladder</Link>.</p>
              {withMusic.length > 0 && (
                <div className="mk-scroll" tabIndex={0} role="region" aria-label="Musikvalg pr. video (kan rulles sidelæns)">
                  <table className="mk-table">
                    <thead><tr><th>Video</th><th>Spor</th><th>Lyd</th><th>Licens</th><th>Note</th></tr></thead>
                    <tbody>
                      {withMusic.map((d) => (
                        <tr key={d.id}>
                          <td>{d.title}</td>
                          <td>{TRACK_LABEL[d.track]}</td>
                          <td>{MUSIC_LABEL[d.musicKind]}</td>
                          <td>{d.musicKind === "licenseret" ? (d.musicLicense === MUSIC_LICENSE_OK ? MUSIC_LICENSE_OK : <strong className="mk-err">{d.musicLicense || "mangler"}</strong>) : "–"}</td>
                          <td>{d.musicNote || "–"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>

        {advice.map((n) => (
          <details key={n.id} className="cc-card mk-card">
            <summary className="mk-h2" style={{ cursor: "pointer" }}>{n.title}</summary>
            <p className="mk-p" style={{ whiteSpace: "pre-wrap", marginTop: 10 }}>{n.body}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
