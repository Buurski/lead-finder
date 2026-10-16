"use client";
// Annonce-studiets andre faner: plan/regler, A/B-tests med stopregler, kunde-ja og bestillinger af nye varianter.
// Alle regler (stop ved 600/1.200 kr, hvornår en vinder er sikker) kommer fra annonce-studie-types, så UI, server og
// Hermes siger det samme.
import { useEffect, useState } from "react";
import Info from "./Info";
import Field from "./Field";
import { PLAN, PLAN_TAL, type Annonce } from "@/lib/hq/annoncer-types";
import {
  MIN_FORBRUG_FOER_DOM, STOP_EN_LEAD, STOP_UDEN_LEAD, versionAf, vurderTest,
  type AbTest, type Bestilling, type KundeJaMap,
} from "@/lib/hq/annonce-studie-types";
import type { StudieState } from "@/lib/hq/annoncer";
import "./marketing.css";

type Props = { rows: Annonce[]; s: StudieState; set: (p: Partial<StudieState>) => void };
type Status = "godkendt" | "aendret" | "droppet" | "afventer";
export const STATUS_TEKST: Record<Status, string> = { godkendt: "Godkendt", aendret: "Ændret efter godkendelse", droppet: "Droppet", afventer: "Ikke godkendt endnu" };

export function statusAf(a: Annonce, s: Pick<StudieState, "beslutninger" | "tekster">): Status {
  const b = s.beslutninger[a.slug];
  if (b?.status === "godkendt") return b.version === versionAf(a, s.tekster) ? "godkendt" : "aendret";
  return b?.status === "droppet" ? "droppet" : "afventer";
}

/** POST til /api/marketing/annoncer. Kaster en dansk fejltekst fra serveren. */
export async function ann<T>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/marketing/annoncer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Kunne ikke nå serveren. Prøv igen.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Noget gik galt. Prøv igen.");
  return data as T;
}

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;
const idag = () => new Date().toISOString().slice(0, 10);
const navnAf = (rows: Annonce[], slug: string) => {
  const a = rows.find((x) => x.slug === slug);
  return a ? `${a.koncept} · ${a.skaerm}` : slug;
};

