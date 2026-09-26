"use client";
import { useCallback, useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";
import { LEDGER_START, activePayments, charlieBalance, charlieDelta, type Expense, type LedgerPayment } from "@/lib/expenses";

const LEDGER_MIN = new Date(Date.parse(LEDGER_START + "T00:00:00Z") + 86_400_000).toISOString().slice(0, 10);
const kr = (n: number) => `${n.toLocaleString("da-DK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} kr`;
const dk = (iso: string) => iso.split("-").reverse().join("/");

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", fontSize: 13,
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit",
};

// Hvem lagde ud, og hvem skal bære den — i hverdagssprog.
const SPLITS = {
  "selskab-lucas": { share: "selskab", payer: "lucas", label: "Fælles — Lucas betalte" },
  "selskab-charlie": { share: "selskab", payer: "charlie", label: "Fælles — Charlie betalte" },
  "charlie-lucas": { share: "charlie", payer: "lucas", label: "Kun Charlies — Lucas betalte" },
  "lucas-charlie": { share: "lucas", payer: "charlie", label: "Kun Lucas' — Charlie betalte" },
} as const;
type SplitKey = keyof typeof SPLITS;

export default function ExpensesClient() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<LedgerPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => new Date().toLocaleDateString("sv-SE")); // lokal dato, ikke UTC
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [split, setSplit] = useState<SplitKey>("selskab-lucas");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    Promise.all([
      fetch("/api/udgifter/expenses").then((r) => r.json()),
      fetch("/api/udgifter/payments").then((r) => r.json()),
    ])
      .then(([e, p]) => { setExpenses(e.expenses ?? []); setPayments(activePayments(p.payments ?? [])); })
      .catch(() => setError("Kunne ikke hente udgifterne"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    window.addEventListener("udgifter:changed", load);
    return () => window.removeEventListener("udgifter:changed", load);
  }, [load]);

  async function add() {
    // "1.234,50" (dansk) eller "12.50" — punktum er kun tusindtal når der også er komma.
    const val = Number(amount.includes(",") ? amount.replace(/\./g, "").replace(",", ".") : amount);
    if (!vendor.trim()) { setError("Skriv hvad det er"); return; }
    if (!Number.isFinite(val) || val <= 0) { setError("Skriv et beløb i kr"); return; }
    setBusy(true);
    setError(null);
    try {
      const { share, payer } = SPLITS[split];
      const res = await fetch("/api/udgifter/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, vendor, amount: val, share, payer, note: note || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "fejl");
      setExpenses((x) => [...x, d.expense]);
      setVendor(""); setAmount(""); setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Slet posten? Charlies saldo regnes om.")) return;
    const res = await fetch(`/api/udgifter/expenses?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setExpenses((x) => x.filter((e) => e.id !== id));
    else setError("Kunne ikke slette");
  }

  const bal = charlieBalance(expenses, payments);
  const owed = Math.round(bal.owed);
  const rows = expenses.filter((e) => e.date > LEDGER_START).sort((a, b) => b.date.localeCompare(a.date));
  const settled = owed <= 0;

  return (
    <section className="cc-card cc-card-pad" style={{ border: "1px solid var(--accent)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <Icon name="Receipt" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700 }}>Hvad Charlie skylder nu</h2>
      </div>

      <div style={{ marginBottom: 14, padding: "12px 14px", borderRadius: 10, background: settled ? "var(--accent-soft)" : "var(--amber-dim)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, color: settled ? "var(--accent-ink)" : "var(--amber)", fontVariantNumeric: "tabular-nums" }}>
          {loading ? "…" : owed < 0 ? `Lucas skylder ${kr(-owed)}` : kr(owed)}
        </div>
        <div className="cc-dim" style={{ fontSize: 12 }}>
          Hans del af kvitteringerne siden {dk(LEDGER_START)}: {kr(bal.expensesShare)} − overført siden: {kr(bal.paid)}.
          Regnet ud fra rigtige træk, ikke skøn.
        </div>
      </div>

      {/* Tilføj */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <input type="date" aria-label="Dato" value={date} min={LEDGER_MIN} onChange={(e) => setDate(e.target.value)} style={{ ...inputStyle, width: 150 }} />
        <input aria-label="Hvad" placeholder="Hvad (fx Vercel)" value={vendor} onChange={(e) => setVendor(e.target.value)} style={{ ...inputStyle, flex: "1 1 130px" }} />
        <input aria-label="Beløb i kr" placeholder="Beløb (kr)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 110 }} />
        <select aria-label="Hvem betalte" value={split} onChange={(e) => setSplit(e.target.value as SplitKey)} style={{ ...inputStyle, flex: "1 1 190px" }}>
          {Object.entries(SPLITS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input aria-label="Note" placeholder="Note (valgfri)" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} style={{ ...inputStyle, flex: "1 1 140px" }} />
        <button type="button" className="cc-btn cc-btn-accent" onClick={add} disabled={busy}>{busy ? "Gemmer…" : "Tilføj udgift"}</button>
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

      {!loading && rows.length === 0 && <p className="cc-dim" style={{ fontSize: 13 }}>Ingen udgifter registreret endnu.</p>}
      {rows.map((e) => {
        const d = charlieDelta(e);
        return (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13, flexWrap: "wrap" }}>
            <span className="cc-dim" style={{ minWidth: 76 }}>{dk(e.date)}</span>
            <span style={{ fontWeight: 600 }}>{e.vendor}</span>
            {e.original && <span className="cc-dim">{e.original}</span>}
            <span className="cc-chip" style={{ fontSize: 11 }}>{SPLITS[`${e.share}-${e.payer}` as SplitKey]?.label ?? `${e.share}/${e.payer}`}</span>
            {e.source === "hermes" && <span className="cc-chip" style={{ fontSize: 11 }}>fra mail</span>}
            {e.note && <span className="cc-dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 280 }}>{e.note}</span>}
            <span style={{ marginLeft: "auto", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(e.amount)}</span>
            <span className="cc-dim" style={{ fontSize: 11.5, minWidth: 90, textAlign: "right" }}>
              {d === 0 ? "påvirker ikke" : `${d > 0 ? "+" : "−"}${kr(Math.abs(d))} Charlie`}
            </span>
            <button type="button" onClick={() => remove(e.id)} aria-label={`Slet ${e.vendor}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2 }}>
              <Icon name="X" style={{ width: 14, height: 14 }} />
            </button>
          </div>
        );
      })}
    </section>
  );
}
