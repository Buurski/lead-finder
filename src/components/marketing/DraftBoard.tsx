"use client";
// Kladder: tre spor (faceless/AI = hovedspor, Lucas+Charlie = fase 2, Dag N). Handlinger:
// godkend / ret / drop / prioritet. Drop er en status (kan hentes tilbage), intet slettes.
// Al validering ligger på serveren (hq/marketing.ts); her vises kun det der mangler, i hverdagssprog.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import MarkdownLite from "@/components/shell/MarkdownLite";
import {
  MUSIC_KINDS, MUSIC_LABEL, MUSIC_LICENSE_OK, PRIORITY_LABEL, STATUS_LABEL, TRACKS, TRACK_LABEL, TRACK_NOTE,
  approvalBlockers, hasPlaceholder, type DraftDto, type MusicKind, type Track,
} from "@/lib/hq/marketing-types";
import DateInput from "./DateInput";
import Field from "./Field";
import { mk, niceDay } from "./api";
import "./marketing.css";

type Filter = "aktive" | "kladde" | "godkendt" | "postet" | "droppet";
const FILTERS: Array<[Filter, string]> = [["aktive", "Aktive"], ["kladde", "Kladder"], ["godkendt", "Godkendt"], ["postet", "Postet"], ["droppet", "Droppet"]];

const rank = (d: DraftDto) => d.priority * 1000 - (d.score ?? 0) * 10;
const sortDrafts = (xs: DraftDto[]) => [...xs].sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title, "da"));

type Patch = Record<string, unknown>;

function EditForm({ d, onSave, onCancel, busy }: { d: DraftDto; onSave: (p: Patch) => void; onCancel: () => void; busy: boolean }) {
  const [f, setF] = useState({
    title: d.title, hook: d.hook, track: d.track as Track, script: d.script, caption: d.caption, note: d.note,
    lengthS: d.lengthS == null ? "" : String(d.lengthS), musicKind: d.musicKind as MusicKind, musicLicense: d.musicLicense,
    musicNote: d.musicNote, customerCase: d.customerCase,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      title: f.title, hook: f.hook, track: f.track, script: f.script, caption: f.caption, note: f.note,
      lengthS: f.lengthS.trim() === "" ? null : Number(f.lengthS), musicKind: f.musicKind,
      musicLicense: f.musicKind === "licenseret" ? f.musicLicense : "", musicNote: f.musicNote, customerCase: f.customerCase,
    });
  }
  return (
    <form className="mk-form" onSubmit={submit}>
      <Field label="Titel"><input className="cc-input mk-input" value={f.title} onChange={(e) => set("title", e.target.value)} required maxLength={300} /></Field>
      <Field label="Hook" info="Hook = de første ord, man ser eller hører. De skal få folk til at blive. Skriv det rigtige tal i stedet for [N].">
        <textarea className="mk-textarea" value={f.hook} onChange={(e) => set("hook", e.target.value)} rows={2} maxLength={600} />
      </Field>
      <div className="mk-grid2">
        <Field label="Spor"><select className="cc-input mk-select" value={f.track} onChange={(e) => set("track", e.target.value as Track)}>{TRACKS.map((t) => <option key={t} value={t}>{TRACK_LABEL[t]}</option>)}</select></Field>
        <Field label="Længde i sekunder" info="Mellem 50 og 90 sekunder er fint. De store opslag fra andre ligger omkring 70.">
          <input className="cc-input mk-input" type="number" inputMode="numeric" min={5} max={300} value={f.lengthS} onChange={(e) => set("lengthS", e.target.value)} />
        </Field>
      </div>
      <Field label="Manus" info="Hvad der står på skærmen og hvornår. Kan skrives som tabel eller almindelig tekst.">
        <textarea className="mk-textarea" value={f.script} onChange={(e) => set("script", e.target.value)} rows={8} maxLength={60000} />
      </Field>
      <Field label="Billedtekst"><textarea className="mk-textarea" value={f.caption} onChange={(e) => set("caption", e.target.value)} rows={4} maxLength={4000} /></Field>
      <Field label="Lyd" info="Kinly er en erhvervskonto. Trending lyd bruger vi ikke. Lydløs eller original lyd (din egen stemme) er altid i orden.">
        <select className="cc-input mk-select" value={f.musicKind} onChange={(e) => set("musicKind", e.target.value as MusicKind)}>
          {MUSIC_KINDS.map((m) => <option key={m} value={m}>{MUSIC_LABEL[m]}</option>)}
        </select>
      </Field>
      {f.musicKind === "licenseret" && (
        <>
          <Field label="Licens" info={`Skriv "${MUSIC_LICENSE_OK}", når du har set licensen og den gælder erhverv. "ukendt" kan ikke godkendes.`}>
            <input className="cc-input mk-input" value={f.musicLicense} onChange={(e) => set("musicLicense", e.target.value)} placeholder={MUSIC_LICENSE_OK} />
          </Field>
          <Field label="Hvilket nummer / hvor fra"><input className="cc-input mk-input" value={f.musicNote} onChange={(e) => set("musicNote", e.target.value)} /></Field>
        </>
      )}
      <label className="mk-check"><input type="checkbox" checked={f.customerCase} onChange={(e) => set("customerCase", e.target.checked)} /><span>Det er en kundecase (kunden skal have sagt ja, før den kan godkendes)</span></label>
      <Field label="Egen note"><textarea className="mk-textarea" value={f.note} onChange={(e) => set("note", e.target.value)} rows={2} maxLength={2000} /></Field>
      <div className="mk-actions">
        <button type="submit" className="cc-btn cc-btn-accent mk-btn" disabled={busy || !f.title.trim()}>{busy ? "Gemmer…" : "Gem rettelser"}</button>
        <button type="button" className="cc-btn mk-btn" onClick={onCancel} disabled={busy}>Annullér</button>
      </div>
      {d.status === "godkendt" && <p className="mk-p mk-small">Rettes indholdet, går kladden tilbage til “Kladde”, så den skal godkendes igen.</p>}
    </form>
  );
}

