"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { Invoice, InvoiceLine, Subscription, InvoiceStatus } from "@/lib/invoices.ts";
import "@/components/okonomi/okonomi.css";

type SubWithNext = Subscription & { nextDue: string };

const STATUS_META: Record<InvoiceStatus, { label: string; bg: string; fg: string }> = {
  kladde: { label: "Kladde", bg: "var(--bg-3)", fg: "var(--text-dim)" },
  sendt: { label: "Sendt", bg: "var(--bg-3)", fg: "var(--text-muted)" },
  forfalden: { label: "Forfalden", bg: "var(--red-dim)", fg: "var(--red)" },
  rykket: { label: "Rykket", bg: "var(--red-dim)", fg: "var(--red)" },
  betalt: { label: "Betalt", bg: "var(--green-dim)", fg: "var(--green)" },
};

function daysUntil(dateStr: string, today: string): number {
  const ms = new Date(dateStr + "T00:00:00Z").getTime() - new Date(today + "T00:00:00Z").getTime();
  return Math.round(ms / 86400000);
}

function dueLabel(days: number): string {
  if (days === 0) return "forfalder i dag";
  if (days > 0) return `forfalder om ${days} ${days === 1 ? "dag" : "dage"}`;
  const over = Math.abs(days);
  return `${over} ${over === 1 ? "dag" : "dage"} over`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00Z").toLocaleDateString("da-DK", { day: "numeric", month: "short" });
}

function kr(n: number): string {
  return `${Math.round(n).toLocaleString("da-DK")} kr`;
}

// Speilvender src/lib/invoices.ts' isOverdue() lokalt — den rigtige funktion
// importerer store.ts/db-klienten, som ikke må havne i client-bundlet.
function isOverdue(inv: Pick<Invoice, "status" | "dueDate">, today: string): boolean {
  return (inv.status === "sendt" || inv.status === "forfalden" || inv.status === "rykket") && inv.dueDate < today;
}

function isoAddDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

type FilterTab = "aabne" | "betalt" | "alle";