// ---------------------------------------------------------------- plan (tjekliste, gemt i browseren)
const PLAN_KEY = "kinly-annoncer-plan";
export function Plan() {
  const [ticks, setTicks] = useState<string[]>([]);
  useEffect(() => {
    // localStorage findes kun i browseren, og siden SSR'es: en lazy useState ville give hydreringsfejl.
    try {
      const v = JSON.parse(window.localStorage.getItem(PLAN_KEY) ?? "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(v)) setTicks(v.filter((x): x is string => typeof x === "string"));
    } catch { /* privat vindue: ingen gemte kryds */ }
  }, []);
  function toggle(id: string) {
    setTicks((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try { window.localStorage.setItem(PLAN_KEY, JSON.stringify(next)); } catch { /* krydset gælder bare denne visning */ }
      return next;
    });
  }
  return (
    <details className="mk-details">
      <summary>Budget, regler og tjekliste for trin 1</summary>
      <div className="mk-plan-tal">
        {PLAN_TAL.map((t) => <div key={t.n} className="mk-plan-tal-i"><span className="mk-todo-n">{t.n}</span><span className="mk-todo-l">{t.l}</span></div>)}
      </div>
      {PLAN.map((g) => (
        <details key={g.id} className="mk-details">
          <summary>{g.titel}</summary>
          {g.note && <p className="mk-p mk-dim">{g.note}</p>}
          <ul className="mk-plan-liste">
            {g.punkter.map((p) => (
              <li key={p.id}>
                <label className="mk-check"><input type="checkbox" checked={ticks.includes(p.id)} onChange={() => toggle(p.id)} /><span>{p.tekst}</span></label>
                {p.info && <Info label="Hvad betyder det?">{p.info}</Info>}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </details>
  );
}

// ---------------------------------------------------------------- A/B-tests
function NyTest({ rows, s, set }: Props) {
  const optaget = new Set(s.tests.filter((t) => t.status === "kører").flatMap((t) => t.arme));
  const klar = [...new Map(rows.map((a) => [a.slug, a])).values()].filter((a) => statusAf(a, s) === "godkendt" && !optaget.has(a.slug));
  const [valgt, setValgt] = useState<string[]>([]);
  const [navn, setNavn] = useState("");
  const [hyp, setHyp] = useState("");
  const [start, setStart] = useState(idag);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function opret() {
    setBusy(true); setErr("");
    try {
      set({ tests: (await ann<{ tests: AbTest[] }>({ action: "testOpret", navn, hypotese: hyp, start, arme: valgt })).tests });
      setValgt([]); setNavn(""); setHyp("");
    } catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke oprette."); } finally { setBusy(false); }
  }
  return (
    <section className="cc-card mk-card" aria-labelledby="nytest-h">
      <h2 className="mk-h2" id="nytest-h">Start en test
        <Info label="Hvorfor kun 2 til 3?">Med 150 kr om dagen får vi måske 10 til 15 henvendelser på 4 uger. Det rækker kun til at se forskel på 2 til 3 meget forskellige annoncer. Flere udgaver af det samme ser ens ud i tallene.</Info>
      </h2>
      {klar.length < 2 ? (
        <p className="mk-p mk-dim">{optaget.size ? `${klar.length} godkendte annoncer er ikke allerede i en test. ` : ""}Godkend mindst 2 annoncer under fanen Annoncer for at starte en ny test.</p>
      ) : (
        <div className="mk-form">
          <fieldset className="mk-field">
            <legend className="mk-label">Vælg 2 eller 3 godkendte annoncer</legend>
            {klar.map((a) => (
              <label key={a.slug} className="mk-check">
                <input type="checkbox" checked={valgt.includes(a.slug)} disabled={!valgt.includes(a.slug) && valgt.length >= 3}
                  onChange={() => setValgt((v) => (v.includes(a.slug) ? v.filter((x) => x !== a.slug) : [...v, a.slug]))} />
                <span>{a.koncept} · {a.skaerm}</span>
              </label>
            ))}
          </fieldset>
          <Field label="Navn på testen"><input className="cc-input mk-input" value={navn} maxLength={80} placeholder="Hånd mod pris" onChange={(e) => setNavn(e.target.value)} /></Field>
          <Field label="Hvad tester I" info="Én sætning om, hvad I tror. Fx: Prisen i billedet giver billigere henvendelser end hånden med telefonen."><textarea className="cc-input mk-textarea" rows={2} maxLength={300} value={hyp} onChange={(e) => setHyp(e.target.value)} /></Field>
          <Field label="Startdato i Meta"><input type="date" className="cc-input mk-input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          {err && <p className="mk-err" role="alert">{err}</p>}
          <button type="button" className="cc-btn cc-btn-accent" disabled={busy || valgt.length < 2 || !navn.trim()} onClick={opret}>Start test</button>
          <p className="mk-small mk-dim">HQ starter intet i Meta. Lav én annoncegruppe pr. annonce med samme budget (ABO), så pengene deles lige.</p>
        </div>
      )}
    </section>
  );
}

function Resultatform({ t, rows, set }: { t: AbTest; rows: Annonce[]; set: Props["set"] }) {
  const tom = { slug: t.arme[0], fra: t.start, til: idag(), forbrug: "", leads: "", kvalificerede: "", kunder: "", visninger: "", klik: "" };
  const [f, setF] = useState(tom);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const felt = (k: keyof typeof tom) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function gem() {
    setBusy(true); setErr("");
    try {
      set({ tests: (await ann<{ tests: AbTest[] }>({ action: "testResultat", id: t.id, ...f, visninger: f.visninger || 0, klik: f.klik || 0, kvalificerede: f.kvalificerede || 0, kunder: f.kunder || 0 })).tests });
      setF({ ...tom, slug: f.slug, fra: f.fra, til: f.til });
    } catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }
  return (
    <details className="mk-details">
      <summary>Skriv tal ind fra Ads Manager</summary>
      <div className="mk-form">
        <Field label="Annonce"><select className="cc-input mk-select" value={f.slug} onChange={felt("slug")}>{t.arme.map((a) => <option key={a} value={a}>{navnAf(rows, a)}</option>)}</select></Field>
        <div className="mk-grid">
          <Field label="Fra"><input type="date" className="cc-input mk-input" value={f.fra} onChange={felt("fra")} /></Field>
          <Field label="Til"><input type="date" className="cc-input mk-input" value={f.til} onChange={felt("til")} /></Field>
          <Field label="Brugt (kr)" info="Kolonnen 'Beløb brugt' i Ads Manager for perioden."><input inputMode="decimal" className="cc-input mk-input" value={f.forbrug} onChange={felt("forbrug")} /></Field>
          <Field label="Henvendelser" info="Antal udfyldte formularer (leads) i perioden."><input inputMode="numeric" className="cc-input mk-input" value={f.leads} onChange={felt("leads")} /></Field>
          <Field label="Rigtige emner" info="Henvendelser fra en virksomhed med CVR, der faktisk kan bruge en hjemmeside. Udfyld, når du har ringet."><input inputMode="numeric" className="cc-input mk-input" value={f.kvalificerede} onChange={felt("kvalificerede")} /></Field>
          <Field label="Nye kunder"><input inputMode="numeric" className="cc-input mk-input" value={f.kunder} onChange={felt("kunder")} /></Field>
          <Field label="Visninger"><input inputMode="numeric" className="cc-input mk-input" value={f.visninger} onChange={felt("visninger")} /></Field>
          <Field label="Klik"><input inputMode="numeric" className="cc-input mk-input" value={f.klik} onChange={felt("klik")} /></Field>
        </div>
        <p className="mk-small mk-dim">Skriv kun det nye siden sidst. Tallene lægges sammen.</p>
        {err && <p className="mk-err" role="alert">{err}</p>}
        <button type="button" className="cc-btn cc-btn-accent" disabled={busy || f.forbrug === "" || f.leads === ""} onClick={gem}>Gem tal</button>
      </div>
    </details>
  );
}

function TestKort({ t, rows, set }: { t: AbTest; rows: Annonce[]; set: Props["set"] }) {
  const v = vurderTest(t);
  const [vinder, setVinder] = useState(v.fører ?? "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const koerer = t.status === "kører";
  async function kald(body: Record<string, unknown>) {
    setBusy(true); setErr("");
    try { set({ tests: (await ann<{ tests: AbTest[] }>(body)).tests }); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }
  const dataV = !koerer ? "skaer" : v.sikker ? "skaer" : v.fører ? "signal" : "for-tidligt";
  return (
    <article className="cc-card mk-card" aria-label={t.navn}>
      <div className="mk-chips">
        <span className={`cc-chip ${koerer ? "mk-chip-nu" : "mk-chip-ok"}`}>{koerer ? "Kører" : "Afsluttet"}</span>
        <span className="cc-chip">Start {t.start}</span>
      </div>
      <h3 className="mk-item-title">{t.navn}</h3>
      {t.hypotese && <p className="mk-small mk-dim">{t.hypotese}</p>}
      <div className="mk-verdict" data-v={dataV} role="status">
        <span className="mk-verdict-title">{koerer ? "Status" : `Vinder: ${t.vinder ? navnAf(rows, t.vinder) : "ingen"}`}
          <Info label="Hvordan afgøres testen?">{`Ingen dom, før hver annonce har brugt ${kr(MIN_FORBRUG_FOER_DOM)}. Den med lavest pris pr. henvendelse fører. "Sikker" kræver mindst 6 henvendelser i alt og en forskel, der næppe er held. Pause ved ${kr(STOP_UDEN_LEAD)} uden henvendelser eller ${kr(STOP_EN_LEAD)} med højst én.`}</Info>
        </span>
        <span>{v.tekst}</span>
        {!koerer && t.slutnote && <span className="mk-dim">{t.slutnote}</span>}
      </div>
      <div className="mk-arms">
        {v.arme.map((a) => (
          <div key={a.slug} className="mk-arm">
            <b>{navnAf(rows, a.slug)}{v.fører === a.slug && " · fører"}</b>
            <span>{kr(a.forbrug)} brugt · {a.leads} henvendelser{a.cpl !== null && ` · ${kr(Math.round(a.cpl))} pr. stk`}</span>
            <span className="mk-dim">{a.kvalificerede} rigtige emner · {a.kunder} kunder{a.ctr !== null && ` · ${(a.ctr * 100).toFixed(1).replace(".", ",")} % klik`}</span>
            {a.stop && koerer && <span className="mk-err"><strong>Sæt på pause i Meta:</strong> {a.stop}</span>}
          </div>
        ))}
      </div>
      {koerer && <Resultatform t={t} rows={rows} set={set} />}
      {t.resultater.length > 0 && (
        <details className="mk-details">
          <summary>Indtastede tal ({t.resultater.length})</summary>
          <ul className="mk-plan-liste mk-small">
            {t.resultater.map((r) => (
              <li key={r.rid} className="mk-row">
                <span className="mk-grow">{r.fra} til {r.til} · {navnAf(rows, r.slug)}: {kr(r.forbrug)}, {r.leads} henv. <span className="mk-dim">({r.by})</span></span>
                {koerer && <button type="button" className="cc-btn mk-btn-sm" disabled={busy} onClick={() => kald({ action: "testFortryd", id: t.id, rid: r.rid })}>Fortryd</button>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {koerer && (
        <details className="mk-details">
          <summary>Afslut testen</summary>
          <div className="mk-form">
            <Field label="Vinder"><select className="cc-input mk-select" value={vinder} onChange={(e) => setVinder(e.target.value)}>
              <option value="">Ingen vinder</option>
              {t.arme.map((a) => <option key={a} value={a}>{navnAf(rows, a)}</option>)}
            </select></Field>
            <Field label="Hvad lærte I"><textarea className="cc-input mk-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <button type="button" className="cc-btn" disabled={busy} onClick={() => { if (window.confirm("Afslut testen? Den kan ikke åbnes igen.")) kald({ action: "testAfslut", id: t.id, vinder: vinder || null, note }); }}>Afslut test</button>
          </div>
        </details>
      )}
      {err && <p className="mk-err" role="alert">{err}</p>}
    </article>
  );
}

export function AnnonceTests({ rows, s, set }: Props) {
  const tests = [...s.tests].sort((a, b) => Number(b.status === "kører") - Number(a.status === "kører") || b.at.localeCompare(a.at));
  return (
    <div className="mk-wrap">
      <NyTest rows={rows} s={s} set={set} />
      {tests.length === 0 ? <p className="mk-p mk-dim">Ingen tests endnu.</p> : tests.map((t) => <TestKort key={t.id} t={t} rows={rows} set={set} />)}
    </div>
  );
}

// ---------------------------------------------------------------- kunde-ja
function KundeRaekke({ kunde, antal, ja, set }: { kunde: string; antal: number; ja: KundeJaMap[string] | undefined; set: Props["set"] }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function gem(v: boolean) {
    setBusy(true); setErr("");
    try { set({ kundeJa: (await ann<{ kundeJa: KundeJaMap }>({ action: "kundeJa", kunde, ja: v, note })).kundeJa }); setNote(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }
  return (
    <li className="mk-item">
      <span className="mk-row"><strong className="mk-grow">{kunde}</strong>
        <span className={`cc-chip ${ja?.ja ? "mk-chip-ok" : "mk-chip-warn"}`}>{ja?.ja ? "Har sagt ja" : "Intet ja"}</span></span>
      <span className="mk-small mk-dim">Ses i {antal} annonce{antal === 1 ? "" : "r"}.{ja && ` Sidst: ${ja.note} (${ja.by}, ${ja.at.slice(0, 10)})`}</span>
      <input className="cc-input mk-input" value={note} maxLength={300} placeholder={ja?.ja ? "Hvorfor trækkes ja tilbage" : "Hvor sagde kunden ja? Fx mail fra Allan 16/10"} onChange={(e) => setNote(e.target.value)} aria-label={`Note om ${kunde}`} />
      {err && <span className="mk-err" role="alert">{err}</span>}
      <span>{ja?.ja
        ? <button type="button" className="cc-btn mk-btn-sm" disabled={busy} onClick={() => gem(false)}>Træk ja tilbage</button>
        : <button type="button" className="cc-btn mk-btn-sm cc-btn-accent" disabled={busy || !note.trim()} onClick={() => gem(true)}>Kunden har sagt ja</button>}</span>
    </li>
  );
}

export function KundeJaListe({ rows, s, set }: Props) {
  const kunder = [...new Set(rows.flatMap((a) => a.kunder))].sort();
  const antal = (k: string) => new Set(rows.filter((a) => a.kunder.includes(k)).map((a) => a.slug)).size;
  return (
    <section className="cc-card mk-card" aria-labelledby="kunde-h">
      <h2 className="mk-h2" id="kunde-h">Kunde-ja
        <Info label="Hvorfor kunde-ja?">Når en kundes side kan ses i en annonce, bruger vi deres navn og arbejde til at sælge. Det kræver et skriftligt ja (mail eller sms er nok). Uden ja kan annoncen ikke godkendes.</Info>
      </h2>
      <p className="mk-p mk-dim">Giv kun ja her, når kunden har skrevet ja. Skriv hvor, så vi kan finde det igen.</p>
      <ul className="mk-list">{kunder.map((k) => <KundeRaekke key={k} kunde={k} antal={antal(k)} ja={s.kundeJa[k]} set={set} />)}</ul>
    </section>
  );
}

// ---------------------------------------------------------------- bestillinger
export function Bestillinger({ rows, s, set }: Props) {
  const grupper = [...new Map(rows.map((a) => [a.gruppe, a.koncept])).entries()];
  const [gruppe, setGruppe] = useState(grupper[0]?.[0] ?? "ny");
  const [skaerme, setSkaerme] = useState(["", "", ""]);
  const [onske, setOnske] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function kald(body: Record<string, unknown>, nulstil = false) {
    setBusy(true); setErr("");
    try {
      set({ bestillinger: (await ann<{ bestillinger: Bestilling[] }>(body)).bestillinger });
      if (nulstil) { setSkaerme(["", "", ""]); setOnske(""); }
    } catch (e) { setErr(e instanceof Error ? e.message : "Kunne ikke gemme."); } finally { setBusy(false); }
  }
  const koncept = (g: string) => (g === "ny" ? "Nyt koncept" : grupper.find(([k]) => k === g)?.[1] ?? g);
  const liste = [...s.bestillinger].sort((a, b) => Number(b.status === "ny") - Number(a.status === "ny") || b.at.localeCompare(a.at));
  return (
    <div className="mk-wrap">
      <section className="cc-card mk-card" aria-labelledby="bestil-h">
        <h2 className="mk-h2" id="bestil-h">Bestil en ny variant
          <Info label="Hvem laver den?">Næste gang Claude Code laver annoncer, tager den bestillingerne her: tager et skærmbillede af siden, sætter det ind i konceptet og lægger varianten i studiet. Hermes minder om bestillinger, der venter.</Info>
        </h2>
        <div className="mk-form">
          <Field label="Koncept"><select className="cc-input mk-select" value={gruppe} onChange={(e) => setGruppe(e.target.value)}>
            {grupper.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            <option value="ny">Nyt koncept</option>
          </select></Field>
          {skaerme.map((v, i) => (
            <Field key={i} label={`Side på skærm ${i + 1}`} info={i === 0 ? "Adressen eller navnet på siden, fx kinly.dk/tandlaege. Kundesider kræver kundens ja." : undefined}>
              <input className="cc-input mk-input" value={v} maxLength={200} placeholder={i === 0 ? "kinly.dk/automekaniker-herning" : "valgfri"} onChange={(e) => setSkaerme((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
            </Field>
          ))}
          <Field label="Ønske"><textarea className="cc-input mk-textarea" rows={2} maxLength={600} value={onske} placeholder="Fx samme hånd, men med prissiden og en lysere baggrund" onChange={(e) => setOnske(e.target.value)} /></Field>
          {err && <p className="mk-err" role="alert">{err}</p>}
          <button type="button" className="cc-btn cc-btn-accent" disabled={busy || (!onske.trim() && !skaerme.some((x) => x.trim()))}
            onClick={() => kald({ action: "bestil", gruppe, skaerme: skaerme.filter((x) => x.trim()), onske }, true)}>Bestil variant</button>
        </div>
      </section>
      {liste.length > 0 && (
        <ul className="mk-list">
          {liste.map((b) => (
            <li key={b.id} className="cc-card mk-item">
              <span className="mk-row"><strong className="mk-grow">{koncept(b.gruppe)}</strong>
                <span className={`cc-chip ${b.status === "ny" ? "mk-chip-nu" : b.status === "lavet" ? "mk-chip-ok" : "mk-chip-bad"}`}>{b.status === "ny" ? "Venter" : b.status === "lavet" ? "Lavet" : "Afvist"}</span></span>
              {b.skaerme.length > 0 && <span className="mk-small">{b.skaerme.join(" · ")}</span>}
              {b.onske && <span className="mk-small">{b.onske}</span>}
              <span className="mk-small mk-dim">{b.by}, {b.at.slice(0, 10)}{b.note && ` · ${b.note}`}</span>
              {b.status === "ny" && (
                <span className="mk-row">
                  <button type="button" className="cc-btn mk-btn-sm" disabled={busy} onClick={() => kald({ action: "bestillingStatus", id: b.id, status: "lavet", note: "" })}>Markér lavet</button>
                  <button type="button" className="cc-btn mk-btn-sm" disabled={busy} onClick={() => kald({ action: "bestillingStatus", id: b.id, status: "afvist", note: "" })}>Afvis</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
