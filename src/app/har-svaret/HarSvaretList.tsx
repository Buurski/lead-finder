"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";

export interface HarSvaretRow {
  id: string;
  rowNo: number;
  name: string;
  place: string; // "by · branche"
  phone: string;
  email: string;
  jev: string; // "" = ingen karakter
  owner: string;
  lifecycle: string;
  lastContact: string; // færdigformateret dato, "" = ingen dato
  age: string; // "12 d siden"
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function post(url: string, body: unknown): Promise<void> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

function Actions({ row, me }: { row: HarSvaretRow; me: "lucas" | "charlie" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [later, setLater] = useState(false);
  const [due, setDue] = useState(tomorrowISO);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg("");
    try {
      await fn();
      setMsg(label);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  // Ring: åbner telefonen (tel:-linket) og logger opkaldet på tidslinjen.
  const ring = () => run("Opkald logget", () => post(`/api/virksomheder/${row.id}/activity`, { type: "opkald", summary: `Ringede til ${row.name}` }));
  // Ring senere: udfaldet "ring-op" laver opgaven "Ring til X" på den valgte dato.
  const ringLater = () => run(`Opgave oprettet til ${due}`, async () => {
    await post(`/api/replies/${row.rowNo}/udfald`, { outcome: "ring-op", followUpDue: due, owner: me });
    setLater(false);
  });

  return (
    <div className="hs-actions">
      <div className="hs-btns">
        {row.phone ? (
          <a href={`tel:${row.phone.replace(/\s+/g, "")}`} className="cc-btn" onClick={() => { if (!busy) void ring(); }}>Ring</a>
        ) : (
          <button type="button" className="cc-btn" disabled={busy} onClick={ring}>Log opkald</button>
        )}
        <button type="button" className="cc-btn" disabled={busy} onClick={() => setLater((v) => !v)} aria-expanded={later}>Ring senere</button>
        {row.email && <a href={`mailto:${row.email}`} className="cc-btn">Mail igen</a>}
      </div>
      {later && (
        <div className="hs-later">
          <input type="date" value={due} min={tomorrowISO()} onChange={(e) => setDue(e.target.value)} aria-label="Ring senere den" />
          <button type="button" className="cc-btn" disabled={busy || !due} onClick={ringLater}>Gem</button>
        </div>
      )}
      {msg && <span className="hs-msg" role="status">{msg}</span>}
    </div>
  );
}

export default function HarSvaretList({ rows, me }: { rows: HarSvaretRow[]; me: "lucas" | "charlie" }) {
  return (
    <div className="cc-card hs-card">
      <div className="hs-head" aria-hidden="true">
        <span>Virksomhed</span>
        <span>Telefon</span>
        <span>Sidst kontaktet</span>
        <span>Jev</span>
        <span>Ejer</span>
        <span>Status</span>
        <span />
      </div>
      <ul className="hs-list">
        {rows.map((r) => (
          <li key={r.id} className="hs-row">
            <div className="hs-name">
              <Link href={`/virksomheder/${r.id}`} className="cc-link">{r.name || "(uden navn)"}</Link>
              <span className="hs-sub">{r.place || "–"}</span>
            </div>
            <div className="hs-phone">{r.phone ? <a href={`tel:${r.phone.replace(/\s+/g, "")}`} className="cc-link">{r.phone}</a> : <span className="cc-dim">–</span>}</div>
            <div className="hs-last">{r.lastContact ? <>{r.lastContact}<span className="hs-sub">{r.age}</span></> : <span className="cc-dim">–</span>}</div>
            <div>{r.jev ? <span className="cc-chip" style={{ background: "var(--bg-3)", color: "var(--text-muted)" }}>Jev {r.jev}</span> : <span className="cc-dim">–</span>}</div>
            <div className="hs-owner">{r.owner || <span className="cc-dim">–</span>}</div>
            <div><span className="cc-chip" style={{ ...lifecycleChipStyle(r.lifecycle), whiteSpace: "nowrap" }}>{lifecycleLabel(r.lifecycle)}</span></div>
            <Actions row={r} me={me} />
          </li>
        ))}
      </ul>
    </div>
  );
}
