"use client";
// /marketing/annoncer: trin 1-planen som tjekliste øverst, så et galleri af stills (billede + tekst med
// kopiér-knapper). Godkend/drop gemmes i HQ (append-only log). Intet sendes til Meta og intet koster penge herfra:
// Lucas henter billederne og sætter dem ind i Meta selv.
import { useEffect, useState } from "react";
import Info from "./Info";
import {
  HEADLINE_MAX, PLAN, PLAN_TAL, PRIMARY_MAX, kundeOkMaerke, venterPaaKunde,
  type AnnonceBeslutning, type AnnonceMotiv, type AnnonceStatus,
} from "@/lib/hq/annoncer-types";
import "./marketing.css";

type Beslutninger = Record<string, AnnonceBeslutning>;
const STATUS_TEKST: Record<AnnonceStatus, string> = { afventer: "Ikke besluttet", godkendt: "Godkendt", droppet: "Droppet" };
const FORMAT_TEKST: Record<string, string> = { "1080x1080": "Kvadrat", "1080x1350": "Høj" };
const PLAN_KEY = "kinly-annoncer-plan";

const INFO_KONCEPT = "Hvert koncept (K1 til K6) er en slags annonce, vi tester mod hinanden. Meta viser den mest, der giver flest henvendelser. Brug 4 til 5 forskellige, ikke mange udgaver af det samme.";
const INFO_ANBEFALET = "Det foreslåede startsæt: fem annoncer med hver sit koncept. De andre er reserve, hvis en af de fem taber efter 7 til 10 dage.";