function DraftCard({ d, today, onChange, focus }: { d: DraftDto; today: string; onChange: (d: DraftDto) => void; focus?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const blockers = useMemo(() => approvalBlockers(d), [d]);
  const trueId = useId();
  const dateId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: "center" }); }, [focus]);

  async function run(body: Record<string, unknown>, after?: () => void) {
    setBusy(true);
    setError("");
    try {
      const r = await mk<{ draft: DraftDto }>(body);
      onChange(r.draft);
      after?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }
  const op = (o: string) => run({ action: "draftAction", id: d.id, op: o });
  const update = (p: Patch, after?: () => void) => run({ action: "draftUpdate", id: d.id, draft: p }, after);
  const checks = (c: Patch) => run({ action: "draftChecks", id: d.id, checks: c });

  const live = d.status !== "droppet";
  return (
    <article ref={ref} className="cc-card mk-draft" data-status={d.status} aria-label={d.title}>
      <div className="mk-chips">
        {d.label && <span className={`cc-chip mk-chip-${d.label.toLowerCase()}`}>{d.label}</span>}
        <span className="cc-chip">{STATUS_LABEL[d.status]}</span>
        {d.track === "duo" && <span className="cc-chip mk-chip-warn">Fase 2 · kræver Charlies ja</span>}
        {d.customerCase && <span className={`cc-chip ${d.customerOk ? "mk-chip-ok" : "mk-chip-warn"}`}>{d.customerOk ? "Kunden har sagt ja" : "Kundecase · kundens ja mangler"}</span>}
        {d.lengthS != null && <span className="cc-chip">{d.lengthS} sek.</span>}
        {d.plannedFor && <span className="cc-chip">{niceDay(d.plannedFor)}</span>}
      </div>
      <h3 className="mk-draft-title">{d.title}</h3>
      {d.hook ? <p className="mk-hook">{d.hook}</p> : <p className="mk-p mk-dim">Der er ikke skrevet et hook endnu.</p>}
      {hasPlaceholder(d.hook) && <div className="mk-warn">Hooket har en pladsholder (fx [N]). Skriv det rigtige tal ind, før det kan godkendes.</div>}

      {editing ? (
        <EditForm d={d} busy={busy} onCancel={() => setEditing(false)} onSave={(p) => update(p, () => setEditing(false))} />
      ) : (
        <>
          {live && (d.status === "kladde") && blockers.length > 0 && (
            <div className="mk-warn"><strong>Mangler før godkendelse</strong>{blockers.map((b) => <span key={b}>{b}</span>)}</div>
          )}
          <div className="mk-actions">
            {d.status === "kladde" && <button type="button" className="cc-btn cc-btn-accent" disabled={busy || blockers.length > 0} onClick={() => op("approve")}>Godkend</button>}
            {d.status === "godkendt" && <button type="button" className="cc-btn cc-btn-accent" disabled={busy} onClick={() => op("posted")} title="Tryk når du selv har lagt den ud. HQ poster ikke noget.">Jeg har lagt den ud</button>}
            {live && d.status !== "postet" && <button type="button" className="cc-btn" disabled={busy} onClick={() => setEditing(true)}>Ret</button>}
            {live && d.status !== "postet" && <button type="button" className="cc-btn" disabled={busy} onClick={() => op("drop")}>Drop</button>}
            {d.status === "droppet" && <button type="button" className="cc-btn" disabled={busy} onClick={() => op("restore")}>Hent tilbage</button>}
          </div>
          {error && <p className="mk-err" role="alert">{error}</p>}

          {live && (
            <div className="mk-meta">
              <Field label="Prioritet" info="Høj = tages først. Det du allerede ved virker, står øverst.">
                <select className="cc-input mk-select" value={d.priority} disabled={busy} onChange={(e) => update({ priority: Number(e.target.value) })}>
                  {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                </select>
              </Field>
              <Field label="Dato" forId={dateId} info="Hvornår du vil lægge den ud. Den kommer med i kalenderen.">
                <DateInput id={dateId} value={d.plannedFor} disabled={busy} onCommit={(v) => update({ plannedFor: v })} />
              </Field>
            </div>
          )}

          {live && (
            <details className="mk-details">
              <summary>Tjek og lyd</summary>
              <div className="mk-form" style={{ marginTop: 10 }}>
                {d.track === "duo" && (
                  <label className="mk-check"><input type="checkbox" checked={d.charlieOk} disabled={busy} onChange={(e) => checks({ charlieOk: e.target.checked })} />
                    <span>Charlie har sagt ja, skriftligt, til ansigt, navn og ord</span></label>
                )}
                {d.customerCase && (
                  <label className="mk-check"><input type="checkbox" checked={d.customerOk} disabled={busy} onChange={(e) => checks({ customerOk: e.target.checked })} />
                    <span>Kunden har sagt ja, skriftligt</span></label>
                )}
                <Field label="Sandt i dag?" forId={trueId} info="Alt vi siger om AI, tal og tider skal være sandt den dag, videoen lægges ud. Sæt en dato, når du har tjekket det.">
                  <div className="mk-row">
                    <DateInput id={trueId} className="cc-input mk-input mk-grow" value={d.trueCheckedOn} disabled={busy} onCommit={(v) => checks({ trueCheckedOn: v })} />
                    <button type="button" className="cc-btn" disabled={busy} onClick={() => checks({ trueCheckedOn: today })}>I dag</button>
                  </div>
                </Field>
                <p className="mk-p mk-small">
                  Lyd: {MUSIC_LABEL[d.musicKind]}
                  {d.musicKind === "licenseret" && ` · licens: ${d.musicLicense || "ikke skrevet"}`}
                  {d.musicNote && ` · ${d.musicNote}`}. Ret det under “Ret”.
                </p>
              </div>
            </details>
          )}

          {(d.script || d.shotlist || d.caption || d.risk || d.note) && (
            <details className="mk-details">
              <summary>Manus, billedtekst og noter</summary>
              {d.risk && <div className="mk-warn" style={{ marginTop: 10 }}><strong>Pas på</strong><span>{d.risk}</span></div>}
              {d.note && <p className="mk-p" style={{ marginTop: 10 }}>{d.note}</p>}
              {d.caption && (<><p className="mk-label" style={{ marginTop: 10 }}>Billedtekst (kladde)</p><p className="mk-pre">{d.caption}</p></>)}
              {d.script && (<><p className="mk-label" style={{ marginTop: 10 }}>Manus</p><div className="mk-md"><MarkdownLite source={d.script} /></div></>)}
              {d.shotlist && (<><p className="mk-label" style={{ marginTop: 10 }}>Optagelse (shot list)</p><div className="mk-md"><MarkdownLite source={d.shotlist} /></div></>)}
            </details>
          )}
          {live && d.trueCheckedOn == null && <p className="mk-p mk-small mk-dim">Ikke tjekket for “sandt i dag” endnu.</p>}
          {d.trueCheckedOn && <p className="mk-p mk-small mk-dim">Tjekket som sandt den {niceDay(d.trueCheckedOn)}.</p>}
        </>
      )}
    </article>
  );
}

function NewDraft({ track, onCreated }: { track: Track; onCreated: (d: DraftDto) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [t, setT] = useState<Track>(track);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await mk<{ draft: DraftDto }>({ action: "draftCreate", draft: { title, hook, track: t } });
      onCreated(r.draft);
      setTitle("");
      setHook("");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Noget gik galt.");
    } finally {
      setBusy(false);
    }
  }
  if (!open) return <button type="button" className="cc-btn mk-btn" onClick={() => { setT(track); setOpen(true); }}>+ Ny kladde</button>;
  return (
    <form className="cc-card mk-card mk-form" onSubmit={submit}>
      <h2 className="mk-h2">Ny kladde</h2>
      <Field label="Titel"><input className="cc-input mk-input" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={300} /></Field>
      <Field label="Hook" info="De første ord, folk ser eller hører. Kan skrives senere.">
        <textarea className="mk-textarea" value={hook} onChange={(e) => setHook(e.target.value)} rows={2} maxLength={600} />
      </Field>
      <Field label="Spor"><select className="cc-input mk-select" value={t} onChange={(e) => setT(e.target.value as Track)}>{TRACKS.map((x) => <option key={x} value={x}>{TRACK_LABEL[x]}</option>)}</select></Field>
      {error && <p className="mk-err" role="alert">{error}</p>}
      <div className="mk-actions">
        <button type="submit" className="cc-btn cc-btn-accent mk-btn" disabled={busy || !title.trim()}>{busy ? "Gemmer…" : "Gem som kladde"}</button>
        <button type="button" className="cc-btn mk-btn" onClick={() => setOpen(false)}>Annullér</button>
      </div>
    </form>
  );
}

