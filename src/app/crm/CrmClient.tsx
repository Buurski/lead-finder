"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";
import type { NextAction } from "@/lib/next-action";
import { CrmStoreError, crmRequest, type CrmActivity, type CrmTask } from "@/lib/crm-client";

type ClientRow = { id: string; name: string; branch: string };

const activityLabel: Record<CrmActivity["type"], string> = {
  note: "Note",
  call: "Opkald",
  email: "Mail",
  meeting: "Møde",
  task: "Opgave",
  invoice: "Faktura",
  status: "Status",
};

function formatDate(date: string): string {
  if (!date) return "uden frist";
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function sortTasks(items: CrmTask[]): CrmTask[] {
  return [...items].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99");
  });
}

function openLabel(count: number): string {
  return count === 1 ? "1 åben" : `${count} åbne`;
}

export default function CrmClient({
  clients,
  initialTasks,
  activities: initialActivities,
  nextAction,
  today,
  dataOk: initialDataOk,
  focusTaskId,
}: {
  clients: ClientRow[];
  initialTasks: CrmTask[];
  activities: CrmActivity[];
  nextAction: NextAction;
  today: string;
  dataOk: boolean;
  focusTaskId?: string;
}) {
  const [tasks, setTasks] = useState(() => sortTasks(initialTasks));
  const [activities, setActivities] = useState(initialActivities);
  const [clientName, setClientName] = useState(clients[0]?.name ?? "");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dataOk, setDataOk] = useState(initialDataOk);

  useEffect(() => {
    if (!focusTaskId) return;
    const element = document.getElementById(`crm-task-${focusTaskId}`);
    if (element) element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focusTaskId]);

  const openTasks = tasks.filter((task) => !task.done);
  const attention = clients.filter((client) => openTasks.some((task) => task.clientName === client.name));
  const clientByName = new Map(clients.map((client) => [client.name, client]));

  function reportFailure(cause: unknown, fallback: string) {
    if (cause instanceof CrmStoreError) {
      setError(cause.message);
      setDataOk(false);
      return;
    }
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function addTask() {
    if (busy || !dataOk) return;
    if (!clientName || !title.trim()) {
      setError("Vælg en kunde og skriv en opgave");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { task } = await crmRequest<{ task: CrmTask }>("/api/crm/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, title, due }),
      });
      setTasks((current) => sortTasks([task, ...current.filter((item) => item.id !== task.id)]));
      setTitle("");
      setDue("");
      setActivities((current) => [{ id: `local-${task.id}`, clientName, at: new Date().toISOString(), type: "task", text: `Opgave oprettet: ${task.title}`, actor: "teamet" }, ...current]);
    } catch (cause) {
      reportFailure(cause, "kunne ikke gemme opgaven");
    } finally {
      setBusy(false);
    }
  }

  async function toggleTask(task: CrmTask) {
    if (busy || !dataOk) return;
    setError("");
    setBusy(true);
    const nextDone = !task.done;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, done: nextDone } : item));
    try {
      const { task: saved } = await crmRequest<{ task: CrmTask }>("/api/crm/tasks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: task.id, clientName: task.clientName, done: nextDone }),
      });
      setTasks((current) => sortTasks(current.map((item) => item.id === task.id ? saved : item)));
    } catch (cause) {
      setTasks((current) => current.map((item) => item.id === task.id ? task : item));
      reportFailure(cause, "kunne ikke opdatere opgaven");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-fade crm-hub">
      <style>{`@media(max-width:760px){.crm-hub-grid{grid-template-columns:1fr!important}.crm-task-form{grid-template-columns:1fr!important}.crm-activity-row{align-items:flex-start!important}.crm-activity-row a{max-width:42vw}}`}</style>
      <section className="cc-card cc-card-pad crm-primary" style={{ border: "1px solid var(--border-strong)", background: "var(--surface)" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 360px", minWidth: 0 }}>
            <div className="cc-kicker">Næste handling</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, lineHeight: 1.1, margin: "5px 0 7px" }}>{nextAction.label}</h2>
            <p className="cc-dim" style={{ margin: 0, fontSize: 13.5 }}>{nextAction.reason}</p>
          </div>
          <Link className="cc-btn cc-btn-accent" href={nextAction.href} style={{ textDecoration: "none" }}>{nextAction.label}</Link>
        </div>
      </section>

      {!dataOk && <div className="cc-card cc-card-pad" style={{ borderColor: "var(--amber)", color: "var(--amber)", fontSize: 13 }}>CRM-lageret svarer ikke. Dine indtastninger er ikke gemt, og knapperne er låst indtil forbindelsen er tilbage.</div>}

      <div className="crm-hub-grid" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(300px, .9fr)", gap: 16, alignItems: "start" }}>
        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icon name="ListChecks" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}>Opgaver</h2>
            <span className="cc-chip" style={{ marginLeft: "auto" }}>{openLabel(openTasks.length)}</span>
          </div>
          <div className="crm-task-form" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 125px auto", gap: 8, marginBottom: 14 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-muted)" }}>Kunde
              <select aria-label="Kunde til opgave" value={clientName} onChange={(event) => setClientName(event.target.value)} style={inputStyle}>
                {clients.map((client) => <option key={client.id} value={client.name}>{client.name}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-muted)" }}>Opgave
              <input aria-label="Opgavetitel" value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => event.key === "Enter" && addTask()} placeholder="Fx send prisforslag" style={inputStyle} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-muted)" }}>Frist
              <input aria-label="Opgavefrist" type="date" value={due} onChange={(event) => setDue(event.target.value)} style={inputStyle} />
            </label>
            <button type="button" className="cc-btn cc-btn-accent" onClick={addTask} disabled={busy || !dataOk} style={{ alignSelf: "end" }}>{busy ? "Gemmer" : "Tilføj"}</button>
          </div>
          {error && <p role="alert" style={{ color: "var(--red)", fontSize: 12.5, margin: "0 0 8px" }}>{error}</p>}
          {tasks.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen opgaver endnu. Tilføj den næste konkrete ting her.</p> : (
            <div style={{ display: "grid" }}>
              {tasks.slice(0, 12).map((task) => {
                const overdue = !task.done && task.due && task.due < today;
                const clientId = clientByName.get(task.clientName)?.id;
                const focused = task.id === focusTaskId;
                const inner = (
                  <>
                    <div style={{ fontSize: 13.5, fontWeight: 600, textDecoration: task.done ? "line-through" : "none" }}>{task.title}</div>
                    <div className="cc-dim" style={{ fontSize: 11.5 }}>{task.clientName}{task.due ? ` · frist ${formatDate(task.due)}` : " · uden frist"}</div>
                  </>
                );
                return <div key={task.id} id={`crm-task-${task.id}`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 0", borderTop: "1px solid var(--border)", opacity: task.done ? .55 : 1, ...(focused ? { boxShadow: "inset 3px 0 0 var(--kinly-signal)", background: "var(--bg-3)", borderRadius: 8 } : {}) }}>
                  <input type="checkbox" aria-label={`${task.done ? "Genåbn" : "Færdigmarkér"}: ${task.title}`} checked={task.done} disabled={busy || !dataOk} onChange={() => toggleTask(task)} style={{ width: 17, height: 17, flexShrink: 0 }} />
                  {clientId
                    ? <Link href={`/clients/${clientId}`} style={{ minWidth: 0, flex: 1, textDecoration: "none", color: "inherit" }}>{inner}</Link>
                    : <div style={{ minWidth: 0, flex: 1 }}>{inner}</div>}
                  {overdue && <span className="cc-chip" style={{ color: "var(--red)", background: "var(--red-dim)" }}>forfalden</span>}
                </div>;
              })}
              {tasks.length > 12 && <p className="cc-dim" style={{ fontSize: 12, marginTop: 8 }}>Viser 12 af {tasks.length} opgaver — resten ligger på kundeprofilerne.</p>}
            </div>
          )}
        </section>

        <section className="cc-card cc-card-pad">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Icon name="Briefcase" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}>Kræver handling</h2>
          </div>
          {attention.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen kunder med åbne CRM-opgaver.</p> : <div style={{ display: "grid", gap: 8 }}>
            {attention.map((client) => <Link key={client.id} href={`/clients/${client.id}`} className="cc-hoverrow" style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)", color: "inherit", textDecoration: "none", fontSize: 13.5 }}>
              <span><strong>{client.name}</strong><span className="cc-dim" style={{ display: "block", fontSize: 11.5 }}>{client.branch}</span></span>
              <span className="cc-chip">{openLabel(openTasks.filter((task) => task.clientName === client.name).length)}</span>
            </Link>)}
          </div>}
        </section>
      </div>

      <section className="cc-card cc-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700 }}>Seneste aktivitet</h2>
          <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5 }}>nyeste først</span>
        </div>
        {activities.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen aktivitet endnu. Den første note, opgave eller kundekontakt kommer her.</p> : <div>
          {activities.slice(0, 12).map((item) => {
            const clientId = clientByName.get(item.clientName)?.id;
            return <div key={item.id} className="crm-activity-row" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <span className="cc-chip">{activityLabel[item.type]}</span>
              {clientId
                ? <Link href={`/clients/${clientId}`} style={{ color: "inherit", textDecoration: "none", fontWeight: 600 }}>{item.clientName}</Link>
                : <span style={{ fontWeight: 600 }}>{item.clientName}</span>}
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.text}</span>
              <span className="cc-dim" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{formatActivityDate(item.at)}</span>
            </div>;
          })}
          {activities.length > 12 && <p className="cc-dim" style={{ fontSize: 12, marginTop: 8 }}>Viser 12 af {activities.length} aktiviteter.</p>}
        </div>}
      </section>
    </div>
  );
}

function formatActivityDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

const inputStyle: React.CSSProperties = {
  width: "100%", minWidth: 0, border: "1px solid var(--border)", borderRadius: 8,
  padding: "8px 9px", background: "var(--surface)", color: "var(--text)", font: "inherit", fontSize: 12.5,
};
