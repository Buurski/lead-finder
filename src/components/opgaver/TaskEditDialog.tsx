"use client";
import { useState } from "react";
import Link from "next/link";

export interface EditableTask {
  id: string;
  title: string;
  due: string;
  owner: string;
  note: string;
  important: boolean;
  companyId: string | null;
}

export default function TaskEditDialog({ item, onClose, onChanged }: {
  item: EditableTask;
  onClose: () => void;
  onChanged: (change: Omit<EditableTask, "id" | "companyId"> | null) => void;
}) {
  const deal = item.id.startsWith("deal:");
  const [title, setTitle] = useState(item.title);
  const [due, setDue] = useState(item.due);
  const [owner, setOwner] = useState(item.owner);
  const [note, setNote] = useState(item.note);
  const [important, setImportant] = useState(item.important);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const body = deal ? { title, due } : { title, due, owner, note, important };
      const res = await fetch(`/api/opgaver/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Kunne ikke gemme opgaven");
      onChanged({ title: title.trim(), due, owner, note: note.trim(), important });
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke gemme opgaven"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (deal || busy || !window.confirm("Slet opgaven?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/opgaver/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Kunne ikke slette opgaven");
      onChanged(null);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke slette opgaven"); }
    finally { setBusy(false); }
  }

  return (
    <div className="op-dialog-backdrop" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Escape") onClose(); }}>
      <div className="op-dialog cc-card" role="dialog" aria-modal="true" aria-label="Redigér opgave">
        <div className="op-dialog-head"><strong>Redigér {deal ? "næste skridt" : "opgave"}</strong><button type="button" onClick={onClose} aria-label="Luk">×</button></div>
        <label>Titel<input className="op-input" autoFocus maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label>Dato<input className="op-input" type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label>
        {!deal && <>
          <label>Ejer<select className="op-input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="lucas">Lucas</option><option value="charlie">Charlie</option></select></label>
          <label>Note<textarea className="op-input op-dialog-note" maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Fx afventer verificering fra Allan" /></label>
          <label className="op-dialog-check"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Vigtig</label>
        </>}
        {deal && item.companyId && <Link className="cc-link" href={`/virksomheder/${item.companyId}`}>Åbn aftalen på virksomheden</Link>}
        {error && <p role="alert" className="op-quickadd-err">{error}</p>}
        <div className="op-dialog-actions">
          {!deal && <button type="button" className="cc-btn" onClick={remove} disabled={busy}>Slet</button>}
          <button type="button" className="cc-btn" onClick={onClose}>Annullér</button>
          <button type="button" className="cc-btn cc-btn-accent" onClick={save} disabled={busy || !title.trim()}>{busy ? "Gemmer…" : "Gem"}</button>
        </div>
      </div>
    </div>
  );
}
