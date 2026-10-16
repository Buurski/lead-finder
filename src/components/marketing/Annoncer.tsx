"use client";
// /marketing/annoncer = Annonce-studiet. Mobil-først, hverdagssprog, ⓘ for fagord.
// Fire faner: Annoncer (vælg skærm, ret tekster, godkend, hent pakke) · Test (A/B med stopregler) · Kunde-ja · Bestil.
// Intet sendes til Meta og intet koster penge herfra: Lucas sætter annoncerne op selv.
import { useState } from "react";
import Info from "./Info";
import CopyField from "./CopyField";
import { AnnonceTests, Bestillinger, KundeJaListe, Plan, STATUS_TEKST, ann, statusAf } from "./AnnonceStudie";
import {
  HEADLINE_MAX, PRIMARY_MAX, motiver, type Annonce, type AnnonceBeslutning, type AnnonceMotiv,
} from "@/lib/hq/annoncer-types";
import {
  manglerJa, tekstFejl, teksterFor, type TekstSaet,
} from "@/lib/hq/annonce-studie-types";
import type { StudieState } from "@/lib/hq/annoncer";
import "./marketing.css";

const VINKLER: Array<[string, string]> = [["pris", "Prisen"], ["ejer", "I ejer siden"], ["udkast", "Gratis udkast først"], ["", "Frit"]];

function TekstListe({ navn, max, liste, onChange }: { navn: string; max: number; liste: string[]; onChange: (l: string[]) => void }) {
  return (
    <div className="mk-field">
      <span className="mk-label">{navn} <span className="mk-dim mk-small">(1 til 5, Meta blander dem selv)</span></span>
      {liste.map((t, i) => {
        const fejl = tekstFejl(t, max);
        return (
          <div key={i} className="mk-tekst-linje">
            <textarea className="cc-input mk-textarea" rows={max > 60 ? 3 : 1} value={t} aria-label={`${navn} ${i + 1}`} aria-invalid={fejl.length > 0}
              onChange={(e) => onChange(liste.map((x, j) => (j === i ? e.target.value : x)))} />
            <div className="mk-row mk-small">
              <span className={fejl.length ? "mk-err" : "mk-dim"}>{fejl.length ? fejl.join(" · ") : `${t.length} af ${max} tegn`}</span>
              {liste.length > 1 && <button type="button" className="cc-btn mk-btn-sm" onClick={() => onChange(liste.filter((_, j) => j !== i))}>Fjern</button>}
            </div>
          </div>
        );
      })}
      {liste.length < 5 && <button type="button" className="cc-btn mk-btn-sm" onClick={() => onChange([...liste, ""])}>Tilføj {navn.toLowerCase()}</button>}
    </div>
  );
}