export default function FakturaClient({
  invoices, subscriptions, clients, today, initialClientName = "", companyByInvoice = {},
}: {
  invoices: Invoice[];
  subscriptions: SubWithNext[];
  clients: { id: string; name: string }[];
  today: string;
  initialClientName?: string;
  companyByInvoice?: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(Boolean(initialClientName));
  const [error, setError] = useState("");
  const [filterTab, setFilterTab] = useState<FilterTab>("aabne");
  const [dialog, setDialog] = useState<{ inv: Invoice; mode: "send" | "reminder" } | null>(null);

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

  // ---- top-tal: udestående · forfaldent · betalt i år ----
  const totalOf = (list: Invoice[]) => list.reduce((s, i) => s + i.lines.reduce((a, l) => a + l.amount, 0), 0);
  const outstanding = totalOf(invoices.filter((i) => i.status !== "betalt"));
  const overdueTotal = totalOf(invoices.filter((i) => i.status === "forfalden" || i.status === "rykket" || (i.status === "sendt" && i.dueDate < today)));
  const thisYear = today.slice(0, 4);
  const paidThisYear = totalOf(invoices.filter((i) => i.status === "betalt" && i.paidAt?.slice(0, 4) === thisYear));

  const filtered = invoices.filter((i) => (filterTab === "alle" ? true : filterTab === "betalt" ? i.status === "betalt" : i.status !== "betalt"));

  return (
    <div style={{ display: "grid", gap: 16, marginTop: 16 }}>
      {error && (
        <div className="cc-card cc-card-pad" style={{ borderColor: "var(--red)", fontSize: 13, color: "var(--red)" }}>{error}</div>
      )}

      <div className="oko-stats">
        <div className="oko-stats-cell">
          <span className="oko-stats-label">Udestående</span>
          <span className="oko-stats-value oko-num">{kr(outstanding)}</span>
        </div>
        <div className="oko-stats-cell">
          <span className="oko-stats-label">Forfaldent</span>
          <span className="oko-stats-value oko-num" data-tone={overdueTotal > 0 ? "risk" : undefined}>{kr(overdueTotal)}</span>
        </div>
        <div className="oko-stats-cell">
          <span className="oko-stats-label">Betalt i år</span>
          <span className="oko-stats-value oko-num" data-tone="success">{kr(paidThisYear)}</span>
        </div>
      </div>

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
                  <span className="cc-dim oko-num">{kr(total)}/md</span>
                  <span className="cc-dim">næste: {fmtDate(sub.nextDue)} ({dueLabel(days)})</span>
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
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="cc-tabs" role="tablist" aria-label="Filtrér fakturaer">
            {([["aabne", "Åbne"], ["betalt", "Betalt"], ["alle", "Alle"]] as [FilterTab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filterTab === k} className="cc-tab cc-focus" data-active={filterTab === k} onClick={() => setFilterTab(k)}>
                {label}
              </button>
            ))}
          </div>
          <button className="cc-btn" style={{ marginLeft: "auto" }} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Luk form" : "+ Ny faktura"}
          </button>
        </div>

        {showForm && (
          <NyFakturaForm
            clients={clients}
            initialClientName={initialClientName}
            onCreated={() => router.refresh()}
          />
        )}

        {filtered.length === 0 ? (
          <p className="cc-dim" style={{ fontSize: 13 }}>Ingen fakturaer i denne visning.</p>
        ) : (
          <div>
            {filtered.map((inv) => {
              const total = inv.lines.reduce((sum, l) => sum + l.amount, 0);
              const days = daysUntil(inv.dueDate, today);
              const meta = STATUS_META[inv.status];
              const isBusy = busy === inv.number;
              const companyId = companyByInvoice[inv.number];
              const overdueNow = isOverdue(inv, today);
              const showReminder = inv.status === "forfalden" || inv.status === "rykket" || (inv.status === "sendt" && overdueNow);
              const showSend = inv.status === "kladde" || (inv.status === "sendt" && !overdueNow);
              return (
                <div key={inv.number} className="oko-row">
                  <span className="cc-mono" style={{ fontWeight: 600 }}>{inv.number}</span>
                  {companyId ? (
                    <Link href={`/virksomheder/${companyId}`} className="cc-link">{inv.recipient.name}</Link>
                  ) : (
                    <span>{inv.recipient.name}</span>
                  )}
                  <span className="oko-num" style={{ fontWeight: 600 }}>{kr(total)}</span>
                  <span className="oko-pill" style={{ background: meta.bg, color: meta.fg }}>{meta.label}</span>
                  {inv.status !== "betalt" && inv.status !== "kladde" && (
                    <span className="cc-dim" style={{ fontSize: 12 }}>{dueLabel(days)}</span>
                  )}
                  {inv.remindedAt && (
                    <span className="cc-dim" style={{ fontSize: 12 }}>Påmindet {fmtDate(inv.remindedAt.slice(0, 10))}</span>
                  )}
                  <div className="oko-row-actions">
                    <a href={`/api/invoices/${inv.number}/pdf`} target="_blank" rel="noopener noreferrer" className="cc-btn">PDF</a>
                    {inv.status === "kladde" && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => deleteInvoice(inv)}>Slet</button>
                    )}
                    {showSend && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => setDialog({ inv, mode: "send" })}>
                        {inv.status === "kladde" ? "Send" : "Send igen"}
                      </button>
                    )}
                    {showReminder && (
                      <button className="cc-btn" disabled={isBusy} onClick={() => setDialog({ inv, mode: "reminder" })}>Send påmindelse</button>
                    )}
                    {inv.status !== "betalt" && (
                      <button className="cc-btn cc-btn-accent" disabled={isBusy} onClick={() => setStatus(inv.number, "betalt")}>Betalt</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {dialog && (
        <SendDialog
          inv={dialog.inv}
          mode={dialog.mode}
          today={today}
          onClose={() => setDialog(null)}
          onSent={() => { setDialog(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function SendDialog({
  inv, mode, today, onClose, onSent,
}: {
  inv: Invoice;
  mode: "send" | "reminder";
  today: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState("");
  const [toTouched, setToTouched] = useState(false);
  const [dueDate, setDueDate] = useState(() => isoAddDays(today, 14));
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [maybeSent, setMaybeSent] = useState(false);
  const total = inv.lines.reduce((sum, l) => sum + l.amount, 0);

  // Forudfylder modtager-mail fra kontakt/virksomhed/tidligere faktura — brugeren kan altid rette den.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/invoices/${inv.number}/modtager`)
      .then((r) => r.json())
      .then((d: { to?: string }) => { if (!cancelled && !toTouched && d.to) setTo(d.to); })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kun ved åbning, ikke ved hver tastatur-anslag
  }, [inv.number]);

  async function submit(force = false) {
    setBusy(true);
    setError("");
    try {
      const body: Record<string, unknown> = { to: to.trim(), extra: extra.trim() || undefined };
      if (mode === "send") body.dueDate = dueDate;
      if (mode === "reminder") body.reminder = true;
      if (force) body.force = true;
      const res = await fetch(`/api/invoices/${inv.number}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.maybeSent) {
        setMaybeSent(true);
        setError(data.error || "Den blev måske allerede sendt. Tjek Sendt-mappen i Gmail.");
        return;
      }
      if (!res.ok) throw new Error(data.error || (mode === "reminder" ? "påmindelse fejlede" : "afsendelse fejlede"));
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="oko-dialog-backdrop" onClick={busy ? undefined : onClose}>
      <div className="oko-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={mode === "reminder" ? "Send påmindelse" : "Send faktura"}>
        <div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700 }}>
            {mode === "reminder" ? `Send påmindelse — faktura ${inv.number}` : `Send faktura ${inv.number}`}
          </h3>
          <p className="cc-dim" style={{ margin: "4px 0 0", fontSize: 12.5 }}>
            {inv.recipient.name} · {kr(total)}. Systemet sender ikke automatisk — dette er den eneste knap der gør det.
          </p>
        </div>

        <label className="oko-field">
          Modtager-email
          <input
            type="email" className="cc-input" value={to}
            onChange={(e) => { setTo(e.target.value); setToTouched(true); }}
            placeholder="kunde@eksempel.dk" autoFocus
          />
        </label>

        {mode === "send" && (
          <label className="oko-field">
            Forfaldsdato
            <input type="date" className="cc-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            <span className="oko-field-hint">Standard: 14 dage fra i dag. Ret den hvis du vil.</span>
          </label>
        )}

        <label className="oko-field">
          Ekstra besked i mailen (valgfri)
          <textarea
            className="cc-input" value={extra} onChange={(e) => setExtra(e.target.value)} rows={3}
            placeholder="Fx: Tak for et godt møde i sidste uge — sig endelig til hvis der er noget."
            style={{ height: "auto", padding: "10px 14px", resize: "vertical", lineHeight: 1.5 }}
          />
          <span className="oko-field-hint">Lægges ind i mailen efter beløbslinjen — resten af teksten er som altid.</span>
        </label>

        {maybeSent && (
          <div style={{ background: "var(--amber-dim)", color: "var(--amber)", borderRadius: "var(--radius-sm)", padding: "10px 12px", fontSize: 12.5 }}>
            {error}
          </div>
        )}
        {error && !maybeSent && <span style={{ fontSize: 12.5, color: "var(--red)" }}>{error}</span>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button className="cc-btn" onClick={onClose} disabled={busy}>Annullér</button>
          {maybeSent && (
            <button className="cc-btn" disabled={busy || !to.trim()} onClick={() => submit(true)}>
              {busy ? "sender…" : "Send alligevel"}
            </button>
          )}
          <button className="cc-btn cc-btn-accent" disabled={busy || !to.trim() || maybeSent} onClick={() => submit(false)}>
            {busy ? "sender…" : mode === "reminder" ? "Send påmindelse" : "Send faktura"}
          </button>
        </div>
      </div>
    </div>
  );
}

function NyFakturaForm({ clients, initialClientName, onCreated }: { clients: { id: string; name: string }[]; initialClientName?: string; onCreated: () => void }) {
  const selectedInitial = initialClientName && clients.some((client) => client.name === initialClientName) ? initialClientName : clients[0]?.name ?? "";
  const [mode, setMode] = useState<"client" | "free">(clients.length > 0 ? "client" : "free");
  const [clientName, setClientName] = useState(selectedInitial);
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
    <div className="oko-form-card">
      <div style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 13, flexWrap: "wrap" }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <input type="radio" checked={mode === "client"} onChange={() => setMode("client")} disabled={clients.length === 0} />
          Kunde
        </label>
        {mode === "client" ? (
          <select value={clientName} onChange={(e) => setClientName(e.target.value)} className="cc-input" style={{ height: 34 }} disabled={clients.length === 0}>
            {clients.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        ) : null}
        <label style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <input type="radio" checked={mode === "free"} onChange={() => setMode("free")} />
          Fritekst
        </label>
        {mode === "free" ? (
          <input value={freeText} onChange={(e) => setFreeText(e.target.value)} placeholder="Modtagernavn" className="cc-input" style={{ height: 34 }} />
        ) : null}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {lines.map((l, i) => (
          <div key={i} className="oko-line-row">
            <input value={l.description} onChange={(e) => updateLine(i, { description: e.target.value })} placeholder="Beskrivelse" className="cc-input" style={{ height: 34, flex: 1 }} />
            <input type="number" value={l.amount || ""} onChange={(e) => updateLine(i, { amount: Number(e.target.value) })} placeholder="Kr" className="cc-input" style={{ height: 34, width: 100 }} />
            {lines.length > 1 && <button className="cc-btn" aria-label="Fjern linje" onClick={() => removeLine(i)}>✕</button>}
          </div>
        ))}
        <button className="cc-btn" style={{ width: "fit-content" }} onClick={addLine}>+ Linje</button>
      </div>

      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (valgfri)" className="cc-input" style={{ height: 34 }} />

      {err && <span style={{ fontSize: 12.5, color: "var(--red)" }}>{err}</span>}

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
  // Datoer beregnes én gang pr. mount via lazy useState-initializer — new Date()
  // direkte i render er impure for React Compiler (lint-fejl).
  const [{ today, due }] = useState(() => ({
    today: new Date().toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }),
    due: new Date(Date.now() + 14 * 86400000).toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric" }),
  }));
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
