"use client";
// Tests-boardet: fire kolonner (Vurderes · Klar til test · Tester · Resultat) +
// foldede lister for droppede og afsluttede. Rent visnings-lag; al validering og
// alle overgange ligger i experiments.ts bag /api/tests.
import { useState } from "react";
import type { Experiment, ExperimentStatus, Measurement, MetricType } from "@/lib/hq/experiments";
import "@/components/konkurrenter/konkurrenter.css";
import "./tests.css";

const DAY_MS = 86_400_000;
const COLUMNS: { status: ExperimentStatus; label: string; empty: string }[] = [
  { status: "vurderes", label: "Vurderes", empty: "Send en idé hertil med “→ Afprøv hos os” på Konkurrenter eller SEO." },
  { status: "klar", label: "Klar til test", empty: "Intet klar endnu." },
  { status: "tester", label: "Tester", empty: "Ingen test kører." },
  { status: "resultat", label: "Resultat", empty: "Ingen resultater endnu." },
];
const METRIC_LABEL: Record<MetricType, (t: string) => string> = {
  gsc_page: (t) => `Google-klik på ${t.replace(/^https:\/\/(www\.)?/, "")}`,
  gsc_query: (t) => `Google-søgningen “${t}”`,
  geo: (t) => `Om AI nævner Kinly på “${t}”`,
  manuel: () => "Du vurderer selv efter 14 dage",
};
const VERDICT_LABEL = { behold: "Hermes siger: behold", drop: "Hermes siger: drop", uklart: "Hermes: uklart — du afgør" } as const;

const nf = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 1 });
const date = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });

function fmtMeasure(m: Measurement): string {
  if (m.note) return m.note;
  if (m.mentioned !== undefined) return m.mentioned ? "AI nævner Kinly" : "AI nævner ikke Kinly";
  const parts = [`${m.clicks ?? 0} klik`, `${m.impressions ?? 0} visn.`];
  if (m.position != null) parts.push(`pos. ${nf(m.position)}`);
  return parts.join(" · ");
}

function Dots({ rating }: { rating: number }) {
  return (
    <span className="konk-dots" aria-label={`Jev: ${rating} af 5`} title={`Jev: ${rating} af 5`}>
      {Array.from({ length: 5 }, (_, i) => <span key={i} className="konk-dot" data-on={i < rating} />)}
    </span>
  );
}
const overall = (e: Experiment) => {
  const s = e.review?.scores ?? [];
  return s.length ? Math.round(s.reduce((a, x) => a + x.rating, 0) / s.length) : 0;
};

