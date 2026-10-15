"use client";
// Hooks: de 20 færdige danske (pr. spor) og biblioteket af mønstre med Kinly-eksempel.
// "Lav kladde" opretter kun en kladde — den kan ikke godkendes uden at pladsholdere er fyldt ud.
import { useState } from "react";
import Link from "next/link";
import { TRACK_LABEL, TRACKS, hasPlaceholder, type RefDto, type Track } from "@/lib/hq/marketing-types";
import Info from "./Info";
import { mk } from "./api";
import "./marketing.css";

const str = (v: unknown) => (typeof v === "string" ? v : "");

function MakeDraft({ title, hook, track }: { title: string; hook: string; track: Track }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  async function go() {
    setState("busy");
    setError("");
    try {
      await mk({ action: "draftCreate", draft: { title: title.length > 80 ? title.slice(0, 77) + "…" : title, hook, track } });
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
      setState("idle");
    }
  }
  if (state === "done") return <p className="mk-p mk-small">Kladden er lavet. Find den under <Link className="cc-link" style={{ textDecoration: "underline" }} href="/marketing/kladder">Kladder</Link>.</p>;
  return (
    <div className="mk-actions">
      <button type="button" className="cc-btn" onClick={go} disabled={state === "busy"}>{state === "busy" ? "Laver…" : "Lav kladde af den"}</button>
      {error && <span className="mk-err" role="alert">{error}</span>}
    </div>
  );
}

function ReadyHook({ r }: { r: RefDto }) {
  const track = (str(r.data.track) || "faceless") as Track;
  const hook = str(r.data.kinly) || r.title;
  return (
    <article className="cc-card mk-item">
      <div className="mk-chips">
        <span className="cc-chip">{str(r.data.code)}</span>
        <span className="cc-chip">Mønster {str(r.data.pattern)}</span>
        {track === "duo" && <span className="cc-chip mk-chip-warn">Fase 2 · kræver Charlies ja</span>}
        {hasPlaceholder(hook) && <span className="cc-chip mk-chip-warn">Skal have rigtigt tal i</span>}
      </div>
      <p className="mk-hook">{hook}</p>
      {str(r.data.truth) && <p className="mk-p mk-small"><strong>Kun hvis sandt:</strong> {str(r.data.truth)}</p>}
      <MakeDraft title={hook} hook={hook} track={track} />
    </article>
  );
}

function LibraryHook({ r }: { r: RefDto }) {
  const kinly = str(r.data.kinly) || r.body;
  const note = str(r.data.kinlyFull).slice(kinly.length + 2).trim();
  return (
    <article className="cc-card mk-item">
      <h3 className="mk-item-title">{r.title}</h3>
      <p className="mk-p mk-small"><span className="mk-dim">Mønster: </span>{str(r.data.template)}</p>
      <p className="mk-hook">{kinly}</p>
      {note && <p className="mk-p mk-small mk-dim">{note.replace(/^"\s*/, "")}</p>}
      <MakeDraft title={r.title} hook={kinly} track="faceless" />
    </article>
  );
}

export default function HooksView({ refs }: { refs: RefDto[] }) {
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
        {track === "dag-n" && <div className="mk-note"><span>Dag N alene er svagt. Hæng hver dag på ét synligt resultat, og brug kun rigtige tal.</span></div>}
        <div className="mk-list">
          {ready.filter((r) => r.data.track === track).map((r) => <ReadyHook key={r.id} r={r} />)}
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
              {library.filter((r) => str(r.data.family) === fam).map((r) => <LibraryHook key={r.id} r={r} />)}
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
