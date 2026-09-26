"use client";
// /konkurrenter — ugentlig Jev-scan af danske webbureauer (Hermes, søndag
// nat, via POST /api/agent/competitors). Rent visnings-lag: al validering
// ligger i competitors.ts, denne komponent sorterer og viser kun.
//
// "Lav blog-idé" genbruger den eksisterende menneske-rute (POST /api/posts —
// samme kald som BlogBoard's "Ny idé"), så et gap bliver et rigtigt idékort i
// /blog uden en separat opret-vej.
import { useMemo, useState } from "react";
import type { Competitor, CompetitorGap, CompetitorPattern, CompetitorReport, GapKind } from "@/lib/hq/competitors";
import Icon from "@/components/shell/Icon";
import "./konkurrenter.css";

export interface KinlyRow {
  name: string;
  url: string;
  https: boolean;
  services: string[];
  blogPosts30d: number;
  positioning: string;
}

type SortKey = "rating" | "reviews";

const GAP_KIND_LABEL: Record<GapKind, string> = {
  indhold: "Indhold",
  ydelse: "Ydelse",
  pris: "Pris",
  synlighed: "Synlighed",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}
function ratingOf(c: Competitor): number {
  return c.google?.rating ?? -1; // ukendt rating sorterer sidst
}
function reviewsOf(c: Competitor): number {
  return c.google?.reviews ?? -1;
}

function GoogleCell({ google }: { google?: Competitor["google"] }) {
  if (!google) return <span className="konk-dim">—</span>;
  return (
    <span>
      {google.rating.toLocaleString("da-DK", { maximumFractionDigits: 1 })} ★
      <span className="konk-dim"> · {google.reviews.toLocaleString("da-DK")} anm.</span>
    </span>
  );
}

function GapCard({ gap, hideKind = false }: { gap: CompetitorGap; hideKind?: boolean }) {
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");

  async function createIdea() {
    setStatus("busy");
    setError("");
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: gap.title.slice(0, 60), note: gap.detail.slice(0, 300) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke oprette idéen");
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "kunne ikke oprette idéen");
    }
  }

  return (
    <div className="konk-gap-card" data-kind={gap.kind}>
      <div className="konk-gap-head">
        {!hideKind && <span className="cc-chip konk-gap-chip" data-kind={gap.kind}>{GAP_KIND_LABEL[gap.kind]}</span>}
        <h3 className="konk-gap-title">{gap.title}</h3>
      </div>
      <p className="konk-gap-detail">{gap.detail}</p>
      <div className="konk-gap-actions">
        <button type="button" className="cc-btn" disabled={status === "busy" || status === "done"} onClick={createIdea}>
          {status === "done" ? "Idé oprettet" : status === "busy" ? "Opretter…" : "Lav blog-idé"}
        </button>
        {status === "error" && <span className="konk-gap-error">{error}</span>}
      </div>
    </div>
  );
}

