"use client";
// Hooks: de 20 færdige danske (pr. spor) og biblioteket af mønstre med Kinly-eksempel.
// "Lav kladde" opretter kun en kladde — den kan ikke godkendes uden at pladsholdere er fyldt ud.
import { useState } from "react";
import Link from "next/link";
import { EXPLAIN, TRACK_LABEL, TRACKS, fillPlaceholders, findDraftByHook, hasPlaceholder, placeholders, type DraftDto, type RefDto, type Track } from "@/lib/hq/marketing-types";
import Info from "./Info";
import { mk } from "./api";
import "./marketing.css";

const str = (v: unknown) => (typeof v === "string" ? v : "");

type Existing = Pick<DraftDto, "id" | "hook" | "status" | "title">;

/** Link til kladden (åbner Kladder på det rigtige kort). */
function DraftLink({ d }: { d: Existing }) {
  return <Link className="cc-link" style={{ textDecoration: "underline" }} href={`/marketing/kladder?kladde=${d.id}`}>{d.status === "droppet" ? "Se den droppede kladde" : "Se kladden"}</Link>;
}

function MakeDraft({ title, hook, track, drafts, onCreated }: { title: string; hook: string; track: Track; drafts: Existing[]; onCreated: (d: Existing) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "findes">("idle");
  const [error, setError] = useState("");
  const [vals, setVals] = useState<string[]>(() => placeholders(hook).map(() => ""));
  const found = placeholders(hook);
  // Tallet skrives lige på kortet, så kladden ikke starter med en tom [N].
  const text = fillPlaceholders(hook, vals);
  const existing = findDraftByHook(drafts, text);
  async function go() {
    setState("busy");
    setError("");
    try {
      const r = await mk<{ draft: Existing; existing: boolean }>({ action: "draftFromHook", draft: { title: title.length > 80 ? title.slice(0, 77) + "…" : title, hook: text, track } });
      onCreated(r.draft);
      setState(r.existing ? "findes" : "done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
      setState("idle");
    }
  }
  if (state === "done") return <p className="mk-p mk-small">Kladden er lavet. Find den under <Link className="cc-link" style={{ textDecoration: "underline" }} href="/marketing/kladder">Kladder</Link>.</p>;
  if (state === "findes" || existing) {
    const d = existing ?? drafts.find((x) => findDraftByHook([x], text));
    return <p className="mk-p mk-small">Der er allerede en kladde med det hook. {d ? <DraftLink d={d} /> : <Link className="cc-link" style={{ textDecoration: "underline" }} href="/marketing/kladder">Find den under Kladder</Link>}.</p>;
  }
  return (
    <div className="mk-need">
      {found.length > 0 && (
        <div className="mk-warn">
          <strong>Tallet mangler</strong>
          <span className="mk-small">Skriv det rigtige tal, før du laver kladden. Kun et tal, der er målt eller sandt.</span>
          <div className="mk-row">
            {found.map((p, i) => (
              <label key={p + i} className="mk-need-field">
                <span className="mk-small">Erstat {p}</span>
                <input className="cc-input mk-input" value={vals[i] ?? ""} maxLength={24} onChange={(e) => setVals((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
              </label>
            ))}
          </div>
        </div>
      )}
      <div className="mk-actions">
        <button type="button" className="cc-btn" onClick={go} disabled={state === "busy"}>{state === "busy" ? "Laver…" : "Lav kladde af den"}</button>
        {error && <span className="mk-err" role="alert">{error}</span>}
      </div>
    </div>
  );
}

function ReadyHook({ r, drafts, onCreated }: { r: RefDto; drafts: Existing[]; onCreated: (d: Existing) => void }) {
  const track = (str(r.data.track) || "faceless") as Track;
  const hook = str(r.data.kinly) || r.title;
  return (
    <article className="cc-card mk-item">
      <div className="mk-chips">
        <span className="cc-chip">{str(r.data.code)}</span>
        <span className="cc-chip">Mønster {str(r.data.pattern)}</span><Info label="Hvad er et mønster?">{EXPLAIN.moenster}</Info>
        {track === "duo" && <span className="cc-chip mk-chip-warn">Fase 2 · kræver Charlies ja</span>}
        {hasPlaceholder(hook) && <span className="cc-chip mk-chip-warn">Tallet mangler</span>}
      </div>
      <p className="mk-hook">{hook}</p>
      {str(r.data.truth) && <p className="mk-p mk-small"><strong>Kun hvis sandt:</strong> {str(r.data.truth)}</p>}
      <MakeDraft title={hook} hook={hook} track={track} drafts={drafts} onCreated={onCreated} />
    </article>
  );
}

function LibraryHook({ r, drafts, onCreated }: { r: RefDto; drafts: Existing[]; onCreated: (d: Existing) => void }) {
  const kinly = str(r.data.kinly) || r.body;
  const note = str(r.data.kinlyFull).slice(kinly.length + 2).trim();
  return (
    <article className="cc-card mk-item">
      <h3 className="mk-item-title">{r.title}</h3>
      <p className="mk-p mk-small"><span className="mk-dim">Mønster: </span>{str(r.data.template)}</p>
      <p className="mk-hook">{kinly}</p>
      {note && <p className="mk-p mk-small mk-dim">{note.replace(/^"\s*/, "")}</p>}
      <MakeDraft title={r.title} hook={kinly} track="faceless" drafts={drafts} onCreated={onCreated} />
    </article>
  );
}

export default function HooksView({ refs, drafts: initialDrafts = [] }: { refs: RefDto[]; drafts?: Existing[] }) {
  const [drafts, setDrafts] = useState<Existing[]>(initialDrafts);
  const onCreated = (d: Existing) => setDrafts((xs) => (xs.some((x) => x.id === d.id) ? xs : [...xs, d]));
  const ready = refs.filter((r) => r.data.source === "W2");
  const library = refs.filter((r) => r.data.source !== "W2");
  const [track, setTrack] = useState<Track>("faceless");
  const families = [...new Set(library.map((r) => str(r.data.family)))];

  return (
    <div className="mk-wrap">
      <section className="mk-wrap" aria-labelledby="mk-ready">
        <h2 className="mk-h2" id="mk-ready">
          Færdige hooks på dansk
          <Info label="Hvad er et hook?">Et hook er de første ord, man ser eller hører i en video. Hvis de ikke fanger, scroller folk videre. Her er 20 færdige bud, klar til at blive en kladde.</Info>
        </h2>
        <div className="mk-seg" role="group" aria-label="Spor">
          {TRACKS.map((t) => (
            <button key={t} type="button" className="mk-seg-btn" aria-pressed={track === t} onClick={() => setTrack(t)}>
              {TRACK_LABEL[t]}<span className="mk-seg-count">{ready.filter((r) => r.data.track === t).length}</span>
            </button>
          ))}
        </div>
        {track === "duo" && <div className="mk-warn"><strong>Fase 2</strong><span>Hooks med Lucas og Charlie må ikke optages, før Charlie har sagt ja skriftligt til ansigt, formulering og rolle.</span></div>}
        {track === "dag-n" && <div className="mk-note"><span>Dag N alene er svagt. Hæng hver dag på ét synligt resultat, og brug kun rigtige tal. <Info label="Hvad er Dag N?">{EXPLAIN.dagN}</Info></span></div>}
        <div className="mk-list">
          {ready.filter((r) => r.data.track === track).map((r) => <ReadyHook key={r.id} r={r} drafts={drafts} onCreated={onCreated} />)}
          {ready.length === 0 && <p className="mk-p">Ingen færdige hooks endnu.</p>}
        </div>
      </section>

      <section className="mk-wrap" aria-labelledby="mk-lib">
        <h2 className="mk-h2" id="mk-lib">
          Mønstre med Kinly-eksempel
          <Info label="Hvad er et mønster?">Et mønster er en opskrift på en åbning, fx “tal først”. Under hvert mønster står et eksempel til Kinly. Mønstre uden et passende Kinly-eksempel er sorteret fra.</Info>
        </h2>
        {library.length === 0 && <p className="mk-p">Ingen mønstre endnu.</p>}
        {families.map((fam) => (
          <details key={fam} className="cc-card mk-card">
            <summary className="mk-h2" style={{ cursor: "pointer" }}>{fam}<span className="mk-seg-count">{library.filter((r) => str(r.data.family) === fam).length}</span></summary>
            <div className="mk-list" style={{ marginTop: 12 }}>
              {library.filter((r) => str(r.data.family) === fam).map((r) => <LibraryHook key={r.id} r={r} drafts={drafts} onCreated={onCreated} />)}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