function TekstEditor({ a, start, onSaved, onCancel }: { a: Annonce; start: { overskrifter: string[]; primaere: string[] }; onSaved: (t: Record<string, TekstSaet>) => void; onCancel: () => void }) {
  const [over, setOver] = useState(start.overskrifter);
  const [prim, setPrim] = useState(start.primaere);
  const [vinkel, setVinkel] = useState("pris");
  const [ai, setAi] = useState(false);
  const [afvist, setAfvist] = useState<Array<{ tekst: string; fejl: string[] }>>([]);
  const [kilde, setKilde] = useState<"ai" | "manuel">("manuel");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const flet = (cur: string[], nye: string[]) => [...cur.filter((x) => x.trim()), ...nye.filter((n) => !cur.some((c) => c.toLowerCase() === n.toLowerCase()))].slice(0, 5);
  const ok = over.length > 0 && prim.length > 0 && over.every((t) => !tekstFejl(t, HEADLINE_MAX).length) && prim.every((t) => !tekstFejl(t, PRIMARY_MAX).length);

  async function foreslaa() {
    setAi(true); setErr("");
    try {
      const res = await fetch("/api/marketing/annoncer/tekster", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: a.slug, vinkel }) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; forslag?: { overskrifter: string[]; primaere: string[]; afvist: Array<{ tekst: string; fejl: string[] }> } };
      if (!res.ok || !data.forslag) throw new Error(data.error || "AI kunne ikke svare. Skriv selv, eller prøv igen.");
      setOver((c) => flet(c, data.forslag!.overskrifter));
      setPrim((c) => flet(c, data.forslag!.primaere));
      setAfvist(data.forslag.afvist);
      setKilde("ai");
    } catch (e) { setErr(e instanceof Error ? e.message : "AI kunne ikke svare."); } finally { setAi(false); }
  }
  async function gem() {
    setBusy(true); setErr("");
    try { onSaved((await ann<{ tekster: Record<string, TekstSaet> }>({ action: "tekster", gruppe: a.gruppe, overskrifter: over, primaere: prim, kilde })).tekster); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }

  return (
    <div className="mk-form mk-editor">
      <div className="mk-row">
        <select className="cc-input mk-select" value={vinkel} onChange={(e) => setVinkel(e.target.value)} aria-label="Vinkel for AI-forslag">
          {VINKLER.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className="cc-btn" disabled={ai} onClick={foreslaa}>{ai ? "Skriver…" : "Foreslå tekster med AI"}</button>
        <Info label="Hvordan virker AI-forslag?">AI skriver 3 overskrifter og 3 tekster ud fra vinklen. Tekster med tal uden kilde, pris uden moms, kundenavne eller ord som &quot;garanti&quot; bliver smidt væk med det samme. Du vælger selv, hvad der gemmes.</Info>
      </div>
      {afvist.length > 0 && (
        <details className="mk-details"><summary>{afvist.length} AI-forslag sorteret fra</summary>
          <ul className="mk-plan-liste mk-small">{afvist.map((x) => <li key={x.tekst}>{x.tekst} <span className="mk-err">({x.fejl.join(", ")})</span></li>)}</ul>
        </details>
      )}
      <TekstListe navn="Overskrift" max={HEADLINE_MAX} liste={over} onChange={setOver} />
      <TekstListe navn="Primær tekst" max={PRIMARY_MAX} liste={prim} onChange={setPrim} />
      <p className="mk-small mk-dim">Gemmer du nye tekster, skal alle varianter i konceptet godkendes igen.</p>
      {err && <p className="mk-err" role="alert">{err}</p>}
      <div className="mk-actions">
        <button type="button" className="cc-btn cc-btn-accent" disabled={busy || !ok} onClick={gem}>Gem tekster</button>
        <button type="button" className="cc-btn" onClick={onCancel}>Annullér</button>
      </div>
    </div>
  );
}

function Pakke({ a, t }: { a: Annonce; t: { overskrifter: string[]; primaere: string[] } }) {
  const alt = [
    `Overskrifter:\n${t.overskrifter.join("\n")}`,
    `Primære tekster:\n${t.primaere.join("\n\n")}`,
    `Beskrivelse: ${a.beskrivelse}`,
    `Knap: ${a.cta}`,
    "Formular: Kinly gratis udkast (firmanavn + hjemmeside)",
    "Placering: kun Facebook og Instagram. Audience Network og creative enhancements fra.",
  ].join("\n\n");
  return (
    <details className="mk-details">
      <summary>Pakke til Meta</summary>
      <p className="mk-small mk-dim">Hent billedet og kopiér alt på én gang. Indsæt i Meta Ads Manager under annoncen.</p>
      <a className="cc-btn mk-btn-sm" href={a.billede} download>Hent billede ({a.format})</a>
      <CopyField label="Alt til annoncen" text={alt} />
    </details>
  );
}

function Koncept({ varianter, s, set, start }: { varianter: AnnonceMotiv[]; s: StudieState; set: (p: Partial<StudieState>) => void; start: number }) {
  const [valgt, setValgt] = useState(start);
  const [ret, setRet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const m = varianter[valgt];
  const a = m.tekst;
  const t = teksterFor(a, s.tekster);
  const mangler = manglerJa(a, s.kundeJa);
  const st = statusAf(a, s);

  async function beslut(status: "godkendt" | "droppet" | "afventer") {
    setBusy(true); setErr("");
    try { set({ beslutninger: (await ann<{ beslutninger: Record<string, AnnonceBeslutning> }>({ action: "beslutning", slug: a.slug, status })).beslutninger }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }

  return (
    <article className="cc-card mk-draft mk-ann" data-status={st === "godkendt" ? "godkendt" : st === "droppet" ? "droppet" : "kladde"} aria-label={a.koncept}>
      <div className="mk-chips">
        <span className="cc-chip mk-chip-test">{a.test_celle} · {a.koncept}</span>
        {varianter.some((v) => v.tekst.anbefalet_start) ? <span className="cc-chip mk-chip-ok">Med i første test</span> : <span className="cc-chip mk-chip-senere">Reserve</span>}
      </div>

      {varianter.length > 1 && (
        <div className="mk-seg" role="group" aria-label="Hvilken side står på skærmen">
          {varianter.map((v, i) => (
            <button key={v.slug} type="button" className="mk-seg-btn" aria-pressed={i === valgt} onClick={() => { setValgt(i); setRet(false); setErr(""); }}>
              {v.tekst.skaerm}{statusAf(v.tekst, s) === "godkendt" && " ✓"}{manglerJa(v.tekst, s.kundeJa).length > 0 && " (kunde)"}
            </button>
          ))}
        </div>
      )}

      <div className="mk-ann-imgs">
        {m.formater.map((f) => (
          <figure key={f.format} className="mk-ann-fig" data-format={f.format}>
            <a href={f.billede} target="_blank" rel="noreferrer" aria-label={`Åbn ${a.skaerm} i fuld størrelse`}>
              {/* eslint-disable-next-line @next/next/no-img-element -- lokalt statisk billede */}
              <img src={f.billede} alt={`${a.koncept} med ${a.skaerm} på skærmen`} loading="lazy" />
            </a>
          </figure>
        ))}
      </div>

      <p className="mk-small"><strong>{STATUS_TEKST[st]}</strong>{st === "aendret" && <span className="mk-dim"> Billede, tekst eller knap er ændret siden. Godkend igen.</span>}</p>

      {mangler.length > 0 && (
        <div className="mk-bad" role="alert">
          <strong>Kræver kundens ja: {mangler.join(", ")}</strong>
          <span>Siden kan ses i billedet. Giv ja under fanen Kunde-ja, når kunden har sagt ja skriftligt. Vælg ellers en anden skærm.</span>
        </div>
      )}

      {ret ? (
        <TekstEditor a={a} start={t} onCancel={() => setRet(false)} onSaved={(tekster) => { set({ tekster }); setRet(false); }} />
      ) : (
        <>
          {t.overskrifter.map((x, i) => <CopyField key={`o${i}`} label={`Overskrift ${t.overskrifter.length > 1 ? i + 1 : ""}`.trim()} text={x} max={HEADLINE_MAX} />)}
          {t.primaere.map((x, i) => <CopyField key={`p${i}`} label={`Primær tekst ${t.primaere.length > 1 ? i + 1 : ""}`.trim()} text={x} max={PRIMARY_MAX} />)}
          <p className="mk-small"><strong>Knap:</strong> {a.cta} <span className="mk-dim">· Beskrivelse: {a.beskrivelse}</span></p>
          <button type="button" className="cc-btn mk-btn-sm" onClick={() => setRet(true)}>Ret tekster</button>
        </>
      )}

      {a.advarsler.length > 0 && (
        <details className="mk-details">
          <summary>Tjek før brug ({a.advarsler.length})</summary>
          <ul className="mk-plan-liste mk-small">{a.advarsler.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
      <details className="mk-details">
        <summary>Hvor kommer påstandene fra</summary>
        <ul className="mk-plan-liste mk-small">
          {a.kilde_fakta.map((k, i) => <li key={`${k.fil}-${i}`}><strong>{k.fakta}</strong><br /><span className="mk-dim">{k.fil}</span></li>)}
        </ul>
      </details>
      {st === "godkendt" && <Pakke a={a} t={t} />}

      {err && <p className="mk-err" role="alert">{err}</p>}
      <div className="mk-actions">
        {st !== "godkendt" && <button type="button" className="cc-btn cc-btn-accent" disabled={busy || mangler.length > 0 || ret} onClick={() => beslut("godkendt")}>{mangler.length ? "Venter på kundens ja" : "Godkend"}</button>}
        {st !== "droppet" && <button type="button" className="cc-btn" disabled={busy} onClick={() => beslut("droppet")}>Drop</button>}
        {st !== "afventer" && <button type="button" className="cc-btn" disabled={busy} onClick={() => beslut("afventer")}>Nulstil</button>}
      </div>
    </article>
  );
}

type Fane = "annoncer" | "test" | "kunde" | "bestil";

export default function Annoncer({ rows, initial }: { rows: Annonce[]; initial: StudieState }) {
  const [s, setS] = useState(initial);
  const [fane, setFane] = useState<Fane>("annoncer");
  const set = (p: Partial<StudieState>) => setS((cur) => ({ ...cur, ...p }));
  const alle = motiver(rows);
  const grupper = [...new Set(alle.map((m) => m.tekst.gruppe))].map((g) => alle.filter((m) => m.tekst.gruppe === g));
  grupper.sort((x, y) => Number(y.some((v) => v.tekst.anbefalet_start)) - Number(x.some((v) => v.tekst.anbefalet_start)));
  const godkendte = alle.filter((m) => statusAf(m.tekst, s) === "godkendt").length;
  const koerer = s.tests.filter((t) => t.status === "kører").length;
  const nyeBest = s.bestillinger.filter((b) => b.status === "ny").length;
  const FANER: Array<[Fane, string, number | null]> = [["annoncer", "Annoncer", godkendte], ["test", "Test", koerer], ["kunde", "Kunde-ja", null], ["bestil", "Bestil", nyeBest]];

  return (
    <div className="mk-wrap">
      <section className="cc-card mk-card" aria-labelledby="saadan-h">
        <h2 className="mk-h2" id="saadan-h">Sådan bruger du studiet</h2>
        <p className="mk-p">Vælg skærm og tekst pr. koncept, og godkend. Start en test med 2 til 3 godkendte annoncer, og sæt dem op i Meta selv. Skriv tallene fra Ads Manager ind under Test én gang om ugen: studiet siger, hvad der skal på pause, og hvornår der er en vinder.</p>
        <Plan />
      </section>

      <div className="mk-seg" role="group" aria-label="Del af studiet">
        {FANER.map(([k, l, n]) => (
          <button key={k} type="button" className="mk-seg-btn" aria-pressed={fane === k} onClick={() => setFane(k)}>
            {l}{n !== null && <span className="mk-seg-count">{n}</span>}
          </button>
        ))}
      </div>

      {fane === "annoncer" && (
        <div className="mk-ann-grid">
          {grupper.map((v) => <Koncept key={v[0].tekst.gruppe} varianter={v} s={s} set={set} start={Math.max(0, v.findIndex((x) => x.tekst.anbefalet_start))} />)}
        </div>
      )}
      {fane === "test" && <AnnonceTests rows={rows} s={s} set={set} />}
      {fane === "kunde" && <KundeJaListe rows={rows} s={s} set={set} />}
      {fane === "bestil" && <Bestillinger rows={rows} s={s} set={set} />}
    </div>
  );
}
