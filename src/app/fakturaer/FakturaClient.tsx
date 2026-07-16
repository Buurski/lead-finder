"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import type { Invoice, InvoiceLine, Subscription, InvoiceStatus } from "@/lib/invoices.ts";

type SubWithNext = Subscription & { nextDue: string };

const STATUS_STYLE: Record<InvoiceStatus, { bg: string; fg: string; label: string }> = {
  kladde: { bg: "var(--bg-3)", fg: "var(--text-dim)", label: "kladde" },
  sendt: { bg: "var(--blue-soft, #1e3a5f)", fg: "var(--blue, #7cb7ff)", label: "sendt" },
  betalt: { bg: "var(--accent-soft)", fg: "var(--accent-ink)", label: "betalt" },
  forfalden: { bg: "var(--red-soft, #4a1f1f)", fg: "var(--red, #ff8a8a)", label: "forfalden" },
  rykket: { bg: "var(--red-soft, #4a1f1f)", fg: "var(--red, #ff8a8a)", label: "rykket" },
};

function daysUntil(dateStr: string, today: string): number {
  const ms = new Date(dateStr + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

function daysLabel(days: number): string {
  if (days === 0) return "i dag";
  if (days > 0) return `om ${days} ${days === 1 ? "dag" : "dage"}`;
  return `${Math.abs(days)} ${Math.abs(days) === 1 ? "dag" : "dage"} forfalden`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("da-DK", { day: "numeric", month: "long" });
}

function kr(n: number): string {
  return `${n.toLocaleString("da-DK")} kr`;
}

export default function FakturaClient({
  invoices, subscriptions, clients, today,
}: {
  invoices: Invoice[];
  subscriptions: SubWithNext[];
  clients: { id: string; name: string }[];
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");

  async function generateFromSub(sub: SubWithNext) {
    setBusy(`sub-${sub.clientName}`);
    setError("");
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: sub.clientName,
          recipient: { name: sub.clientName },
          lines: sub.lines,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "kunne ikke oprette kladde");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(null);
    }
  }

  async function setStatus(number: string, status: InvoiceStatus) {
    setBusy(number);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${number}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "kunne ikke opdatere status");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(null);
    }
  }

  async function sendInvoice(inv: Invoice) {
    const to = window.prompt("Send til email:", "");
    if (!to) return;
    if (!window.confirm(`Send faktura ${inv.number} til ${to}? Systemet sender ikke automatisk — dette er den eneste knap der gør det.`)) return;
    setBusy(inv.number);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${inv.number}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "afsendelse fejlede");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      {error && (
        <div className="cc-card cc-card-pad" style={{ borderColor: "var(--red, #ff8a8a)", fontSize: 13, color: "var(--red, #ff8a8a)" }}>{error}</div>
      )}

      {subscriptions.length > 0 && (
        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="Wallet" style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Abonnementer</h2>
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {subscriptions.map((sub) => {
              const total = sub.lines.reduce((sum, l) => sum + l.amount, 0);
              const days = daysUntil(sub.nextDue, today);
              return (
                <div key={sub.clientName} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "6px 0", borderTop: "1px solid var(--border)" }}>
                  <span style={{ fontWeight: 600 }}>{sub.clientName}</span>
                  <span className="cc-dim">{kr(total)}/md</span>
                  <span className="cc-dim">næste: {fmtDate(sub.nextDue)} ({daysLabel(days)})</span>
                  <button
                    className="cc-btn cc-btn-accent"
                    style={{ marginLeft: "auto" }}
                    disabled={busy === `sub-${sub.clientName}`}
                    onClick={() => generateFromSub(sub)}
                  >
                    {busy === `sub-${sub.clientName}` ? "opretter…" : "Generér nu"}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="Receipt" style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Alle fakturaer</h2>
          <button className="cc-btn" style={{ marginLeft: "auto" }} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Luk form" : "+ Ny faktura"}
          </button>
        </div>

        {showForm && (
          <NyFakturaForm
            clients={clients}
            onCreated={() => { setShowForm(false); router.refresh(); }}
          />
        )}

        {invoices.length === 0 ? (
          <p className="cc-dim" style={{ fontSize: 13 }}>Ingen fakturaer endnu.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {invoices.map((inv) => {
              const total = inv.lines.reduce((sum, l) => sum + l.amount, 0);
              const days = daysUntil(inv.dueDate, today);
              const style = STATUS_STYLE[inv.status];
              const isBusy = busy === inv.number;
              return (
                <div key={inv.number} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, padding: "8px 0", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--font-display)", fontWeight: 600 }}>{inv.number}</span>
                  <span>{inv.recipient.name}</span>
                  <span className="cc-dim">{kr(total)}</span>
                  <span className="cc-chip" style={{ background: style.bg, color: style.fg, border: "none" }}>{style.label}</span>
                  {(inv.status === "sendt" || inv.status === "forfalden" || inv.status === "rykket") && (
                    <span className="cc-dim" style={{ fontSize: 12 }}>{daysLabel(days)}</span>
                  )}
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <a href={`/api/invoices/${inv.number}/pdf`} target="_blank" rel="noopener noreferrer" className="cc-link" style={{ fontSize: 12.5 }}>PDF</a>
                    {inv.status !== "betalt" && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => sendInvoice(inv)}>Send</button>
                    )}
                    {inv.status !== "betalt" && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => setStatus(inv.number, "betalt")}>Betalt</button>
                    )}
                    {(inv.status === "sendt" || inv.status === "forfalden") && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => setStatus(inv.number, "rykket")}>Rykket</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function NyFakturaForm({ clients, onCreated }: { clients: { id: string; name: string }[]; onCreated: () => void }) {
  const [mode, setMode] = useState<"client" | "free">(clients.length > 0 ? "client" : "free");
  const [clientName, setClientName] = useState(clients[0]?.name ?? "");
  const [freeText, setFreeText] = useState("");
  const [lines, setLines] = useState<InvoiceLine[]>([{ description: "", amount: 0 }]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function updateLine(i: number, patch: Partial<InvoiceLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function addLine() {
    setLines((prev) => [...prev, { description: "", amount: 0 }]);
  }
  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setErr("");
    const recipientName = (mode === "client" ? clientName : freeText).trim();
    if (!recipientName) { setErr("vælg en kunde eller skriv en modtager"); return; }
    if (lines.length === 0 || lines.some((l) => !l.description.trim() || !(l.amount > 0))) {
      setErr("hver linje skal have beskrivelse og beløb > 0");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: mode === "client" ? clientName : recipientName,
          recipient: { name: recipientName },
          lines,
          note: note || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "oprettelse fejlede");
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 10, padding: 12, border: "1px solid var(--border)", borderRadius: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <input type="radio" checked={mode === "client"} onChange={() => setMode("client")} disabled={clients.length === 0} />
          Kunde
        </label>
        {mode === "client" ? (
          <select value={clientName} onChange={(e) => setClientName(e.target.value)} style={selectStyle} disabled={clients.length === 0}>
            {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        ) : null}
        <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <input type="radio" checked={mode === "free"} onChange={() => setMode("free")} />
          Fritekst
        </label>
        {mode === "free" ? (
          <input value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Modtagernavn" style={inputStyle} />
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 6 }}>
            <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Beskrivelse" style={{ ...inputStyle, flex: 1 }} />
            <input type="number" value={l.amount || ""} onChange={(e) => updateLine(i, { amount: Number(e.target.value) })} placeholder="Kr" style={{ ...inputStyle, width: 100 }} />
            {lines.length > 1 && <button className="cc-btn" onClick={() => removeLine(i)}>✕</button>}
          </div>
        ))}
        <button className="cc-btn" style={{ width: "fit-content" }} onClick={addLine}>+ Linje</button>
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfri)" style={inputStyle} />

      {err && <span style={{ fontSize: 12.5, color: "var(--red, #ff8a8a)" }}>{err}</span>}

      <button className="cc-btn cc-btn-accent" style={{ width: "fit-content" }} disabled={saving} onClick={submit}>
        {saving ? "opretter…" : "Opret kladde"}
      </button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 9px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 13,
};
const selectStyle: React.CSSProperties = { ...inputStyle };
