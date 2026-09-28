"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OversigtRaekke } from "@/lib/hq/kunde-rapport";

export type RapportRaekkeDTO = OversigtRaekke & { mail: { emne: string; tekst: string } | null };

const STATUS_TEKST: Record<OversigtRaekke["status"], string> = { mangler: "Mangler måling", klar: "Klar til at sende", sendt: "Sendt", sprunget: "Sprunget over" };

const dato = (iso: string) => new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
const tidspunkt = (iso: string) =>
  new Date(iso).toLocaleString("da-DK", { weekday: "long", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });

function Raekke({ r, maaned }: { r: RapportRaekkeDTO; maaned: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fejl, setFejl] = useState("");
  const [kopieret, setKopieret] = useState(false);
  const [bekraeft, setBekraeft] = useState(false);
  const [til, setTil] = useState(r.auto.til);
  const [besked, setBesked] = useState("");
  const [personlig, setPersonlig] = useState(r.personlig);
  const [gemt, setGemt] = useState(r.personlig);
  const url = `/kunder/rapporter/${encodeURIComponent(r.domaene)}/${maaned}`;

  async function saet(status: "sendt" | "sprunget" | "aaben") {
    let grund: string | undefined;
    if (status === "sprunget") {
      grund = window.prompt("Hvorfor springes den over denne måned? (fx: siden er ikke live endnu)")?.trim();
      if (!grund) return;
    }
    setBusy(true);
    setFejl("");
    try {
      const res = await fetch("/api/kunde-rapport/levering", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domaene: r.domaene, maaned, status, grund }),
      });
      const b = (await res.json().catch(() => ({}))) as { levering?: OversigtRaekke["levering"]; error?: string };
      if (!res.ok) throw new Error(b.error || "Kunne ikke gemme");
      router.refresh(); // serveren er sandheden: status, tællere og lås
    } catch (e) {
      setFejl((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send(test: boolean) {
    const adresse = test ? window.prompt("Send en test til hvilken mail? Kunden får intet.")?.trim() : til.trim();
    if (!adresse) return;
    setBusy(true);
    setFejl("");
    setBesked("");
    try {
      const res = await fetch("/api/kunde-rapport/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domaene: r.domaene, maaned, til: adresse, test }),
      });
      const b = (await res.json().catch(() => ({}))) as { til?: string; error?: string };
      if (!res.ok) throw new Error(b.error || "Kunne ikke sende");
      setBekraeft(false);
      setBesked(test ? `Test sendt til ${b.til}. Kunden har ikke fået noget.` : `Sendt til ${b.til}.`);
      if (!test) router.refresh();
    } catch (e) {
      setFejl((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function gemNote() {
    if (personlig.trim() === gemt.trim()) return;
    setFejl("");
    try {
      const res = await fetch("/api/kunde-rapport/note", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domaene: r.domaene, maaned, tekst: personlig }),
      });
      const b = (await res.json().catch(() => ({}))) as { tekst?: string; error?: string };
      if (!res.ok) throw new Error(b.error || "Kunne ikke gemme hilsenen");
      setGemt(b.tekst ?? "");
      setPersonlig(b.tekst ?? "");
      router.refresh(); // mailteksten herunder skal vise hilsenen
    } catch (e) {
      setFejl((e as Error).message);
    }
  }

  async function kopier() {
    if (!r.mail) return;
    try {
      await navigator.clipboard.writeText(`Emne: ${r.mail.emne}\n\n${r.mail.tekst}`);
      setKopieret(true);
      setTimeout(() => setKopieret(false), 2000);
    } catch {
      setFejl("Kunne ikke kopiere. Marker teksten herunder i stedet.");
    }
  }

  return (
    <li className={`cc-card rap-kort rap-${r.status}`}>
      <div className="rap-top">
        <div>
          <div className="rap-kunde">
            {r.companyId ? (
              <a className="cc-link" href={`/virksomheder/${r.companyId}`} style={{ color: "inherit" }}>
                {r.kunde}
              </a>
            ) : (
              r.kunde
            )}
          </div>
          <div className="rap-dom cc-mono">{r.domaene || "ingen adresse"}</div>
        </div>
        <span className={`rap-pille rap-pille-${r.status}`}>{STATUS_TEKST[r.status]}</span>
      </div>

      <div className="rap-meta">
        {r.variant ? <span className="cc-chip">{r.variant === "med-adgang" ? "Med Google-tal" : "Uden Google-tal"}</span> : null}
        {r.maalt ? <span>Målt {dato(r.maalt)}</span> : null}
        {r.levering?.status === "sendt" ? (
          <span>
            Sendt {dato(r.levering.at)}
            {r.levering.mail ? ` til ${r.levering.mail.til}` : ""} af {r.levering.af === "auto" ? "HQ (automatisk)" : r.levering.af}
          </span>
        ) : null}
        {r.levering?.status === "sprunget" ? <span>Sprunget over: {r.levering.grund}</span> : null}
        {!r.tilmeldt ? <span className="rap-adv">Ikke tilmeldt</span> : null}
      </div>

      {r.note ? <p className="rap-note">{r.note}</p> : null}
      {r.haster && r.status !== "sendt" ? (
        <p className="rap-note rap-note-haster" role="status">
          Alvorligt fund på siden. Ret det nu, vent ikke på rapporten.
        </p>
      ) : null}
      {r.fund > 0 && r.status === "klar" ? (
        <p className="rap-note rap-note-fund">
          {r.fund === 1 ? "1 fund" : `${r.fund} fund`} på siden. Er det en side vi har bygget, så overvej at rette {r.fund === 1 ? "det" : "dem"} før du sender.
        </p>
      ) : null}

      {(r.status === "klar" || r.status === "sprunget") && r.domaene ? (
        <label className="rap-personlig">
          <span>Personlig hilsen til {r.kunde} (valgfri, kommer med i mail og PDF)</span>
          <textarea
            rows={2}
            maxLength={400}
            value={personlig}
            onChange={(e) => setPersonlig(e.target.value)}
            onBlur={gemNote}
            placeholder="Fx: Tak for snakken i torsdags. Jeg har kigget på jeres åbningstider i Google, de passer nu."
          />
          {personlig.trim() !== gemt.trim() ? <small>Gemmes, når du klikker udenfor feltet.</small> : null}
        </label>
      ) : null}

      {r.status === "klar" ? (
        r.auto.stop ? (
          <p className="rap-note rap-auto rap-auto-stop">Sendes ikke automatisk: {r.auto.stop}</p>
        ) : r.auto.sendesEfter ? (
          <p className="rap-note rap-auto">
            Sendes automatisk til <strong>{r.auto.til}</strong> tidligst {tidspunkt(r.auto.sendesEfter)} (hverdage kl. 8-17). Vil du ikke det, så spring den over.
          </p>
        ) : null
      ) : null}

      {r.status !== "mangler" && r.domaene ? (
        <div className="rap-knapper">
          <a className="cc-btn" href={url} target="_blank" rel="noreferrer">
            Åbn rapport
          </a>
          <a className="cc-btn" href={`${url}?format=pdf`} target="_blank" rel="noreferrer">
            Hent PDF
          </a>
          {r.mail ? (
            <button type="button" className="cc-btn" onClick={kopier}>
              {kopieret ? "Kopieret" : "Kopiér mail"}
            </button>
          ) : null}
          {(r.status === "klar" || r.status === "sprunget") && !bekraeft ? (
            <button type="button" className="cc-btn cc-btn-accent" disabled={busy} onClick={() => setBekraeft(true)}>
              Send nu
            </button>
          ) : null}
        </div>
      ) : null}

      {bekraeft ? (
        <div className="rap-bekraeft">
          <label>
            Til
            <input type="email" value={til} onChange={(e) => setTil(e.target.value)} placeholder="kunde@firma.dk" autoFocus />
          </label>
          <button type="button" className="cc-btn cc-btn-accent" disabled={busy || !til.trim()} onClick={() => send(false)}>
            {busy ? "Sender…" : `Bekræft: send til ${til.trim() || "…"}`}
          </button>
          <button type="button" className="rap-tekstknap" disabled={busy} onClick={() => setBekraeft(false)}>
            Annullér
          </button>
        </div>
      ) : null}

      <div className="rap-sekundaer">
        {r.status !== "mangler" && r.domaene ? (
          <button type="button" className="rap-tekstknap" disabled={busy} onClick={() => send(true)}>
            Send test til…
          </button>
        ) : null}
        {r.status === "klar" ? (
          <button type="button" className="rap-tekstknap" disabled={busy} onClick={() => saet("sendt")}>
            Jeg har sendt den selv
          </button>
        ) : null}
        {r.status === "klar" || r.status === "mangler" ? (
          r.domaene ? (
            <button type="button" className="rap-tekstknap" disabled={busy} onClick={() => saet("sprunget")}>
              Spring over denne måned
            </button>
          ) : null
        ) : r.laast ? null : (
          <button type="button" className="rap-tekstknap" disabled={busy} onClick={() => saet("aaben")}>
            Fortryd
          </button>
        )}
      </div>

      {r.mail && r.status === "klar" ? (
        <details className="rap-mail">
          <summary>Se mailen</summary>
          <p className="rap-mail-emne">Emne: {r.mail.emne}</p>
          <pre>{r.mail.tekst}</pre>
        </details>
      ) : null}

      {besked ? (
        <p className="rap-note" role="status">
          {besked}
        </p>
      ) : null}
      {fejl ? (
        <p className="rap-fejl" role="alert">
          {fejl}
        </p>
      ) : null}
    </li>
  );
}

export default function RapportListe({ maaned, raekker }: { maaned: string; raekker: RapportRaekkeDTO[] }) {
  if (!raekker.length) return null;
  return (
    <ul className="rap-liste">
      {raekker.map((r) => (
        <Raekke key={`${r.domaene}-${r.companyId}`} r={r} maaned={maaned} />
      ))}
    </ul>
  );
}
