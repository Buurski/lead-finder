import Link from "next/link";
import PageHeader from "@/components/shell/PageHeader";
import Info from "@/components/marketing/Info";
import { getDb } from "@/lib/db/client";
import { listDrafts, listMeasures, listRefs } from "@/lib/hq/marketing";
import { funnel, todayCph } from "@/lib/hq/marketing-calc";
import { TRACKS, TRACK_LABEL } from "@/lib/hq/marketing-types";
import "@/components/marketing/marketing.css";

// /marketing — Tragten: rækkevidde → gem/delinger → profilbesøg → henvendelser.
// Tallene er KUN de, Lucas og Charlie selv har lagt ind under Måling. Intet hentes fra Instagram/TikTok.
export const dynamic = "force-dynamic";
export const metadata = { title: "Marketing · Kinly HQ" };

const nf = (n: number) => n.toLocaleString("da-DK");

const STEP_INFO: Record<string, string> = {
  reach: "Hvor mange gange videoen er vist. Står i opslagets tal på Instagram eller TikTok.",
  keep: "Hvor mange der har gemt videoen eller sendt den videre. Det er det bedste tegn på, at den var brugbar.",
  profile: "Hvor mange der trykkede ind på Kinlys profil efter at have set videoen.",
  inquiry: "Hvor mange der har skrevet eller ringet, fordi de så en video. Skriv det selv ind, når du ved det.",
};

export default async function MarketingPage() {
  const db = getDb();
  const [drafts, measures, tests] = await Promise.all([listDrafts(db), listMeasures(db), listRefs(db, "ab")]);
  const today = todayCph();
  const f = funnel(measures);
  const waiting = drafts.filter((d) => d.status === "kladde").length;
  const noDate = drafts.filter((d) => d.status === "godkendt" && !d.plannedFor).length;
  const running = tests.filter((t) => t.status === "kører").length;
  const next = drafts.filter((d) => d.status === "godkendt" && d.plannedFor && d.plannedFor >= today).sort((a, b) => (a.plannedFor! < b.plannedFor! ? -1 : 1))[0];

  const byTrack = TRACKS.map((t) => {
    const ids = new Set(drafts.filter((d) => d.track === t).map((d) => d.id));
    const rows = measures.filter((m) => m.draftId && ids.has(m.draftId));
    return { t, f: funnel(rows) };
  }).filter((x) => x.f.posts > 0);

  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Megaphone" title="Marketing" subtitle="Kinlys korte videoer: hvad vi vil lægge ud, hvad der virker, og hvad det giver. Alt er kladder, vi lægger selv ud." />
      <div className="mk-wrap">
        <section className="cc-card mk-card" aria-labelledby="mk-tragt">
          <h2 className="mk-h2" id="mk-tragt">
            Tragten
            <Info label="Hvad er tragten?">
              En tragt viser vejen fra “nogen så videoen” til “nogen skrev til os”. Hvert trin er færre end det forrige. Tallene er kun dem, vi selv har lagt ind under Måling.
            </Info>
          </h2>
          {f.posts === 0 ? (
            <div className="mk-note">
              <strong>Ingen målinger endnu.</strong>
              <span>Når den første video er lagt ud, så læg tallene ind under <Link className="cc-link" href="/marketing/maaling" style={{ textDecoration: "underline" }}>Måling</Link>. Så fyldes tragten her.</span>
            </div>
          ) : (
            <p className="mk-p mk-small">Samlet over {f.posts} {f.posts === 1 ? "måling" : "målinger"}. Et trin uden tal betyder, at ingen har målt det endnu.</p>
          )}
          <div className="mk-funnel">
            {f.steps.map((s) => (
              <div key={s.key} className="mk-step" data-empty={s.value == null}>
                <span className="mk-step-label">{s.label}<Info label={`Hvad er ${s.label.toLowerCase()}?`}>{STEP_INFO[s.key]}</Info></span>
                <span className="mk-step-val">
                  {s.value == null ? "–" : nf(s.value)}
                  {s.ofPrev != null && <span className="mk-step-pct">{String(s.ofPrev).replace(".", ",")} % af forrige trin</span>}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-label="Til dig nu">
          <div className="mk-todo">
            <Link href="/marketing/kladder" className="cc-card mk-todo-card">
              <span className="mk-todo-n">{waiting}</span>
              <span className="mk-todo-l">{waiting === 1 ? "kladde venter" : "kladder venter"} på godkendelse</span>
            </Link>
            <Link href="/marketing/kalender" className="cc-card mk-todo-card">
              <span className="mk-todo-n">{noDate}</span>
              <span className="mk-todo-l">godkendt uden dato{next ? `. Næste: ${next.title}` : ""}</span>
            </Link>
            <Link href="/marketing/tests" className="cc-card mk-todo-card">
              <span className="mk-todo-n">{running}</span>
              <span className="mk-todo-l">{running === 1 ? "A/B-test kører" : "A/B-tests kører"}</span>
            </Link>
          </div>
        </section>

        {byTrack.length > 0 && (
          <section className="cc-card mk-card" aria-labelledby="mk-spor">
            <h2 className="mk-h2" id="mk-spor">Pr. spor<Info label="Hvad er et spor?">Et spor er en slags video: faceless/AI, Lucas+Charlie eller Dag N. Her kan du se, hvilket spor der giver mest.</Info></h2>
            <div className="mk-scroll">
              <table className="mk-table">
                <thead><tr><th>Spor</th><th className="num">Opslag</th>{f.steps.map((s) => <th key={s.key} className="num">{s.label}</th>)}</tr></thead>
                <tbody>
                  {byTrack.map(({ t, f: tf }) => (
                    <tr key={t}>
                      <td>{TRACK_LABEL[t]}</td><td className="num">{tf.posts}</td>
                      {tf.steps.map((s) => <td key={s.key} className="num">{s.value == null ? "–" : nf(s.value)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <div className="mk-note">
          <strong>Sådan arbejder vi</strong>
          <span>Faceless/AI er hovedsporet nu (valgt 10/10). Lucas+Charlie-videoer er fase 2 og kræver Charlies ja. Kundecases kræver kundens ja. Intet lægges ud af HQ.</span>
        </div>
      </div>
    </div>
  );
}
