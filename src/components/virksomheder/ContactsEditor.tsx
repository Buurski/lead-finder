"use client";
// Kontaktpersoner på en kunde. Bruger den eksisterende CRM-kontakt-API
// (src/app/api/crm/contacts/route.ts, clientName-nøglet — samme mønster som
// resten af src/lib/crm.ts). Redigerings-mønsteret (optimistisk + rollback +
// role="alert") følger DealsSection.tsx.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CrmContact } from "@/lib/crm-client";

async function postContact(body: Record<string, unknown>): Promise<CrmContact> {
  const res = await fetch("/api/crm/contacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "kunne ikke gemme kontakten");
  return data.contact as CrmContact;
}

async function deleteContact(clientName: string, id: string): Promise<void> {
  const res = await fetch(`/api/crm/contacts?clientName=${encodeURIComponent(clientName)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke slette kontakten");
}

function ContactRow({ clientName, contact, onChange, onSaved }: { clientName: string; contact: CrmContact; onChange: (next: CrmContact | null) => void; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contact.name);
  const [role, setRole] = useState(contact.role);
  const [email, setEmail] = useState(contact.email);
  const [phone, setPhone] = useState(contact.phone);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!name.trim()) { setErr("Navn mangler."); return; }
    const prev = contact;
    const next = { ...contact, name: name.trim(), role: role.trim(), email: email.trim(), phone: phone.trim() };
    onChange(next); // optimistisk
    setBusy(true); setErr("");
    try {
      const saved = await postContact({ clientName, id: contact.id, name: next.name, role: next.role, email: next.email, phone: next.phone });
      onChange(saved);
      setEditing(false);
      onSaved();
    } catch (e) {
      onChange(prev); // rollback
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Slet kontakten "${contact.name || "uden navn"}"?`)) return;
    setErr("");
    onChange(null); // optimistisk
    try {
      await deleteContact(clientName, contact.id);
      onSaved();
    } catch (e) {
      onChange(contact); // rollback
      setErr(e instanceof Error ? e.message : "kunne ikke slette");
    }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13 }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn" aria-label="Navn" />
          <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rolle" aria-label="Rolle" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" />
          <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" aria-label="Telefon" />
        </div>
        {err && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn cc-btn-accent virk-btn-press" onClick={save} disabled={busy}>{busy ? "Gemmer…" : "Gem"}</button>
          <button className="cc-btn virk-btn-press" onClick={() => { setEditing(false); setErr(""); setName(contact.name); setRole(contact.role); setEmail(contact.email); setPhone(contact.phone); }} disabled={busy}>Annullér</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 13 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontWeight: 600, flex: 1 }}>{contact.name || "(uden navn)"}{contact.role ? ` · ${contact.role}` : ""}</div>
        <button className="cc-btn virk-btn-press" onClick={() => setEditing(true)}>Ret</button>
        <button className="cc-btn virk-btn-press" onClick={remove}>Slet</button>
      </div>
      <div className="cc-dim" style={{ fontSize: 12 }}>{[contact.email, contact.phone].filter(Boolean).join(" · ") || "–"}</div>
      {err && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
    </div>
  );
}

export default function ContactsEditor({ clientName, initial }: { clientName: string; initial: CrmContact[] }) {
  const router = useRouter();
  const [contacts, setContacts] = useState<CrmContact[]>(initial);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function updateOne(id: string, next: CrmContact | null) {
    setContacts((prev) => (next ? prev.map((c) => (c.id === id ? next : c)) : prev.filter((c) => c.id !== id)));
  }

  async function create() {
    if (!name.trim()) { setErr("Navn mangler."); return; }
    setBusy(true); setErr("");
    try {
      const saved = await postContact({ clientName, name: name.trim(), role: role.trim(), email: email.trim(), phone: phone.trim() });
      setContacts((prev) => [...prev, saved]);
      setName(""); setRole(""); setEmail(""); setPhone(""); setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke oprette kontakten");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title">
        <span>Kontakter</span>
        {!open && <button className="cc-btn virk-btn-press" onClick={() => setOpen(true)}>+ Ny kontakt</button>}
      </div>

      {contacts.length === 0 && !open ? (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen kontakter tilføjet.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {contacts.map((c) => (
            <ContactRow key={c.id} clientName={clientName} contact={c} onChange={(next) => updateOne(c.id, next)} onSaved={() => router.refresh()} />
          ))}
        </div>
      )}

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Navn *" aria-label="Navn" autoFocus />
            <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Rolle" aria-label="Rolle" />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" aria-label="E-mail" />
            <input className="virk-inline-input" style={{ flex: 1, minWidth: 100 }} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefon" aria-label="Telefon" />
          </div>
          {err && <span role="alert" style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cc-btn cc-btn-accent virk-btn-press" onClick={create} disabled={busy}>{busy ? "Opretter…" : "Opret kontakt"}</button>
            <button className="cc-btn virk-btn-press" onClick={() => { setOpen(false); setErr(""); }} disabled={busy}>Annullér</button>
          </div>
        </div>
      )}
    </div>
  );
}
