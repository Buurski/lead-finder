import Link from "next/link";
import { desc, eq, isNull } from "drizzle-orm";
import PageHeader from "@/components/shell/PageHeader";
import SeoChart from "@/components/seo/SeoChart";
import { getDb } from "@/lib/db/client";
import { seoSnapshot } from "@/lib/db/schema";
import { customerSites, type SeoPoint } from "@/lib/hq/seo-history";
import MeasureButton from "./MeasureButton";

const chartPoints = (rows: SeoPoint[]) => rows.map((r) => ({ takenAt: r.takenAt.toISOString(), performance: r.performance, seo: r.seo, accessibility: r.accessibility, onpage: r.onpage }));
const score = (value: number | null) => value == null ? "—" : `${value}/100`;
const date = (value: Date) => value.toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

function Delta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current == null || previous == null || current === previous) return null;
  const d = current - previous;
  return <span style={{ color: d > 0 ? "var(--green)" : "var(--red)", fontSize: 12, fontWeight: 600 }}>{d > 0 ? "▲" : "▼"} {Math.abs(d)}</span>;
}

export default async function SeoHistoryPage() {
  const db = getDb();
  const own = await db.select().from(seoSnapshot).where(isNull(seoSnapshot.companyId)).orderBy(desc(seoSnapshot.takenAt)).limit(52);
  const targets = await customerSites(db);
  const cards: Array<{ target: typeof targets[number]; rows: SeoPoint[] }> = [];
  for (const target of targets) {
    const rows = await db.select().from(seoSnapshot).where(eq(seoSnapshot.companyId, target.companyId)).orderBy(desc(seoSnapshot.takenAt)).limit(52);
    cards.push({ target, rows });
  }
  const latest = own[0];
  return <div className="cc-fade kinly-page" style={{ display: "grid", gap: 18 }}>
    <PageHeader icon="Search" title="SEO" subtitle="Mobilmålinger fra PageSpeed og tjek af sidens indhold." />
    <nav aria-label="SEO-faner" style={{ display: "flex", gap: 8 }}><Link className="cc-btn cc-btn-accent" href="/seo">Historik</Link><Link className="cc-btn" href="/seo?tab=vaerktoejer">Værktøjer</Link></nav>
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div><h2 style={{ fontSize: 18, margin: 0 }}>kinly.dk</h2><span className="cc-dim" style={{ fontSize: 12 }}>{latest ? `Senest målt ${date(latest.takenAt)}` : "Ingen måling endnu"}</span></div>
        <MeasureButton />
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}><strong style={{ fontSize: 42, lineHeight: 1 }}>{score(latest?.seo ?? null)}</strong><span className="cc-dim">PageSpeed SEO</span></div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13 }}><span>Hastighed {score(latest?.performance ?? null)}</span><span>Tilgængelighed {score(latest?.accessibility ?? null)}</span><span>Bedste praksis {score(latest?.bestPractices ?? null)}</span><span>On-page {score(latest?.onpage ?? null)}</span></div>
      {latest && <div className="cc-dim" style={{ fontSize: 12 }}>LCP {latest.lcpMs == null ? "—" : `${(latest.lcpMs / 1000).toFixed(1)} sek.`} · CLS {latest.cls ?? "—"}</div>}
      <SeoChart points={chartPoints(own)} />
      {!!latest?.issues.length && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5 }}>{latest.issues.slice(0, 3).map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    </section>
    <h2 style={{ fontSize: 17, margin: 0 }}>Kunder</h2>
    {cards.length === 0 && <div className="cc-card cc-card-pad cc-dim">Ingen aktive kundesites at måle.</div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 12 }}>
      {cards.map(({ target, rows }) => {
        const current = rows[0], previous = rows[1];
        return <section className="cc-card cc-card-pad" key={target.companyId} style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><div><Link href={`/virksomheder/${target.companyId}`} className="cc-link" style={{ fontWeight: 700 }}>{target.name} ↗</Link><div className="cc-dim" style={{ fontSize: 11.5 }}>{new URL(target.url).host}</div></div><MeasureButton companyId={target.companyId} /></div>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}><strong style={{ fontSize: 28 }}>{score(current?.seo ?? null)}</strong><Delta current={current?.seo ?? null} previous={previous?.seo ?? null} /><span className="cc-dim" style={{ fontSize: 11 }}>SEO</span></div>
          <div className="cc-dim" style={{ fontSize: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span>Hastighed {score(current?.performance ?? null)} <Delta current={current?.performance ?? null} previous={previous?.performance ?? null} /></span>
            <span>Tilgængelighed {score(current?.accessibility ?? null)} <Delta current={current?.accessibility ?? null} previous={previous?.accessibility ?? null} /></span>
            <span>Bedste praksis {score(current?.bestPractices ?? null)} <Delta current={current?.bestPractices ?? null} previous={previous?.bestPractices ?? null} /></span>
            <span>On-page {score(current?.onpage ?? null)} <Delta current={current?.onpage ?? null} previous={previous?.onpage ?? null} /></span>
          </div>
          <SeoChart compact points={chartPoints(rows)} />
          {!!current?.issues.length && <ul style={{ margin: 0, paddingLeft: 17, fontSize: 12 }}>{current.issues.slice(0, 3).map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
          {current && <span className="cc-dim" style={{ fontSize: 11 }}>Målt {date(current.takenAt)}</span>}
        </section>;
      })}
    </div>
  </div>;
}
