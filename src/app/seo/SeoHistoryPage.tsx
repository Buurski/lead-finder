// /seo (fane under Pipeline) — KINLYS EGEN synlighed og hvad vi gør ved den:
// Google (kinly.dk), AI-søgning, blogindlæg, os mod konkurrenterne, næste skridt.
// Kundernes SEO bor på kundeprofilen — her kun et link. PageSpeed er én linje nederst.
import Link from "next/link";
import { desc, isNull } from "drizzle-orm";
import PageHeader from "@/components/shell/PageHeader";
import { getDb } from "@/lib/db/client";
import { seoSnapshot } from "@/lib/db/schema";
import { loadLatestReport } from "@/lib/hq/competitors";
import {
  compareWithCompetitors, geoCompetitorCounts, gscFlag, GSC_URL, isMoneyQuery, KINLY_SITE_READ,
  loadBlogCheck, loadGeo, loadKinlyGsc, seoActions, type GscTotals,
} from "@/lib/hq/seo-signals";
import BlogIdeaButton from "./BlogIdeaButton";
import "@/components/konkurrenter/konkurrenter.css";
import "./seo.css";

const nf = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 1 });
const date = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
const ctr = (t: { clicks: number; impressions: number }) => (t.impressions ? `${nf((t.clicks / t.impressions) * 100)} %` : "—");

