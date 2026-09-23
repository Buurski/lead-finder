import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import Link from "next/link";
import SeoClient from "./SeoClient";
import SeoTjekFunnel from "./SeoTjekFunnel";
import { getClients } from "@/lib/sheets";
import type { Client } from "@/lib/sheets";
import { hermesSynlighed } from "@/lib/hermes";
import type { SynlighedSite } from "@/lib/hermes-client";
import SeoHistoryPage from "./SeoHistoryPage";

export const metadata = { title: "SEO-overblik · Kinly Lead System" };
export const dynamic = "force-dynamic";

const nf = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: n < 100 ? 1 : 0 });

function deltaPct(current: number, previous: number | undefined): number | null {
  if (previous == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

function Delta({ current, previous }: { current: number; previous?: number }) {
  const d = deltaPct(current, previous);
  if (d == null) return null;
  const up = d >= 0;
  return (
    <span className="cc-chip" style={{ background: up ? "var(--accent-soft)" : "var(--red-dim)", color: up ? "var(--text)" : "var(--red)", fontWeight: 700 }}>
      {up ? "+" : ""}{d}%
    </span>
  );
}

function SiteCard({ site }: { site: SynlighedSite }) {
  const ga = site.ga4?.status === "ok" ? site.ga4.current : null;
  const prev = site.ga4?.status === "ok" ? site.ga4.previous?.totals : undefined;
  const gsc = site.gsc?.status === "ok" ? site.gsc : null;
  return (
    <section className="cc-card" aria-label={site.name}>
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <Icon name="Search" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>
          <a href={`https://${site.name}`} target="_blank" rel="noreferrer" className="cc-link" style={{ color: "inherit" }}>{site.name} ↗</a>
        </h3>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>{ga ? "GA4 live" : "GA4 mangler"}{gsc ? " · GSC live" : " · GSC ikke koblet"}</span>
        <a
          href={`https://search.google.com/search-console?resource_id=${encodeURIComponent(`sc-domain:${site.name}`)}`}
          target="_blank"
          rel="noreferrer"
          className="cc-link"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          Åbn i Search Console ↗
        </a>
      </div>

      <div className="cc-numbers" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
        <div className="cc-numbers-cell">
          <div className="cc-stat-n" style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            {ga ? nf(ga.totals.users) : "—"} <Delta current={ga?.totals.users ?? 0} previous={prev?.users} />
          </div>
          <div className="cc-stat-l">brugere · 30 dage</div>
        </div>
        <div className="cc-numbers-cell">
          <div className="cc-stat-n">{ga ? nf(ga.totals.sessions) : "—"}</div>
          <div className="cc-stat-l">sessioner</div>
        </div>
        <div className="cc-numbers-cell">
          <div className="cc-stat-n">{ga ? nf(ga.totals.views) : "—"}</div>
          <div className="cc-stat-l">sidevisninger</div>
        </div>
      </div>

      <div style={{ padding: "12px 22px", borderTop: "1px solid var(--border)" }}>
        {gsc ? (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12.5, color: "var(--text-muted)" }}>
              <span><strong style={{ color: "var(--text)" }}>{nf(gsc.totals?.clicks ?? 0)}</strong> klik</span>
              <span><strong style={{ color: "var(--text)" }}>{nf(gsc.totals?.impressions ?? 0)}</strong> visninger</span>
              <span>CTR <strong style={{ color: "var(--text)" }}>{((gsc.totals?.ctr ?? 0) * 100).toFixed(1)}%</strong></span>
              <span>pos. <strong style={{ color: "var(--text)" }}>{(gsc.totals?.position ?? 0).toFixed(1)}</strong></span>
            </div>
            {gsc.topPages && gsc.topPages.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="cc-dim" style={{ fontSize: 11 }}>Sider der henter visninger</div>
                {gsc.topPages.slice(0, 4).map((p) => (
                  <div key={p.page} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5, padding: "3px 0" }}>
                    <a
                      href={p.page}
                      target="_blank"
                      rel="noreferrer"
                      className="cc-link"
                      style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "inherit" }}
                    >
                      {p.page.replace(/^https?:\/\/[^/]+/, "") || "/"} ↗
                    </a>
                    <span className="cc-dim">{Math.round(p.clicks)} klik</span>
                    <span className="cc-dim">pos. {p.position.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            )}
            {gsc.topQueries && gsc.topQueries.length > 0 && (
              <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
                {gsc.topQueries.slice(0, 5).map((q) => (
                  <li key={q.query} style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 12.5, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(q.query)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="cc-link"
                      style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "inherit" }}
                    >
                      {q.query} ↗
                    </a>
                    <span className="cc-dim">{Math.round(q.impressions)} visn.</span>
                    <span className="cc-dim">{Math.round(q.clicks)} klik</span>
                    <span className="cc-dim">pos. {q.position.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            GSC er ikke koblet på denne ejendom endnu ({site.gsc?.note ?? "forbindelsen mangler"}). GA4-tallene ovenfor er rigtige.
          </div>
        )}
      </div>
    </section>
  );
}

export default async function SeoPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  if ((await searchParams).tab !== "vaerktoejer") return <SeoHistoryPage />;
  let clients: Client[] = [];
  let ok = true;
  try {
    clients = await getClients();
  } catch {
    ok = false;
  }

  const [synlighed] = await Promise.all([hermesSynlighed().catch(() => null)]);
  const sites = synlighed?.ok ? Object.entries(synlighed.sites ?? {}) : [];

  const rows = clients.map((c) => ({ id: c.id, name: c.name, branch: c.branch, websiteStatus: c.websiteStatus }));

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <nav aria-label="SEO-faner" style={{ display: "flex", gap: 8 }}><Link className="cc-btn" href="/seo">Historik</Link><Link className="cc-btn cc-btn-accent" href="/seo?tab=vaerktoejer">Værktøjer</Link></nav>
      <PageHeader
        icon="Search"
        title="SEO-overblik"
        subtitle="Rigtige tal først (GA4, og GSC når det er koblet), derefter tjeklisten pr. kunde."
      />

      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="Gauge" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Sådan læses siden</h2>
        </div>
        <p className="cc-dim" style={{ fontSize: 12.5, margin: 0 }}>
          Øverst: de målte tal pr. site — 30 dage mod de 30 dage før (rigtige data, ingen estimater).
          {synlighed?.ok && synlighed.generatedAt ? ` Opdateret ${new Date(synlighed.generatedAt).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.` : " Snapshot ikke hentet endnu."}
          {" "}Nedenfor: den tekniske tjekliste (schema, hastighed, AI-synlighed) pr. kunde. GSC giver søgeord og positioner — den skal genforbindes i Composio før de vises.
        </p>
      </section>

      {sites.length > 0 && (
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))" }}>
          {sites.map(([key, site]) => <SiteCard key={key} site={site} />)}
        </div>
      )}

      {!synlighed?.ok && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="Activity" style={{ width: 16, height: 16, color: "var(--amber)" }} />
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Synligheds-snapshot er ikke hentet endnu ({synlighed?.note ?? "VPS svarer ikke"}). Tjeklisten nedenfor virker stadig.
          </span>
        </div>
      )}

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <SeoTjekFunnel />
        <SeoClient clients={rows} ok={ok} />
      </div>

      <p className="cc-dim" style={{ fontSize: 12 }}>
        Kilder: GA4 pr. kunde-site (VPS-snapshot, read-only). Vil du se flere sites her, så kobles deres GA4-ejendom på listen i <code>synlighed_snapshot.py</code>. Kildekode og status: <Link className="cc-link" href="/drift">Drift &amp; OS</Link>.
      </p>
    </div>
  );
}
