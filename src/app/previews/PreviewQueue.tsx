"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "ny" | "researcher" | "bygger" | "preview klar" | "godkendt" | "kladde klar" | "afvist" | "sendt/lukket";
interface PreviewRequest {
  id: string;
  company: string;
  contactName?: string;
  branch?: string;
  channel: "formular" | "mail";
  email: string;
  website?: string;
  questionnaire?: string;
  status: Status;
  research?: string;
  previewUrl?: string;
  screenshotUrl?: string;
  mailDraft?: string;
  createdAt: string;
}

const statuses: Status[] = ["ny", "researcher", "bygger", "preview klar", "godkendt", "kladde klar", "afvist", "sendt/lukket"];

export default function PreviewQueue() {
  const [requests, setRequests] = useState<PreviewRequest[]>([]);
  const [filter, setFilter] = useState<"alle" | "klar" | "sendt">("alle");
  const [editing, setEditing] = useState<PreviewRequest | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/previews", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRequests((await res.json()).requests ?? []);
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke hente preview-køen"); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const shown = useMemo(() => requests.filter((item) => {
    if (filter === "klar") return ["preview klar", "godkendt", "kladde klar"].includes(item.status);
    if (filter === "sendt") return ["sendt/lukket", "afvist"].includes(item.status);
    return true;
  }), [filter, requests]);

  async function patch(item: PreviewRequest, body: Partial<PreviewRequest>) {
    const res = await fetch("/api/previews", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, ...body }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await load();
  }

  async function decide(item: PreviewRequest, status: Status) {
    try { await patch(item, { status }); }
    catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke gemme beslutningen"); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div><h1 className="cc-h1">Kinly Preview-kø</h1><p className="cc-dim">Alle demoer, drafts og beslutninger samlet ét sted.</p></div>
        <button className="cc-btn" onClick={() => void load()}>Opdatér</button>
      </div>
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>{requests.length} demoer i alt</strong>
        <span className="cc-dim">·</span>
        <button className={`cc-btn ${filter === "alle" ? "cc-btn-accent" : ""}`} onClick={() => setFilter("alle")}>Alle</button>
        <button className={`cc-btn ${filter === "klar" ? "cc-btn-accent" : ""}`} onClick={() => setFilter("klar")}>Klar til dig</button>
        <button className={`cc-btn ${filter === "sendt" ? "cc-btn-accent" : ""}`} onClick={() => setFilter("sendt")}>Lukkede / afviste</button>
      </div>
      {error && <div className="cc-card cc-card-pad" role="alert">Kunne ikke gemme: {error}</div>}
      {shown.length === 0 && !error && <div className="cc-card cc-card-pad">Ingen previews i denne visning.</div>}
      {shown.map((item) => (
        <PreviewCard key={item.id} item={item} onEdit={() => setEditing(item)} onDecide={decide} onStatus={(status) => void decide(item, status)} />
      ))}
      {editing && <EditPanel item={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }} />}
    </div>
  );
}

