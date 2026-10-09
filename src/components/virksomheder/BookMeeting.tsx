"use client";
// "Book møde": dato, klokkeslæt og sted/telefon → opgave med tid + aftale i trinnet Møde.
// Sender ingen invitation; mødet lægges kun i ejerens egen HQ-kalender.
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Næste kalenderdato i København (ikke UTC): sv-SE giver ÅÅÅÅ-MM-DD. */
export function tomorrowISO(): string {
  const dk = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
  const t = new Date(`${dk(new Date())}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return dk(t);
}

export default function BookMeeting({ companyId, owner, className = "cc-btn" }: { companyId: string; owner: "lucas" | "charlie"; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [due, setDue] = useState(tomorrowISO);
  const [time, setTime] = useState("10:00");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function save() {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/moede`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due, dueTime: time, place, owner }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke booke");
      setMsg(`Møde booket ${due} kl. ${time}`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "kunne ikke booke");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="book-meeting" style={{ display: "inline-flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button type="button" className={className} onClick={() => setOpen((v) => !v)} aria-expanded={open}>Book møde</button>
      {open && (
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Dato" />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Klokkeslæt" />
          <input type="text" value={place} maxLength={200} onChange={(e) => setPlace(e.target.value)} placeholder="Sted eller telefon" aria-label="Sted eller telefon" />
          <button type="button" className="cc-btn" disabled={busy || !due || !time} onClick={save}>{busy ? "Booker…" : "Gem"}</button>
        </span>
      )}
      {msg && <span role="status" style={{ fontSize: 12, color: "var(--text-dim)" }}>{msg}</span>}
    </span>
  );
}