function Source({ e }: { e: Experiment }) {
  const from = e.source.from === "seo" ? "SEO" : "Konkurrenter";
  const names = (e.source.competitor ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const who = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  const label = [from, who].filter(Boolean).join(" · ");
  return e.source.url
    ? <a className="cc-link tests-source" href={e.source.url} target="_blank" rel="noopener noreferrer">{label} ↗</a>
    : <a className="cc-link tests-source" href={e.source.from === "seo" ? "/seo" : "/konkurrenter"}>{label} →</a>;
}

type Act = "start" | "keep" | "drop" | "delete";

function Card({ e, now, onChange }: { e: Experiment; now: number; onChange: (id: string, next: Experiment | null) => void }) {
  const [busy, setBusy] = useState<Act | null>(null);
  const [error, setError] = useState("");
  async function act(action: Act) {
    if (action === "delete" && !window.confirm(`Slet “${e.title}”?`)) return;
    setBusy(action);
    setError("");
    try {
      const res = await fetch("/api/tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: e.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "noget gik galt");
      onChange(e.id, action === "delete" ? null : data.experiment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "noget gik galt");
    } finally {
      setBusy(null);
    }
  }
  const total = e.test ? Math.max(1, Math.round((Date.parse(e.test.endsAt) - Date.parse(e.test.startedAt)) / DAY_MS)) : 14;
  const day = e.test ? Math.min(total, Math.max(1, Math.floor((now - Date.parse(e.test.startedAt)) / DAY_MS) + 1)) : 0;
  const measuring = e.test ? now >= Date.parse(e.test.endsAt) : false;

  return (
    <article className="konk-finding-card tests-card" data-status={e.status}>
      <div className="konk-finding-head">
        <Source e={e} />
        {e.review && <Dots rating={overall(e)} />}
      </div>
      <h3 className="konk-finding-title">{e.title}</h3>
      {e.detail && <p className="konk-finding-detail">{e.detail}</p>}

      {e.status === "vurderes" && !e.review && <p className="tests-note">Hermes vurderer den i nat.</p>}
      {e.review && e.status === "vurderes" && <p className="tests-note">Jev: {e.review.reason} Nu tjekker Hermes' council (dyr model + Google) den og skriver planen, eller dropper den.</p>}
      {e.review && e.status !== "vurderes" && <p className="tests-reason"><strong>Jev:</strong> {e.review.reason}</p>}

      {e.plan && (
        <dl className="tests-plan">
          <div><dt>Ændring</dt><dd>{e.plan.change}</dd></div>
          <div><dt>Måles</dt><dd>{METRIC_LABEL[e.plan.metric.type](e.plan.metric.target)}</dd></div>
          <div><dt>Succes</dt><dd>{e.plan.success}</dd></div>
          {e.plan.council && <div><dt>Council</dt><dd><ul className="tests-council">{e.plan.council.notes.map((n, i) => <li key={i}>{n}</li>)}</ul></dd></div>}
        </dl>
      )}

      {e.status === "tester" && e.test && (
        <div className="tests-progress">
          <div className="tests-progress-row">
            <span className="cc-chip tests-day">{measuring ? "Måles i nat" : `Dag ${day}/${total}`}</span>
            <span className="konk-dim">slutter {date(e.test.endsAt)}</span>
          </div>
          <div className="tests-bar" aria-hidden="true"><span style={{ width: `${(day / total) * 100}%` }} /></div>
          {e.test.baseline && <span className="tests-measure">Før: {fmtMeasure(e.test.baseline)}</span>}
        </div>
      )}

      {e.status === "resultat" && e.outcome && (
        <div className="tests-outcome" data-verdict={e.outcome.verdict}>
          <span className="cc-chip tests-verdict">{VERDICT_LABEL[e.outcome.verdict]}</span>
          <p>{e.outcome.summary}</p>
        </div>
      )}

      <div className="konk-finding-actions">
        {e.status === "klar" && (
          <button type="button" className="cc-btn cc-btn-accent" disabled={busy !== null} onClick={() => act("start")} title="Tryk når ændringen er live på kinly.dk">
            {busy === "start" ? "…" : "Start test"}
          </button>
        )}
        {e.status === "resultat" && <>
          <button type="button" className="cc-btn cc-btn-accent" disabled={busy !== null} onClick={() => act("keep")}>{busy === "keep" ? "…" : "Behold"}</button>
          <button type="button" className="cc-btn" disabled={busy !== null} onClick={() => act("drop")}>{busy === "drop" ? "…" : "Drop"}</button>
        </>}
        <button type="button" className="cc-btn konk-action-dismiss" disabled={busy !== null} onClick={() => act("delete")}>{busy === "delete" ? "…" : "Slet"}</button>
      </div>
      {e.status === "klar" && <span className="konk-dim tests-hint">Lav ændringen på kinly.dk først — uret starter, når du trykker.</span>}
      {error && <span className="konk-finding-error">{error}</span>}
    </article>
  );
}

function FoldedRow({ e, onChange }: { e: Experiment; onChange: (id: string, next: Experiment | null) => void }) {
  const [busy, setBusy] = useState(false);
  async function del() {
    if (!window.confirm(`Slet “${e.title}”?`)) return;
    setBusy(true);
    const res = await fetch("/api/tests", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: e.id }) }).catch(() => null);
    setBusy(false);
    if (res?.ok) onChange(e.id, null);
  }
  const why = e.status === "droppet" ? e.review?.reason : e.outcome?.summary;
  return (
    <div className="konk-saved-row tests-folded-row">
      {e.status !== "droppet" && <span className="cc-chip konk-saved-chip" data-status={e.status}>{e.status === "beholdt" ? "Beholdt" : "Afvist"}</span>}
      <div className="tests-folded-text">
        <span className="konk-saved-title">{e.title}</span>
        {why && <span className="konk-dim tests-folded-why">{why}</span>}
      </div>
      <button type="button" className="cc-btn konk-action-dismiss tests-folded-del" disabled={busy} onClick={del}>{busy ? "…" : "Slet"}</button>
    </div>
  );
}

export default function TestsBoard({ initial, now }: { initial: Experiment[]; now: number }) {
  const [items, setItems] = useState(initial);
  function onChange(id: string, next: Experiment | null) {
    setItems((prev) => (next ? prev.map((e) => (e.id === id ? next : e)) : prev.filter((e) => e.id !== id)));
  }
  const by = (s: ExperimentStatus) => items.filter((e) => e.status === s);
  const dropped = by("droppet");
  const finished = items.filter((e) => e.status === "beholdt" || e.status === "afvist");

  return (
    <div className="konk-page">
      <div className="konk-summary">
        {COLUMNS.map((c) => (
          <div className="konk-summary-stat" key={c.status}>
            <span className="konk-summary-label">{c.label}</span>
            <span className="konk-summary-value">{by(c.status).length}</span>
          </div>
        ))}
      </div>

      <div className="tests-cols">
        {COLUMNS.map((c) => {
          const list = by(c.status);
          return (
            <section key={c.status} className="tests-col" aria-labelledby={`tests-${c.status}`}>
              <h2 id={`tests-${c.status}`} className="tests-col-title">{c.label} <span className="konk-dim">{list.length}</span></h2>
              {list.length === 0
                ? <p className="tests-empty">{c.empty}</p>
                : list.map((e) => <Card key={e.id} e={e} now={now} onChange={onChange} />)}
            </section>
          );
        })}
      </div>

      {dropped.length > 0 && (
        <details className="konk-patterns-details">
          <summary className="konk-section-title konk-patterns-summary tests-summary">Droppet af Hermes <span className="konk-dim">{dropped.length}</span></summary>
          <div className="konk-saved-list">{dropped.map((e) => <FoldedRow key={e.id} e={e} onChange={onChange} />)}</div>
        </details>
      )}
      {finished.length > 0 && (
        <details className="konk-patterns-details">
          <summary className="konk-section-title konk-patterns-summary tests-summary">Afsluttet <span className="konk-dim">{finished.length}</span></summary>
          <div className="konk-saved-list">{finished.map((e) => <FoldedRow key={e.id} e={e} onChange={onChange} />)}</div>
        </details>
      )}
    </div>
  );
}