function PreviewCard({ item, onEdit, onDecide, onStatus }: { item: PreviewRequest; onEdit: () => void; onDecide: (item: PreviewRequest, status: Status) => void; onStatus: (status: Status) => void }) {
  const ready = ["preview klar", "godkendt", "kladde klar"].includes(item.status);
  return (
    <article className="cc-card cc-card-pad cc-preview-card" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(220px, 330px)", gap: 22, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>{item.company}</h2>
            <div className="cc-dim" style={{ marginTop: 5 }}>{item.contactName ? `${item.contactName} · ` : ""}{item.channel} · {item.email}{item.branch ? ` · ${item.branch}` : ""}</div>
          </div>
          <span className="cc-pill">{item.status}</span>
        </div>
        <div style={{ display: "grid", gap: 12, marginTop: 18, fontSize: 13 }}>
          <Field label="Hook / research" value={item.research} />
          <Field label="Kundens svar" value={item.questionnaire} />
          {item.website && <Field label="Kundens side" value={item.website} link />}
          <Field label="Mailkladde" value={item.mailDraft ? "Klar — kan redigeres før send" : "—"} />
        </div>
        <div style={{ marginTop: 18, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {item.status === "preview klar" && <button className="cc-btn cc-btn-accent" onClick={() => onDecide(item, "godkendt")}>Accepter</button>}
          {ready && <button className="cc-btn" onClick={onEdit}>Accepter og rediger</button>}
          {item.status !== "afvist" && item.status !== "sendt/lukket" && <button className="cc-btn" onClick={() => onDecide(item, "afvist")}>Afvis</button>}
          <select aria-label={`Status for ${item.company}`} value={item.status} onChange={(e) => onStatus(e.target.value as Status)}>
            {statuses.map((status) => <option key={status}>{status}</option>)}
          </select>
        </div>
      </div>
      <div className="cc-preview-visual" style={{ minHeight: 190, borderRadius: 12, overflow: "hidden", background: "var(--bg-2)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", minWidth: 0 }}>
        {item.screenshotUrl && /^https?:\/\//.test(item.screenshotUrl) ? <Screenshot item={item} /> : item.previewUrl ? <a href={item.previewUrl} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", flex: 1, minHeight: 170, textDecoration: "none" }}>Åbn demo ↗</a> : <span className="cc-dim" style={{ margin: "auto" }}>Demo ikke klar endnu</span>}
        {item.previewUrl && <a href={item.previewUrl} target="_blank" rel="noreferrer" style={{ padding: "9px 12px", borderTop: "1px solid var(--border)", fontSize: 13, textDecoration: "none" }}>Åbn hele hjemmesiden ↗</a>}
      </div>
    </article>
  );
}

function Screenshot({ item }: { item: PreviewRequest }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <a href={item.previewUrl || item.screenshotUrl} target="_blank" rel="noreferrer" style={{ display: "grid", placeItems: "center", flex: 1, minHeight: 170, textDecoration: "none" }}>Åbn demo ↗</a>;
  return <a href={item.previewUrl || item.screenshotUrl} target="_blank" rel="noreferrer" style={{ flex: 1 }}><img src={item.screenshotUrl} onError={() => setFailed(true)} alt={`Screenshot af ${item.company}`} style={{ width: "100%", height: "100%", minHeight: 170, objectFit: "cover" }} /></a>;
}

function EditPanel({ item, onClose, onSaved }: { item: PreviewRequest; onClose: () => void; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState(item.mailDraft || "");
  const [research, setResearch] = useState(item.research || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function save(status?: Status) {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/previews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, status: status || item.status, mailDraft: draft, research }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke gemme"); setSaving(false); }
  }
  return <div role="dialog" aria-modal="true" style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.55)", display: "grid", placeItems: "center", padding: 18 }}>
    <section className="cc-card cc-card-pad" style={{ width: "min(900px, 100%)", maxHeight: "92vh", overflow: "auto", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><div className="cc-kicker">Redigér før godkendelse</div><h2 style={{ margin: "5px 0 0" }}>{item.company}</h2></div><button className="cc-btn" onClick={onClose}>Luk</button></div>
      <label><span className="cc-kicker">Research og hook</span><textarea value={research} onChange={(e) => setResearch(e.target.value)} rows={5} style={area} /></label>
      <label><span className="cc-kicker">Mail til {item.email} · fra Lucas</span><textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={14} style={area} /></label>
      {error && <div role="alert">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}><button className="cc-btn" disabled={saving} onClick={() => void save()}>Gem ændringer</button><button className="cc-btn cc-btn-accent" disabled={saving} onClick={() => void save("godkendt")}>Gem og accepter</button></div>
    </section>
  </div>;
}

function Field({ label, value, link }: { label: string; value?: string; link?: boolean }) {
  return <div><div className="cc-kicker">{label}</div>{value && link ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : <div style={{ whiteSpace: "pre-wrap", maxHeight: 100, overflow: "auto" }}>{value || "—"}</div>}</div>;
}

const area: React.CSSProperties = { width: "100%", marginTop: 5, borderRadius: 9, border: "1px solid var(--border)", background: "var(--bg-2)", color: "var(--text)", padding: 11, font: "inherit", resize: "vertical" };
