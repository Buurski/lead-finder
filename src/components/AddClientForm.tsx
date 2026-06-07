"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Quick add-client form for the Klienter page. Appends a row to the Clients tab.
export default function AddClientForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!name.trim()) { setErr("Navn er påkrævet."); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/clients/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch, phone }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "fejl");
      setName(""); setBranch(""); setPhone(""); setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fejl");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="cc-btn cc-btn-accent" style={{ width: "fit-content" }}>
        + Tilføj klient
      </button>
    );
  }

  const inp: React.CSSProperties = { height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)" };
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn *" style={{ ...inp, minWidth: 160, flex: 1 }} />
      <input value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="Branche" style={{ ...inp, minWidth: 120 }} />
      <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" style={{ ...inp, minWidth: 120 }} />
      <button onClick={add} disabled={busy} className="cc-btn cc-btn-accent">{busy ? "Tilføjer…" : "Tilføj"}</button>
      <button onClick={() => { setOpen(false); setErr(""); }} className="cc-btn">Annullér</button>
      {err && <span style={{ fontSize: 12, color: "var(--red, #dc2626)" }}>{err}</span>}
    </div>
  );
}