/** Pil op = bedre. For position er lavere bedre. */
function Change({ now, before, lowerIsBetter = false }: { now: number | null; before: number | null; lowerIsBetter?: boolean }) {
  if (now == null || before == null || now === before) return <span className="konk-dim">uændret</span>;
  const better = lowerIsBetter ? now < before : now > before;
  return <span style={{ color: better ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{better ? "▲" : "▼"} {nf(Math.abs(now - before))}</span>;
}

function Stat({ label, value, change }: { label: string; value: string; change: React.ReactNode }) {
  return <div className="konk-summary-stat">
    <span className="konk-summary-label">{label}</span>
    <span className="konk-summary-value">{value}</span>
    <span style={{ fontSize: 11.5 }}>{change}</span>
  </div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="seo-empty">{children}</p>;
}

export default async function SeoHistoryPage() {
  // Sekventielt: lokal pglite tåler kun 1 samtidig forbindelse (samme regel som /konkurrenter).
  const gsc = await loadKinlyGsc();
  const geo = await loadGeo();
  const blog = await loadBlogCheck();
  const report = await loadLatestReport();
  const [tech] = await getDb().select().from(seoSnapshot).where(isNull(seoSnapshot.companyId)).orderBy(desc(seoSnapshot.takenAt)).limit(1);

  const compare = compareWithCompetitors(report);
  const actions = seoActions({ gsc, geo, blog, compare });
  const money = (gsc?.queries ?? []).filter((q) => isMoneyQuery(q.query)).sort((a, b) => b.impressions - a.impressions).slice(0, 12);
  const geoResults = geo?.results ?? [];
  const geoHits = geoResults.filter((r) => r.mentionedKinly).length;
  const geoRivals = geoCompetitorCounts(geoResults).slice(0, 5);
  const t = (x: GscTotals | undefined) => x ?? { clicks: 0, impressions: 0, position: null };

  return <div className="cc-fade kinly-page" style={{ display: "grid", gap: 18 }}>
    <PageHeader icon="Search" title="SEO" subtitle="Kinlys egen synlighed: Google, AI-søgning og bloggen — og hvad vi gør ved det." />
    <nav aria-label="SEO-faner" style={{ display: "flex", gap: 8 }}><Link className="cc-btn cc-btn-accent" href="/seo">Overblik</Link><Link className="cc-btn" href="/seo?tab=vaerktoejer">Værktøjer</Link></nav>

    <section className="cc-card cc-card-pad seo-section" aria-labelledby="seo-google">
      <div className="seo-head">
        <h2 id="seo-google" className="konk-section-title">Google · kinly.dk</h2>
        {gsc?.property && <a href={GSC_URL} target="_blank" rel="noreferrer" className="cc-link seo-headlink">Search Console ↗</a>}
      </div>
      {!gsc?.property ? (
        <Empty>
          Search Console for kinly.dk er ikke koblet på HQ endnu. Tilføj HQ&apos;s service-account som &quot;Begrænset bruger&quot; på ejendommen <code>sc-domain:kinly.dk</code> (mailen står under <Link className="cc-link" href="/settings">Indstillinger</Link>). Tallene hentes hver mandag.
          {gsc && <> Sidst forsøgt {date(gsc.fetchedAt)}: ingen adgang.</>}
        </Empty>
      ) : <>
        <div className="konk-dim" style={{ fontSize: 12 }}>28 dage til {date(gsc.periodEnd)} mod de 28 dage før · hentet {date(gsc.fetchedAt)}</div>
        <div className="konk-summary">
          <Stat label="Klik" value={nf(gsc.totals.clicks)} change={<Change now={gsc.totals.clicks} before={t(gsc.prevTotals).clicks} />} />
          <Stat label="Visninger" value={nf(gsc.totals.impressions)} change={<Change now={gsc.totals.impressions} before={t(gsc.prevTotals).impressions} />} />
          <Stat label="CTR" value={ctr(gsc.totals)} change={<span className="konk-dim">før {ctr(t(gsc.prevTotals))}</span>} />
          <Stat label="Gns. position" value={gsc.totals.position == null ? "—" : nf(gsc.totals.position)} change={<Change now={gsc.totals.position} before={t(gsc.prevTotals).position} lowerIsBetter />} />
        </div>
        {money.length === 0 ? <Empty>Ingen søgninger efter hjemmeside, webdesign eller webbureau har givet visninger endnu.</Empty> : (
          <div className="seo-table-wrap">
            <table className="seo-table">
              <thead><tr><th>Penge-søgning</th><th>Pos.</th><th>Visn.</th><th>Klik</th><th>CTR</th></tr></thead>
              <tbody>
                {money.map((q) => {
                  const flag = gscFlag(q);
                  return <tr key={q.query}>
                    <td className="seo-q">{q.query}{flag === "side1-ingen-klik" ? <span className="cc-chip seo-flag" data-kind="red">Side 1, ingen klik</span> : flag === "taet-paa-side1" ? <span className="cc-chip seo-flag" data-kind="amber">Tæt på side 1</span> : null}</td>
                    <td>{nf(q.position)}{q.prevPosition != null && q.prevPosition !== q.position && <span className="seo-was"> før {nf(q.prevPosition)}</span>}</td>
                    <td>{q.impressions}</td>
                    <td>{q.clicks}</td>
                    <td>{ctr(q)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
      </>}
    </section>

    <section className="cc-card cc-card-pad seo-section" aria-labelledby="seo-geo">
      <h2 id="seo-geo" className="konk-section-title">AI-søgning</h2>
      {geoResults.length === 0 ? (
        <Empty>Ingen måling endnu. Hermes spørger ChatGPT hver mandag kl. 8.20 om de spørgsmål danske købere stiller, og resultatet lander her.</Empty>
      ) : <>
        <div className="konk-summary">
          <Stat label="Kinly nævnt" value={`${geoHits} af ${geoResults.length}`} change={<span className="konk-dim">spørgsmål · {geoResults[0].engine === "chatgpt" ? "ChatGPT" : geoResults[0].engine}, {date(geoResults[0].measuredAt)}</span>} />
          {geoRivals.length > 0 && <div className="konk-summary-stat seo-rivals">
            <span className="konk-summary-label">Nævnes oftest (antal spørgsmål)</span>
            <span className="seo-rival-list">{geoRivals.map((r) => <span key={r.name}>{r.name} <span className="konk-dim">{r.count}</span></span>)}</span>
          </div>}
        </div>
        <ul className="seo-list">
          {geoResults.map((r, i) => <li key={i} className="seo-row">
            <span className="konk-flag" data-on={r.mentionedKinly}><span className="konk-flag-dot" />{r.mentionedKinly ? "Nævnt" : "Ikke nævnt"}</span>
            <span className="seo-row-main">{r.query}{r.group && <span className="seo-group">{r.group.startsWith("blog:") ? "blogindlæg" : r.group}</span>}</span>
            <span className="konk-dim seo-row-side">{r.competitors.slice(0, 3).join(", ") || "—"}</span>
          </li>)}
        </ul>
      </>}
    </section>

    <section className="cc-card cc-card-pad seo-section" aria-labelledby="seo-blog">
      <h2 id="seo-blog" className="konk-section-title">Blogindlæg</h2>
      {!blog || blog.posts.length === 0 ? (
        <Empty>Intet tjek endnu. Hver mandag kl. 9 tjekker Hermes indlæg i klar, publicer og udgivet: SEO-punkter, om kundernes spørgsmål bliver besvaret, og om AI nævner os på emnet.</Empty>
      ) : <>
        <div className="konk-dim" style={{ fontSize: 12 }}>Tjekket {date(blog.checkedAt)}</div>
        <div className="konk-finding-grid">
          {blog.posts.map((p) => {
            const answered = p.questions.filter((q) => q.answer === "ja").length;
            const missing = p.questions.filter((q) => q.answer === "nej");
            const g = p.slug ? geoResults.find((r) => r.group === `blog:${p.slug}`) : undefined;
            return <div key={p.id} className="konk-comp-card">
              <div className="konk-comp-head"><strong style={{ fontSize: 14.5 }}>{p.title}</strong><span className="cc-chip konk-angle-chip">{p.stage}</span></div>
              {p.keyword && <span className="konk-dim" style={{ fontSize: 12 }}>Søgeord: {p.keyword}</span>}
              <div className="konk-comp-flags">
                <span className="konk-flag" data-on={p.seoIssues.length === 0}><span className="konk-flag-dot" />{p.seoIssues.length === 0 ? "SEO i orden" : `${p.seoIssues.length} ${p.seoIssues.length === 1 ? "SEO-punkt" : "SEO-punkter"} at rette`}</span>
                <span className="konk-flag" data-on={p.questions.length > 0 && missing.length === 0}><span className="konk-flag-dot" />{p.questions.length ? `${answered} af ${p.questions.length} kundespørgsmål besvaret` : "Ingen kundespørgsmål fundet"}</span>
                <span className="konk-flag" data-on={g?.mentionedKinly}><span className="konk-flag-dot" />{!g ? "AI: ikke målt endnu" : g.mentionedKinly ? "AI nævner os" : "AI nævner os ikke"}</span>
              </div>
              {(p.seoIssues.length > 0 || missing.length > 0) && <ul className="seo-issues">
                {p.seoIssues.slice(0, 3).map((s) => <li key={s}>{s}</li>)}
                {missing.slice(0, 2).map((q) => <li key={q.question}>Besvar: &quot;{q.question}&quot;</li>)}
              </ul>}
            </div>;
          })}
        </div>
      </>}
    </section>

    <section className="cc-card cc-card-pad seo-section" aria-labelledby="seo-konk">
      <div className="seo-head">
        <h2 id="seo-konk" className="konk-section-title">Os mod konkurrenterne</h2>
        <Link href="/konkurrenter" className="cc-link seo-headlink">Konkurrenter →</Link>
      </div>
      {!report ? <Empty>Ingen konkurrent-scan endnu. Den kører søndag nat.</Empty> : <>
        <div className="seo-table-wrap">
          <table className="seo-table">
            <thead><tr><th>Det AI og Google belønner</th><th>Kinly</th><th>Konkurrenter</th></tr></thead>
            <tbody>
              {compare.map((c) => <tr key={c.key}>
                <td className="seo-q">{c.label}</td>
                <td><span className="konk-flag" data-on={c.kinly}><span className="konk-flag-dot" />{c.kinly ? "Ja" : "Nej"}</span></td>
                <td>{c.measured ? `${c.have} af ${c.measured}` : "ikke målt"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <div className="konk-dim" style={{ fontSize: 12 }}>Kinly læst på kinly.dk {KINLY_SITE_READ} · konkurrenter fra scan {date(report.generatedAt)} (uden AI-byggere).</div>
      </>}
    </section>

    <section className="seo-section" aria-labelledby="seo-next">
      <h2 id="seo-next" className="konk-section-title">Næste skridt</h2>
      {actions.length === 0 ? (
        <div className="cc-card cc-card-pad"><Empty>Ingen endnu. De kommer, når målingerne ovenfor har data.</Empty></div>
      ) : (
        <div className="konk-finding-grid">
          {actions.map((a) => <div key={a.id} className="konk-finding-card">
            <h3 className="konk-finding-title">{a.title}</h3>
            <p className="konk-finding-detail konk-finding-detail-open">{a.detail}</p>
            <div className="konk-finding-actions">
              {a.blog && <BlogIdeaButton {...a.blog} />}
              {a.href && (a.href.startsWith("/") ? <Link href={a.href} className="cc-btn">{a.hrefLabel}</Link> : <a href={a.href} target="_blank" rel="noreferrer" className="cc-btn">{a.hrefLabel} ↗</a>)}
            </div>
          </div>)}
        </div>
      )}
    </section>

    <p className="konk-dim" style={{ fontSize: 12.5, margin: 0 }}>
      Teknik: {!tech ? "ikke målt" : tech.issues.length === 0 ? "OK" : `${tech.issues.length} ${tech.issues.length === 1 ? "problem" : "problemer"} (${tech.issues[0].slice(0, 80)})`}
      {tech && <> · PageSpeed {date(tech.takenAt.toISOString())}</>}
      {" · "}Kundernes SEO: <Link className="cc-link" href="/kunder">Kunder →</Link>
    </p>
  </div>;
}
