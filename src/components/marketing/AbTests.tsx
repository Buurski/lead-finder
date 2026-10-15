"use client";
// A/B-tests: to udgaver af samme idé, målt på rigtige opslag. Dommen er en ren funktion
// (marketing-calc.ts abVerdict): under 3 opslag pr. side = for tidligt, fra 3 = signal,
// fra 5 og en side mindst 25 % dårligere = skær, begge medianer 0 = ingen afgørelse.
import { useState } from "react";
import Link from "next/link";
import { AB_LABEL, abBoard, type AbBoardItem } from "@/lib/hq/marketing-calc";
import { AB_STATUSES, type MeasureDto, type RefDto } from "@/lib/hq/marketing-types";
import Field from "./Field";
import Info from "./Info";
import { mk } from "./api";
import "./marketing.css";

const str = (v: unknown) => (typeof v === "string" ? v : "");
const nf = (n: number | null) => (n == null ? "–" : n.toLocaleString("da-DK", { maximumFractionDigits: 1 }));

function Card({ item, onStatus }: { item: AbBoardItem; onStatus: (t: RefDto) => void }) {
  const { test, call } = item;
  const arms = (test.data.arms ?? {}) as { A?: string; B?: string };
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function setStatus(status: string) {
    setBusy(true);
    setError("");
    try {
      onStatus((await mk<{ test: RefDto }>({ action: "abStatus", id: test.id, status })).test);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }
  const label = str(test.data.label);
  return (
    <article className="cc-card mk-card">
      <div className="mk-chips">
        {str(test.data.code) && <span className="cc-chip">{str(test.data.code)}</span>}
        {label && <span className={`cc-chip mk-chip-${label.toLowerCase()}`}>{label}</span>}
        {str(test.data.week) && <span className="cc-chip">uge {str(test.data.week)}</span>}
      </div>
      <h3 className="mk-draft-title">{test.title}</h3>
      <div className="mk-arms">
        <div className="mk-arm"><b>A</b><span>{arms.A || "–"}</span><span className="mk-dim">{call.nA} {call.nA === 1 ? "opslag" : "opslag"} · median {nf(call.medA)}</span></div>
        <div className="mk-arm"><b>B</b><span>{arms.B || "–"}</span><span className="mk-dim">{call.nB} {call.nB === 1 ? "opslag" : "opslag"} · median {nf(call.medB)}</span></div>
      </div>
      <p className="mk-p mk-small">Måles på: {str(test.data.metric) || "Gem + delinger pr. 1000 visninger"}. Opslag uden visninger tæller ikke med.</p>
      <div className="mk-verdict" data-v={call.verdict} role="status">
        <span className="mk-verdict-title">{AB_LABEL[call.verdict]}{call.ahead && call.verdict !== "for-tidligt" && <span className="cc-chip">{call.ahead} foran</span>}</span>
        <span>{call.text}</span>
      </div>
      <div className="mk-row">
        <label className="mk-label" htmlFor={`st-${test.id}`}>Status</label>
        <select id={`st-${test.id}`} className="cc-input" value={test.status || "planlagt"} disabled={busy} onChange={(e) => setStatus(e.target.value)}>
          {AB_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
        </select>
        <Link className="cc-btn" href="/marketing/maaling">Læg måling ind</Link>
      </div>
      {error && <p className="mk-err" role="alert">{error}</p>}
      {(str(test.data.hold) || str(test.data.rule) || str(test.data.caveat) || str(test.data.gate)) && (
        <details className="mk-details">
          <summary>Det fulde testoplæg</summary>
          {([["Hold fast", "hold"], ["Mindst", "minPosts"], ["Sekundært tal", "secondary"], ["Regel i planen", "rule"], ["Forbehold", "caveat"], ["Før den starter", "gate"]] as const).map(([l, k]) => str(test.data[k]) && (
            <p key={k} className="mk-p" style={{ marginTop: 8 }}><strong>{l}:</strong> {str(test.data[k])}</p>
          ))}
        </details>
      )}
    </article>
  );
}

function NewTest({ onCreated }: { onCreated: (t: RefDto) => void }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", armA: "", armB: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      onCreated((await mk<{ test: RefDto }>({ action: "abCreate", test: f })).test);
      setF({ title: "", armA: "", armB: "" });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button type="button" className="cc-btn mk-btn" onClick={() => setOpen(true)}>+ Ny test</button>;
  return (
    <form className="cc-card mk-card mk-form" onSubmit={submit}>
      <h2 className="mk-h2">Ny test</h2>
      <Field label="Hvad tester vi?"><input className="cc-input mk-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required maxLength={200} placeholder="Fx: slutkort “Gem” mod “Send”" /></Field>
      <div className="mk-grid2">
        <Field label="Udgave A"><textarea className="mk-textarea" rows={3} value={f.armA} onChange={(e) => setF({ ...f, armA: e.target.value })} required maxLength={600} /></Field>
        <Field label="Udgave B"><textarea className="mk-textarea" rows={3} value={f.armB} onChange={(e) => setF({ ...f, armB: e.target.value })} required maxLength={600} /></Field>
      </div>
      <p className="mk-p mk-small">Skift kun én ting mellem A og B. Alt andet skal være ens.</p>
      {error && <p className="mk-err" role="alert">{error}</p>}
      <div className="mk-actions">
        <button type="submit" className="cc-btn cc-btn-accent mk-btn" disabled={busy || !f.title.trim() || !f.armA.trim() || !f.armB.trim()}>{busy ? "Gemmer…" : "Gem testen"}</button>
        <button type="button" className="cc-btn mk-btn" onClick={() => setOpen(false)}>Annullér</button>
      </div>
    </form>
  );
}

export default function AbTests({ initialTests, measures }: { initialTests: RefDto[]; measures: MeasureDto[] }) {
  const [tests, setTests] = useState(initialTests);
  const board = abBoard(tests, measures);
  const upsert = (t: RefDto) => setTests((xs) => (xs.some((x) => x.id === t.id) ? xs.map((x) => (x.id === t.id ? t : x)) : [...xs, t]));
  return (
    <div className="mk-wrap">
      <section className="cc-card mk-card">
        <h2 className="mk-h2">
          Sådan dømmer vi
          <Info label="Hvad betyder dommen?">
            Vi sammenligner midtertallet (medianen) for hver udgave, ikke gennemsnittet. Så ændrer ét heldigt opslag ikke billedet. Det er en retning, ikke et bevis.
          </Info>
        </h2>
        <ul className="mk-p" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
          <li><strong>For tidligt</strong>: under 3 opslag på en af siderne.</li>
          <li><strong>Signal</strong>: mindst 3 opslag på hver. Der er en retning.</li>
          <li><strong>Skær</strong>: mindst 5 opslag på hver, og den ene er mindst 25 % dårligere. Drop den dårligste.</li>
          <li><strong>Ingen afgørelse</strong>: begge udgaver ligger på 0.</li>
        </ul>
      </section>
      <NewTest onCreated={upsert} />
      {board.length === 0 ? <div className="cc-card mk-card"><p className="mk-p">Ingen tests endnu.</p></div> : board.map((item) => <Card key={item.test.id} item={item} onStatus={upsert} />)}
    </div>
  );
}
