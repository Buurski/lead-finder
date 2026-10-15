"use client";
// Kalender: fire uger frem fra denne uges mandag. Kun datoer, intet lægges ud herfra.
import { useState } from "react";
import { weekGrid } from "@/lib/hq/marketing-calc";
import { STATUS_LABEL, TRACK_LABEL, type DraftDto } from "@/lib/hq/marketing-types";
import Info from "./Info";
import { mk, niceDay } from "./api";
import "./marketing.css";

export default function Calendar({ initial, today }: { initial: DraftDto[]; today: string }) {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const weeks = weekGrid(today, 4);

  async function setDate(d: DraftDto, plannedFor: string | null) {
    setBusy(d.id);
    setError("");
    try {
      const r = await mk<{ draft: DraftDto }>({ action: "draftUpdate", id: d.id, draft: { plannedFor } });
      setItems((xs) => xs.map((x) => (x.id === d.id ? r.draft : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Noget gik galt.");
    } finally {
      setBusy(null);
    }
  }

  const live = items.filter((d) => d.status !== "droppet");
  const undated = live.filter((d) => d.status === "godkendt" && !d.plannedFor);
  const outside = live.filter((d) => d.plannedFor && d.plannedFor < weeks[0][0]);

  return (
    <div className="mk-wrap">
      <div className="mk-note">
        <strong>Kalenderen viser kun, hvad I har aftalt.</strong>
        <span>Den lægger ikke noget ud. Anbefalingen fra testplanen: seks opslag til start, derefter to nye om ugen.</span>
      </div>

      {weeks.map((days, wi) => {
        const count = days.reduce((n, day) => n + live.filter((d) => d.plannedFor === day).length, 0);
        return (
          <section key={days[0]} className="mk-cal-week" aria-label={`Uge ${wi + 1}`}>
            <h2 className="mk-cal-weekhead">{wi === 0 ? "Denne uge" : wi === 1 ? "Næste uge" : `Om ${wi} uger`} · fra {niceDay(days[0])}</h2>
            {count === 0 && <p className="mk-p mk-small mk-dim">Intet planlagt.</p>}
            <div className="mk-cal-days">
              {days.map((day) => {
                const here = live.filter((d) => d.plannedFor === day);
                return (
                  <div key={day} className="mk-cal-day" data-today={day === today} data-empty={here.length === 0}>
                    <span className="mk-cal-dayname">{niceDay(day)}</span>
                    {here.map((d) => (
                      <div key={d.id} className="mk-cal-item" data-status={d.status} title={`${TRACK_LABEL[d.track]} · ${STATUS_LABEL[d.status]}`}>
                        {d.title}
                        <div className="mk-dim" style={{ fontSize: 11 }}>{TRACK_LABEL[d.track]} · {STATUS_LABEL[d.status]}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {outside.length > 0 && (
        <div className="mk-warn"><strong>Før denne uge</strong>{outside.map((d) => <span key={d.id}>{niceDay(d.plannedFor!)}: {d.title} ({STATUS_LABEL[d.status]})</span>)}</div>
      )}

      <section className="cc-card mk-card" aria-labelledby="mk-undated">
        <h2 className="mk-h2" id="mk-undated">Godkendt, men uden dato<Info label="Hvad er det her?">Videoer I har sagt ja til, men ikke har sat en dag på endnu. Vælg en dag, så kommer den ind i kalenderen.</Info></h2>
        {undated.length === 0 ? (
          <p className="mk-p">Intet venter. Godkend en kladde under Kladder, så dukker den op her.</p>
        ) : (
          <div className="mk-list">
            {undated.map((d) => (
              <div key={d.id} className="mk-row" style={{ justifyContent: "space-between" }}>
                <span className="mk-grow" style={{ fontSize: 14 }}>{d.title}</span>
                <input className="cc-input" type="date" aria-label={`Dato for ${d.title}`} disabled={busy === d.id} min={today} onChange={(e) => e.target.value && setDate(d, e.target.value)} />
              </div>
            ))}
          </div>
        )}
        {error && <p className="mk-err" role="alert">{error}</p>}
      </section>
    </div>
  );
}