function PatternCard({ pattern }: { pattern: CompetitorPattern }) {
  return (
    <div className="konk-pattern-card">
      <h3 className="konk-pattern-title">{pattern.title}</h3>
      <p className="konk-pattern-detail">{pattern.detail}</p>
      {pattern.evidence.length > 0 && (
        <div className="konk-pattern-evidence">
          {pattern.evidence.map((url) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className="cc-link konk-evidence-link">
              <Icon name="ArrowUpRight" style={{ width: 12, height: 12 }} />
              {new URL(url).hostname.replace(/^www\./, "")}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function KonkurrenterBoard({ report, kinly }: { report: CompetitorReport | null; kinly: KinlyRow }) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    if (!report) return [];
    if (!sortKey) return report.competitors;
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortKey === "rating" ? ratingOf : reviewsOf;
    return [...report.competitors].sort((a, b) => (key(a) - key(b)) * dir);
  }, [report, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return null;
    return <Icon name={sortDir === "desc" ? "ChevronDown" : "ChevronUp"} style={{ width: 12, height: 12 }} />;
  }

  if (!report) {
    return (
      <div className="cc-card">
        <div className="cc-empty">
          <Icon name="Radar" />
          <div>Første scan kører søndag nat.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Hermes' ugentlige Jev-scan fylder siden herefter automatisk.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="konk-page">
      <div className="konk-summary">
        <div className="konk-summary-stat">
          <span className="konk-summary-label">Seneste scan</span>
          <span className="konk-summary-value">{fmtDate(report.generatedAt)}</span>
        </div>
        <div className="konk-summary-stat">
          <span className="konk-summary-label">Konkurrenter</span>
          <span className="konk-summary-value">{report.competitors.length}</span>
        </div>
        <div className="konk-summary-stat">
          <span className="konk-summary-label">Jev-kald</span>
          <span className="konk-summary-value">{report.jevCalls}</span>
        </div>
      </div>

      {report.analysis && (
        <section className="konk-section">
          <h2 className="konk-section-title">Hvad betyder det for Kinly</h2>
          <div className="konk-dim" style={{ fontSize: 12, marginBottom: 8 }}>
            AI-læsning af Jevs tal ({report.analysis.model}, {fmtDate(report.analysis.at)}). Tjek tallene i tabellen, før du handler på det.
          </div>
          <div className="konk-gap-grid">
            {report.analysis.points.map((p, i) => (
              <GapCard key={i} gap={{ title: p.title, detail: p.detail, kind: "indhold" }} hideKind />
            ))}
          </div>
        </section>
      )}

      <section className="cc-card konk-table-card">
        {/* Desktop: sortérbar tabel. Mobil: kort — samme data, ingen vandret scroll. */}
        <table className="konk-table">
          <thead>
            <tr>
              <th>Navn</th>
              <th>Google</th>
              <th>PageSpeed mobil</th>
              <th>Priser synlige</th>
              <th>Ydelser</th>
              <th>Blog</th>
              <th>Positionering</th>
            </tr>
          </thead>
          <tbody>
            <tr className="konk-row-kinly">
              <td><span className="cc-chip konk-us-chip">Os</span> {kinly.name}</td>
              <td><span className="konk-dim">—</span></td>
              <td><span className="konk-dim">—</span></td>
              <td><span className="konk-dim">—</span></td>
              <td>{kinly.services.join(", ")}</td>
              <td>{kinly.blogPosts30d} indlæg / 30 dage</td>
              <td>{kinly.positioning}</td>
            </tr>
            {sorted.map((c) => (
              <tr key={c.url}>
                <td>
                  <a href={c.url} target="_blank" rel="noreferrer" className="cc-link konk-name-link">{c.name}</a>
                  {c.city && <div className="konk-dim konk-city">{c.city}</div>}
                </td>
                <td><GoogleCell google={c.google} /></td>
                <td>{c.site?.pagespeedMobile != null ? c.site.pagespeedMobile : <span className="konk-dim">—</span>}</td>
                <td>{c.site ? (c.site.hasPrices ? "Ja" : "Nej") : <span className="konk-dim">—</span>}</td>
                <td>{c.services?.length ? c.services.join(", ") : <span className="konk-dim">—</span>}</td>
                <td>{c.blog ? `${c.blog.posts30d} indlæg / 30 dage` : <span className="konk-dim">—</span>}</td>
                <td>{c.positioning || <span className="konk-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="konk-sort-row">
          <span className="konk-dim">Sortér:</span>
          <button type="button" className="cc-btn konk-sort-btn" onClick={() => toggleSort("reviews")}>Anmeldelser {sortIndicator("reviews")}</button>
          <button type="button" className="cc-btn konk-sort-btn" onClick={() => toggleSort("rating")}>Vurdering {sortIndicator("rating")}</button>
        </div>

        {/* Mobil-kort */}
        <div className="konk-cards">
          <div className="konk-card konk-card-kinly">
            <div className="konk-card-head"><span className="cc-chip konk-us-chip">Os</span> <strong>{kinly.name}</strong></div>
            <dl className="konk-card-kv">
              <dt>Google</dt><dd>—</dd>
              <dt>PageSpeed mobil</dt><dd>—</dd>
              <dt>Priser synlige</dt><dd>—</dd>
              <dt>Ydelser</dt><dd>{kinly.services.join(", ")}</dd>
              <dt>Blog</dt><dd>{kinly.blogPosts30d} indlæg / 30 dage</dd>
              <dt>Positionering</dt><dd>{kinly.positioning}</dd>
            </dl>
          </div>
          {sorted.map((c) => (
            <div className="konk-card" key={c.url}>
              <div className="konk-card-head">
                <a href={c.url} target="_blank" rel="noreferrer" className="cc-link"><strong>{c.name}</strong></a>
                {c.city && <span className="konk-dim"> · {c.city}</span>}
              </div>
              <dl className="konk-card-kv">
                <dt>Google</dt><dd><GoogleCell google={c.google} /></dd>
                <dt>PageSpeed mobil</dt><dd>{c.site?.pagespeedMobile ?? "—"}</dd>
                <dt>Priser synlige</dt><dd>{c.site ? (c.site.hasPrices ? "Ja" : "Nej") : "—"}</dd>
                <dt>Ydelser</dt><dd>{c.services?.length ? c.services.join(", ") : "—"}</dd>
                <dt>Blog</dt><dd>{c.blog ? `${c.blog.posts30d} indlæg / 30 dage` : "—"}</dd>
                <dt>Positionering</dt><dd>{c.positioning || "—"}</dd>
              </dl>
            </div>
          ))}
        </div>
      </section>

      {report.patterns.length > 0 && (
        <section className="konk-section">
          <h2 className="konk-section-title">Mønstre der virker</h2>
          <div className="konk-pattern-grid">
            {report.patterns.map((p, i) => <PatternCard key={i} pattern={p} />)}
          </div>
        </section>
      )}

      {report.gaps.length > 0 && (
        <section className="konk-section">
          <h2 className="konk-section-title">Huller vi kan udnytte</h2>
          <div className="konk-gap-grid">
            {report.gaps.map((g, i) => <GapCard key={i} gap={g} />)}
          </div>
        </section>
      )}
    </div>
  );
}
