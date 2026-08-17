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
  const [sendTarget, setSendTarget] = useState<Invoice | null>(null);

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

  async function doSend(inv: Invoice, to: string, dueDate: string, extra: string) {
    setBusy(inv.number);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${inv.number}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, dueDate, extra: extra || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "afsendelse fejlede");
      setSendTarget(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(null);
    }
  }

  async function deleteInvoice(inv: Invoice) {
    if (!window.confirm(`Slet faktura ${inv.number} (${inv.recipient.name})? Kun kladder kan slettes.`)) return;
    setBusy(inv.number);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${inv.number}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "sletning fejlede");
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
            <Icon name="Wallet" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
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
          <Icon name="Receipt" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Alle fakturaer</h2>
          <button className="cc-btn" style={{ marginLeft: "auto" }} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Luk form" : "+ Ny faktura"}
          </button>
        </div>

        {showForm && (
          <NyFakturaForm
            clients={clients}
            onCreated={() => router.refresh()}
          />
        )}

        {invoices.length === 0 ? (
          <p className="cc-dim" style={{ fontSize: 13 }}>Ingen fakturaer endnu.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <div
              style={{
                display: "flex", gap: 14, flexWrap: "wrap", fontSize: 13,
                padding: "6px 0", borderTop: "1px solid var(--border)",
              }}
            >
              {(() => {
                const forfaldne = invoices.filter((i) => i.status === "forfalden" || i.status === "rykket");
                const sendt = invoices.filter((i) => i.status === "sendt");
                const sum = (list: Invoice[]) => list.reduce((s, i) => s + i.lines.reduce((a, l) => a + l.amount, 0), 0);
                return (
                  <>
                    <span><b>{forfaldne.length}</b> forfaldne · <b>{kr(sum(forfaldne))} forfaldne</b></span>
                    <span className="cc-dim">·</span>
                    <span><b>{kr(sum(sendt))} sendt ikke betalt</b></span>
                  </>
                );
              })()}
            </div>
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
                    {inv.status === "kladde" && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => deleteInvoice(inv)}>Slet</button>
                    )}
                    {inv.status !== "betalt" && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => setSendTarget(inv)}>Send</button>
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

      {sendTarget && (
        <SendDialog
          inv={sendTarget}
          today={today}
          busy={busy === sendTarget.number}
          onCancel={() => setSendTarget(null)}
          onSend={(to, dueDate, extra) => doSend(sendTarget, to, dueDate, extra)}
        />
      )}
    </div>
  );
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function SendDialog({
  inv, today, busy, onCancel, onSend,
}: {
  inv: Invoice;
  today: string;
  busy: boolean;
  onCancel: () => void;
  onSend: (to: string, dueDate: string, extra: string) => void;
}) {
  const [to, setTo] = useState("");
  const [dueDate, setDueDate] = useState(() => isoAddDays(today, 14));
  const [extra, setExtra] = useState("");
  const total = inv.lines.reduce((sum, l) => sum + l.amount, 0);

  return (
    <div style={overlayStyle} onClick={busy ? undefined : onCancel}>
      <div
        style={{ background: "var(--surface)", borderRadius: 12, padding: 24, width: "min(520px, 95vw)", maxHeight: "88vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "grid", gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>Send faktura {inv.number}</h3>
          <p className="cc-dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
            {inv.recipient.name} · {kr(total)}. Systemet sender ikke automatisk — dette er den eneste knap der gør det.
          </p>
        </div>

        <label style={labelStyle}>
          Modtager-email
          <input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="kunde@eksempel.dk" style={inputStyle} autoFocus />
        </label>

        <label style={labelStyle}>
          Forfaldsdato
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} style={inputStyle} />
          <span className="cc-dim" style={{ fontWeight: 400, fontSize: 11.5 }}>Standard: 14 dage fra i dag. Ret den hvis du vil.</span>
        </label>

        <label style={labelStyle}>
          Ekstra besked i mailen (valgfri)
          <textarea value={extra} onChange={(e) => setExtra(e.target.value)} rows={3} placeholder="Fx: Tak for et godt møde i sidste uge — sig endelig til hvis der er noget." style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
          <span className="cc-dim" style={{ fontWeight: 400, fontSize: 11.5 }}>Lægges ind i mailen efter beløbslinjen — resten af teksten er som altid.</span>
        </label>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="cc-btn" onClick={onCancel} disabled={busy}>Annullér</button>
          <button className="cc-btn cc-btn-accent" disabled={busy || !to.trim()} onClick={() => onSend(to.trim(), dueDate, extra)}>
            {busy ? "sender…" : "Send faktura"}
          </button>
        </div>
      </div>
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
  const [showPreview, setShowPreview] = useState(false);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);

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
      setCreatedNumber(data.invoice?.number ?? null);
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

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="cc-btn" style={{ width: "fit-content" }} onClick={() => setShowPreview((v) => !v)}>
          {showPreview ? "Skjul preview" : "Se preview"}
        </button>
        <button className="cc-btn cc-btn-accent" style={{ width: "fit-content" }} disabled={saving} onClick={submit}>
          {saving ? "opretter…" : "Opret kladde"}
        </button>
        {createdNumber && (
          <a
            className="cc-btn cc-btn-accent"
            href={`/api/invoices/${createdNumber}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: "none" }}
          >
            Åbn PDF (faktura {createdNumber})
          </a>
        )}
      </div>

      {showPreview && (
        <InvoicePreview
          recipientName={(mode === "client" ? clientName : freeText).trim()}
          lines={lines}
          note={note}
        />
      )}
    </div>
  );
}

// Live forhåndsvisning — spejler invoice-pdf.tsx-layoutet, så man ser præcis
// hvad kunden får, før man opretter kladden. Opdateres live under indtastning.
function InvoicePreview({
  recipientName, lines, note,
}: {
  recipientName: string;
  lines: InvoiceLine[];
  note: string;
}) {
  const total = lines.reduce((s, l) => s + (l.amount || 0), 0);
  const today = new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
  const due = new Date(Date.now() + 14 * 86400000).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" });
  const box: React.CSSProperties = { border: "1px solid var(--border)", borderRadius: 10, background: "var(--surface)", padding: "16px 18px", fontFamily: "Helvetica, Arial, sans-serif", color: "#1a1a1a", fontSize: 12, maxWidth: 480 };
  const muted: React.CSSProperties = { color: "#555", fontSize: 10.5 };
  const hRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11 };
  const hr: React.CSSProperties = { borderTop: "1px solid #ddd", margin: "8px 0" };

  return (
    <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
      <span className="cc-dim" style={{ fontSize: 12 }}>Forhåndsvisning (sådan ser fakturaen ud)</span>
      <div style={box}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 3 }}>FAKTURA {recipientName ? "" : "…"}</div>
        <div style={muted}>Udstedt {today} · Forfalder {due}</div>
        <div style={{ display: "flex", justifyContent: "space-between", margin: "12px 0" }}>
          <div>
            <div style={muted}>FAKTURA TIL</div>
            <div>{recipientName || "—"}</div>
          </div>
        </div>
        <div style={hr} />
        {lines.map((l, i) => (
          <div style={hRow} key={i}>
            <span style={{ flex: 1 }}>{l.description || "—"}</span>
            <span>{l.amount > 0 ? `${l.amount.toLocaleString("da-DK")} kr` : "—"}</span>
          </div>
        ))}
        <div style={hr} />
        <div style={{ display: "flex", justifyContent: "space-between", width: "60%", marginLeft: "auto", fontWeight: 700, fontSize: 12.5, padding: "2px 0" }}>
          <span>Total</span>
          <span>{total.toLocaleString("da-DK")} kr</span>
        </div>
        <div style={{ marginTop: 12, padding: 8, background: "#f5f5f5", borderRadius: 6, fontSize: 10, color: "#555" }}>
          Bankoverførsel · Betales senest {due}
        </div>
        {note.trim() && (
          <div style={{ marginTop: 8, padding: 8, background: "#fafafa", borderRadius: 6, fontSize: 9, color: "#555" }}>
            {note}
          </div>
        )}
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "6px 9px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 13,
};
const selectStyle: React.CSSProperties = { ...inputStyle };
const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000,
  display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
};
const labelStyle: React.CSSProperties = { display: "grid", gap: 5, fontSize: 12.5, fontWeight: 600 };