export default function DraftBoard({ initial, today, duoNotes = [] }: { initial: DraftDto[]; today: string; duoNotes?: { id: string; title: string; body: string }[] }) {
  const [items, setItems] = useState(initial);
  const [track, setTrack] = useState<Track>("faceless");
  const [filter, setFilter] = useState<Filter>("aktive");
  const [focusId, setFocusId] = useState<string | null>(null);
  const upsert = (d: DraftDto) => setItems((xs) => (xs.some((x) => x.id === d.id) ? xs.map((x) => (x.id === d.id ? d : x)) : [d, ...xs]));
  // Ny eller flyttet kladde: vis det spor og den fane, den står i, og scroll ned til den, så man ser, at det lykkedes.
  const reveal = (d: DraftDto) => { upsert(d); setTrack(d.track); setFilter(d.status === "droppet" ? "droppet" : d.status === "postet" ? "postet" : "aktive"); setFocusId(d.id); };

  const inTrack = items.filter((d) => d.track === track);
  const shown = sortDrafts(inTrack.filter((d) => (filter === "aktive" ? d.status === "kladde" || d.status === "godkendt" : d.status === filter)));
  const count = (t: Track) => items.filter((d) => d.track === t && d.status !== "droppet").length;

  return (
    <div className="mk-wrap">
      <div className="mk-note">
        <strong>Alt her er kladder.</strong>
        <span>HQ poster, sender og køber ikke noget. Du eller Charlie lægger selv videoen ud og trykker bagefter “Jeg har lagt den ud”.</span>
      </div>

      <div className="mk-seg" role="group" aria-label="Spor">
        {TRACKS.map((t) => (
          <button key={t} type="button" className="mk-seg-btn" aria-pressed={track === t} onClick={() => setTrack(t)}>
            {TRACK_LABEL[t]}<span className="mk-seg-count">{count(t)}</span>
          </button>
        ))}
      </div>
      <p className="mk-p">{TRACK_NOTE[track]}{track === "dag-n" && " Kundecases med en skarp hook slår Dag N klart, så prøv dem først."}</p>

      {track === "duo" && duoNotes.map((n) => (
        <details key={n.id} className="cc-card mk-card">
          <summary className="mk-h2" style={{ cursor: "pointer" }}>{n.title}</summary>
          <div style={{ marginTop: 10 }}><MarkdownLite source={n.body} /></div>
        </details>
      ))}

      <div className="mk-seg" role="group" aria-label="Vis">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className="mk-seg-btn" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <NewDraft track={track} onCreated={reveal} />

      {shown.length === 0 ? (
        <div className="cc-card mk-card"><p className="mk-p">Ingen kladder her. {inTrack.length > 0 ? "Prøv et andet filter ovenfor." : "Tryk “+ Ny kladde” for at lave den første."}</p></div>
      ) : (
        <div className="mk-drafts">{shown.map((d) => <DraftCard key={d.id} d={d} today={today} onChange={(n) => (n.track !== d.track ? reveal(n) : upsert(n))} focus={d.id === focusId} />)}</div>
      )}
    </div>
  );
}
