"use client";
// Virksomhedsprofilens "Åbne opgaver" — samme række-komponent som /opgaver
// (bølge 3), scopet til denne ene virksomhed. Ingen faner/ejer-filter her,
// bare tilføj/afkryds/flyt.
import { useState } from "react";
import TaskRow, { type TaskRowItem } from "@/components/opgaver/TaskRow";
import "@/components/opgaver/opgaver.css";

interface InitialTask { id: string; title: string; due: string; owner: string }

async function patchTask(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/opgaver/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

export default function CompanyTasks({ companyId, company, initialTasks, today }: { companyId: string; company: string; initialTasks: InitialTask[]; today: string }) {
  const [tasks, setTasks] = useState<InitialTask[]>(initialTasks);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("lucas");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/opgaver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), due: due || undefined, owner, companyId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke oprette opgaven");
      const { task: t } = await res.json();
      setTasks((prev) => [...prev, { id: t.id, title: t.title, due: t.due, owner: t.owner }]);
      setTitle(""); setDue("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke oprette opgaven");
    } finally {
      setBusy(false);
    }
  }

  function complete(id: string) {
    const prev = tasks;
    setTasks(tasks.filter((t) => t.id !== id));
    patchTask(id, { done: true }).catch((e) => { setTasks(prev); setErr(e instanceof Error ? e.message : "kunne ikke afslutte opgaven"); });
  }

  function reschedule(id: string, newDue: string) {
    const prev = tasks;
    setTasks(tasks.map((t) => (t.id === id ? { ...t, due: newDue } : t)));
    patchTask(id, { due: newDue }).catch((e) => { setTasks(prev); setErr(e instanceof Error ? e.message : "kunne ikke flytte opgaven"); });
  }

  const items: TaskRowItem[] = tasks.map((t) => ({ id: t.id, title: t.title, companyId, company, owner: t.owner, due: t.due }));

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Åbne opgaver</span></div>

      {items.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen åbne opgaver.</p>
      ) : (
        <div className="op-group" style={{ marginBottom: 0 }}>
          {items.map((i) => (
            <TaskRow key={i.id} item={i} today={today} showCompany={false} onComplete={complete} onReschedule={reschedule} />
          ))}
        </div>
      )}

      <div className="op-quickadd-row" style={{ marginTop: 2 }}>
        <input
          className="op-input"
          style={{ flex: 1 }}
          value={title}
          placeholder="Ny opgave…"
          aria-label="Opgavetitel"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <input className="op-input op-input-date" type="date" value={due} aria-label="Forfaldsdato" onChange={(e) => setDue(e.target.value)} />
        <select className="op-input op-input-owner" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Ejer">
          <option value="lucas">Lucas</option>
          <option value="charlie">Charlie</option>
        </select>
        <button type="button" className="cc-btn virk-btn-press" onClick={add} disabled={busy || !title.trim()}>
          {busy ? "Tilføjer…" : "+ Opgave"}
        </button>
      </div>
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
    </div>
  );
}
