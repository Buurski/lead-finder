"use client";

import { useState } from "react";
import Icon from "@/components/shell/Icon";
import { CrmStoreError, crmRequest, type ActivityType, type CrmActivity, type CrmContact, type CrmTask } from "@/lib/crm-client";

const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "call", label: "Opkald" },
  { value: "email", label: "Mail" },
  { value: "meeting", label: "Møde" },
  { value: "status", label: "Status" },
];

const EMPTY_CONTACT = { name: "", role: "", email: "", phone: "", channel: "", note: "" };

function formatDate(value: string): string {
  if (!value) return "uden frist";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function activityDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function openLabel(count: number): string {
  return count === 1 ? "1 åben" : `${count} åbne`;
}

export default function CrmSections({
  clientName,
  initialContacts,
  initialActivities,
  initialTasks,
  today,
  dataOk: initialDataOk,
}: {
  clientName: string;
  initialContacts: CrmContact[];
  initialActivities: CrmActivity[];
  initialTasks: CrmTask[];
  today: string;
  dataOk: boolean;
}) {
  const [tab, setTab] = useState<"contacts" | "activity" | "tasks">("contacts");
  const [contacts, setContacts] = useState(initialContacts);
  const [activities, setActivities] = useState(initialActivities);
  const [tasks, setTasks] = useState(initialTasks);
  const [draft, setDraft] = useState(EMPTY_CONTACT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<ActivityType>("note");
  const [activityText, setActivityText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dataOk, setDataOk] = useState(initialDataOk);

  function reportFailure(cause: unknown, fallback: string) {
    if (cause instanceof CrmStoreError) {
      setError(cause.message);
      setDataOk(false);
      return;
    }
    setError(cause instanceof Error ? cause.message : fallback);
  }

  async function saveContact() {
    if (busy || !dataOk) return;
    if (!draft.name.trim()) { setError("Kontaktens navn mangler"); return; }
    await run(async () => {
      const { contact } = await crmRequest<{ contact: CrmContact }>("/api/crm/contacts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, id: editingId ?? undefined, clientName }) });
      setContacts((current) => [contact, ...current.filter((item) => item.id !== contact.id)].sort((a, b) => a.name.localeCompare(b.name, "da")));
      setDraft(EMPTY_CONTACT);
      setEditingId(null);
    });
  }

  async function removeContact(contact: CrmContact) {
    if (busy || !dataOk) return;
    if (!window.confirm(`Fjern ${contact.name} fra ${clientName}?`)) return;
    await run(async () => {
      await crmRequest(`/api/crm/contacts?clientName=${encodeURIComponent(clientName)}&id=${encodeURIComponent(contact.id)}`, { method: "DELETE" });
      setContacts((current) => current.filter((item) => item.id !== contact.id));
    });
  }

  async function addActivity() {
    if (busy || !dataOk) return;
    if (!activityText.trim()) { setError("Aktivitetsteksten mangler"); return; }
    await run(async () => {
      const { activity } = await crmRequest<{ activity: CrmActivity }>("/api/crm/activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientName, type: activityType, text: activityText, actor: "teamet" }) });
      setActivities((current) => [activity, ...current]);
      setActivityText("");
    });
  }

  async function addTask() {
    if (busy || !dataOk) return;
    if (!taskTitle.trim()) { setError("Opgavetitlen mangler"); return; }
    await run(async () => {
      const { task } = await crmRequest<{ task: CrmTask }>("/api/crm/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientName, title: taskTitle, due: taskDue }) });
      setTasks((current) => [task, ...current]);
      setTaskTitle("");
      setTaskDue("");
    });
  }

  async function toggleTask(task: CrmTask) {
    if (busy || !dataOk) return;
    await run(async () => {
      const { task: saved } = await crmRequest<{ task: CrmTask }>("/api/crm/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: task.id, clientName, done: !task.done }) });
      setTasks((current) => current.map((item) => item.id === task.id ? saved : item));
    });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (cause) { reportFailure(cause, "handlingen fejlede"); } finally { setBusy(false); }
  }

  return (
    <section className="cc-card cc-card-pad" style={{ marginTop: 16 }}>
      <style>{`@media(max-width:760px){.crm-contact-form{grid-template-columns:1fr!important}.crm-profile-actions{flex-direction:column!important;align-items:stretch!important}}`}</style>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <Icon name="Users" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, marginRight: "auto" }}>CRM</h2>
        {!dataOk && <span className="cc-chip" style={{ color: "var(--amber)", background: "var(--amber-dim)" }}>data kunne ikke hentes — felterne er låst</span>}
      </div>
      <div role="tablist" aria-label="CRM-sektioner" style={{ display: "flex", gap: 5, borderBottom: "1px solid var(--border)", marginBottom: 14, overflowX: "auto" }}>
        {([["contacts", "Kontakter"], ["activity", "Aktivitet"], ["tasks", "Opgaver"]] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={tab === value} onClick={() => setTab(value)} className="cc-btn" style={{ borderRadius: "8px 8px 0 0", borderBottom: tab === value ? "2px solid var(--kinly-signal)" : "2px solid transparent", background: tab === value ? "var(--bg-3)" : "transparent" }}>{label}{value === "contacts" ? ` (${contacts.length})` : value === "activity" ? ` (${activities.length})` : ` (${openLabel(tasks.filter((task) => !task.done).length)})`}</button>)}
      </div>
      {error && <p role="alert" style={{ color: "var(--red)", fontSize: 12.5, margin: "0 0 10px" }}>{error}</p>}

      {tab === "contacts" && <div role="tabpanel">
        <div className="crm-contact-form" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
          <Field label="Navn" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
          <Field label="Rolle" value={draft.role} onChange={(value) => setDraft({ ...draft, role: value })} />
          <Field label="E-mail" value={draft.email} onChange={(value) => setDraft({ ...draft, email: value })} type="email" />
          <Field label="Telefon" value={draft.phone} onChange={(value) => setDraft({ ...draft, phone: value })} />
          <Field label="Kanal" value={draft.channel} onChange={(value) => setDraft({ ...draft, channel: value })} />
          <Field label="Note" value={draft.note} onChange={(value) => setDraft({ ...draft, note: value })} />
          <div className="crm-profile-actions" style={{ display: "flex", gap: 8, alignItems: "end", gridColumn: "1 / -1" }}>
            <button type="button" className="cc-btn cc-btn-accent" onClick={saveContact} disabled={busy || !dataOk}>{editingId ? "Gem kontakt" : "Tilføj kontakt"}</button>
            {editingId && <button type="button" className="cc-btn" onClick={() => { setEditingId(null); setDraft(EMPTY_CONTACT); }}>Annullér</button>}
          </div>
        </div>
        {contacts.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen kontakt endnu. Gem den person, der faktisk skal kontaktes.</p> : <div>
          {contacts.map((contact) => <div key={contact.id} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ minWidth: 180, flex: "1 1 220px" }}><strong style={{ fontSize: 13.5 }}>{contact.name}</strong><span className="cc-dim" style={{ display: "block", fontSize: 11.5 }}>{contact.role || "rolle ikke sat"}{contact.channel ? ` · ${contact.channel}` : ""}</span></div>
            {contact.email && <a className="cc-link" href={`mailto:${contact.email}`} style={{ fontSize: 12.5 }}>{contact.email}</a>}
            {contact.phone && <a className="cc-link" href={`tel:${contact.phone}`} style={{ fontSize: 12.5 }}>{contact.phone}</a>}
            <div style={{ display: "flex", gap: 5, marginLeft: "auto" }}><button type="button" className="cc-btn" onClick={() => { setEditingId(contact.id); setDraft({ name: contact.name, role: contact.role, email: contact.email, phone: contact.phone, channel: contact.channel, note: contact.note }); }}>Redigér</button><button type="button" className="cc-btn" disabled={busy || !dataOk} onClick={() => removeContact(contact)}>Fjern</button></div>
          </div>)}
        </div>}
      </div>}

      {tab === "activity" && <div role="tabpanel">
        <div style={{ display: "grid", gridTemplateColumns: "130px minmax(0, 1fr) auto", gap: 8, marginBottom: 13 }}>
          <label style={labelStyle}>Type<select aria-label="Aktivitetstype" value={activityType} onChange={(event) => setActivityType(event.target.value as ActivityType)} style={inputStyle}>{ACTIVITY_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label style={labelStyle}>Hvad skete der?<textarea aria-label="Aktivitetstekst" rows={2} value={activityText} onChange={(event) => setActivityText(event.target.value)} style={{ ...inputStyle, resize: "vertical" }} /></label>
          <button type="button" className="cc-btn cc-btn-accent" onClick={addActivity} disabled={busy || !dataOk} style={{ alignSelf: "end" }}>Gem</button>
        </div>
        {activities.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen historik endnu.</p> : activities.map((item) => <div key={item.id} style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "9px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}><span className="cc-chip">{item.type}</span><span style={{ flex: 1 }}>{item.text}</span><span className="cc-dim" style={{ fontSize: 11.5 }}>{activityDate(item.at)}</span></div>)}
      </div>}

      {tab === "tasks" && <div role="tabpanel">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 140px auto", gap: 8, marginBottom: 13 }}>
          <label style={labelStyle}>Opgave<input aria-label="Ny opgave" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} style={inputStyle} /></label>
          <label style={labelStyle}>Frist<input aria-label="Ny opgavefrist" type="date" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} style={inputStyle} /></label>
          <button type="button" className="cc-btn cc-btn-accent" onClick={addTask} disabled={busy || !dataOk} style={{ alignSelf: "end" }}>Tilføj</button>
        </div>
        {tasks.length === 0 ? <p className="cc-dim" style={{ fontSize: 13 }}>Ingen opgaver for kunden.</p> : tasks.map((task) => <div key={task.id} style={{ display: "flex", gap: 9, alignItems: "center", padding: "9px 0", borderTop: "1px solid var(--border)", opacity: task.done ? .55 : 1 }}><input type="checkbox" aria-label={`${task.done ? "Genåbn" : "Færdigmarkér"}: ${task.title}`} checked={task.done} disabled={busy || !dataOk} onChange={() => toggleTask(task)} style={{ width: 17, height: 17 }} /><span style={{ flex: 1, textDecoration: task.done ? "line-through" : "none", fontSize: 13.5 }}>{task.title}</span><span className="cc-dim" style={{ fontSize: 11.5 }}>{task.due ? `frist ${formatDate(task.due)}` : "uden frist"}{!task.done && task.due && task.due < today ? " · forfalden" : ""}</span></div>)}
      </div>}
    </section>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label style={labelStyle}>{label}<input type={type} value={value} onChange={(event) => onChange(event.target.value)} style={inputStyle} /></label>;
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 11.5, color: "var(--text-muted)" };
const inputStyle: React.CSSProperties = { width: "100%", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 9px", background: "var(--surface)", color: "var(--text)", font: "inherit", fontSize: 12.5 };