function readTicks(): string[] {
  try {
    const raw = window.localStorage.getItem(PLAN_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function Plan() {
  const [ticks, setTicks] = useState<string[]>([]);
  useEffect(() => {
    // localStorage findes kun i browseren, og siden SSR'es: en lazy useState ville give hydreringsfejl.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTicks(readTicks());
  }, []);
  function toggle(id: string) {
    setTicks((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        window.localStorage.setItem(PLAN_KEY, JSON.stringify(next));
      } catch {
        /* privat vindue eller blokeret lager: krydset gælder bare denne visning */
      }
      return next;
    });
  }
  return (
    <section className="cc-card mk-card" aria-labelledby="plan-h">
      <h2 className="mk-h2" id="plan-h">Plan for trin 1</h2>
      <p className="mk-p">En lille test af, om annoncer på Facebook og Instagram kan betale sig for Kinly. Intet køres herfra: du sætter det selv op i Meta.</p>
      <div className="mk-plan-tal">
        {PLAN_TAL.map((t) => (
          <div key={t.n} className="mk-plan-tal-i">
            <span className="mk-todo-n">{t.n}</span>
            <span className="mk-todo-l">{t.l}</span>
          </div>
        ))}
      </div>
      {PLAN.map((g) => (
        <details key={g.id} className="mk-details" open={g.id === "foer"}>
          <summary>{g.titel}</summary>
          {g.note && <p className="mk-p mk-dim">{g.note}</p>}
          <ul className="mk-plan-liste">
            {g.punkter.map((p) => (
              <li key={p.id}>
                <label className="mk-check">
                  <input type="checkbox" checked={ticks.includes(p.id)} onChange={() => toggle(p.id)} />
                  <span>{p.tekst}</span>
                </label>
                {p.info && <Info label="Hvad betyder det?">{p.info}</Info>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}

function CopyField({ label, text, max }: { label: string; text: string; max?: number }) {
  const [done, setDone] = useState(false);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setDone(ok);
    if (ok) setTimeout(() => setDone(false), 1600);
  }
  const over = max !== undefined && text.length > max;
  return (
    <div className="mk-copy">
      <div className="mk-copy-head">
        <span className="mk-label">{label}</span>
        <span className="mk-row">
          {max !== undefined && <span className={`mk-small ${over ? "mk-err" : "mk-dim"}`}>{text.length} af {max} tegn</span>}
          <button type="button" className="cc-btn mk-btn-sm" onClick={copy} aria-label={`Kopiér ${label.toLowerCase()}`}>{done ? "Kopieret" : "Kopiér"}</button>
        </span>
      </div>
      <p className="mk-copy-text">{text}</p>
    </div>
  );
}

function Motiv({ m, status, onDecide, busy }: { m: AnnonceMotiv; status: AnnonceStatus; onDecide: (s: AnnonceStatus) => void; busy: boolean }) {
  const a = m.tekst;
  const venter = venterPaaKunde(a);
  return (
    <article className="cc-card mk-draft mk-ann" data-status={status === "godkendt" ? "godkendt" : status === "droppet" ? "droppet" : "kladde"} aria-label={a.overskrift}>
      <div className="mk-chips">
        <span className="cc-chip mk-chip-test">{a.test_celle} · {a.koncept}</span>
        {a.anbefalet_start ? <span className="cc-chip mk-chip-ok">Anbefalet start</span> : <span className="cc-chip mk-chip-senere">Reserve</span>}
        <span className={`cc-chip ${status === "godkendt" ? "mk-chip-ok" : status === "droppet" ? "mk-chip-bad" : ""}`}>{STATUS_TEKST[status]}</span>
      </div>

      <div className="mk-ann-imgs">
        {m.formater.map((f) => (
          <figure key={f.format} className="mk-ann-fig" data-format={f.format}>
            <a href={f.billede} target="_blank" rel="noreferrer" aria-label={`Åbn ${FORMAT_TEKST[f.format] ?? f.format} i fuld størrelse`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- lokalt statisk billede, ikke optimeringsbehov */}
              <img src={f.billede} alt={`${a.overskrift}, ${FORMAT_TEKST[f.format] ?? f.format}`} loading="lazy" />
            </a>
            <figcaption>
              <a className="cc-btn mk-btn-sm" href={f.billede} download>Hent {(FORMAT_TEKST[f.format] ?? f.format).toLowerCase()}</a>
              <span className="mk-small mk-dim">{f.format}</span>
            </figcaption>
          </figure>
        ))}
      </div>

      {venter && (
        <div className="mk-bad" role="alert">
          <strong>{kundeOkMaerke(a)}</strong>
          <span>Må ikke bruges i en annonce, før kunden har sagt ja skriftligt til billede og navn. Brug kinly.dk-varianten imens.</span>
        </div>
      )}

      <CopyField label="Overskrift" text={a.overskrift} max={HEADLINE_MAX} />
      <CopyField label="Primær tekst" text={a.primaer_tekst} max={PRIMARY_MAX} />
      <CopyField label="Beskrivelse" text={a.beskrivelse} />
      <p className="mk-small"><strong>Knap:</strong> {a.cta} <span className="mk-dim">(vælg den i Meta)</span></p>

      {a.advarsler.length > 0 && (
        <details className="mk-details">
          <summary>Tjek før brug ({a.advarsler.length})</summary>
          <ul className="mk-plan-liste mk-small">{a.advarsler.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <details className="mk-details">
        <summary>Hvor kommer påstandene fra</summary>
        <ul className="mk-plan-liste mk-small">
          {a.kilde_fakta.map((k) => <li key={k.fil}><strong>{k.fakta}</strong><br /><span className="mk-dim">{k.fil}</span></li>)}
          {a.billede_kilder.map((k) => <li key={k}><span className="mk-dim">Billede: {k}</span></li>)}
        </ul>
      </details>

      <div className="mk-actions">
        {status !== "godkendt" && <button type="button" className="cc-btn cc-btn-accent" disabled={busy || venter} title={venter ? "Kundens skriftlige ja mangler" : undefined} onClick={() => onDecide("godkendt")}>{venter ? "Venter på kundens ja" : "Godkend"}</button>}
        {status !== "droppet" && <button type="button" className="cc-btn" disabled={busy} onClick={() => onDecide("droppet")}>Drop</button>}
        {status !== "afventer" && <button type="button" className="cc-btn" disabled={busy} onClick={() => onDecide("afventer")}>Nulstil</button>}
      </div>
    </article>
  );
}

type Filter = "alle" | "start" | "godkendt" | "droppet";

export default function Annoncer({ motiver, initial }: { motiver: AnnonceMotiv[]; initial: Beslutninger }) {
  const [dec, setDec] = useState<Beslutninger>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("alle");
  const st = (slug: string): AnnonceStatus => dec[slug]?.status ?? "afventer";

  async function decide(slug: string, status: AnnonceStatus) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/marketing/annoncer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, status }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; beslutninger?: Beslutninger };
      if (!res.ok || !data.beslutninger) throw new Error(data.error || "Kunne ikke gemme. Prøv igen.");
      setDec(data.beslutninger);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  const count = (f: Filter) => motiver.filter((m) => match(m, f)).length;
  function match(m: AnnonceMotiv, f: Filter) {
    if (f === "alle") return true;
    if (f === "start") return m.tekst.anbefalet_start;
    return st(m.slug) === f;
  }
  const shown = motiver.filter((m) => match(m, filter));
  const FILTERS: Array<[Filter, string]> = [["alle", "Alle"], ["start", "Anbefalet start"], ["godkendt", "Godkendt"], ["droppet", "Droppet"]];

  return (
    <div className="mk-wrap">
      <Plan />

      <section className="mk-wrap" aria-labelledby="galleri-h">
        <h2 className="mk-h2" id="galleri-h">
          Billeder og tekster
          <Info label="Hvad er K1 til K6 og anbefalet start?">{INFO_KONCEPT} {INFO_ANBEFALET}</Info>
        </h2>
        <p className="mk-p">Hvert billede findes i to formater. Teksten er den samme. Hent billedet, kopiér teksten og sæt det ind i Meta selv.</p>
        <div className="mk-seg" role="group" aria-label="Vis">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" className="mk-seg-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}<span className="mk-seg-count">{count(k)}</span>
            </button>
          ))}
        </div>
        {error && <p className="mk-err" role="alert">{error}</p>}
        {shown.length === 0 ? <p className="mk-p mk-dim">Ingen billeder her endnu.</p> : (
          <div className="mk-ann-grid">
            {shown.map((m) => <Motiv key={m.slug} m={m} status={st(m.slug)} busy={busy} onDecide={(s) => decide(m.slug, s)} />)}
          </div>
        )}
      </section>
    </div>
  );
}
