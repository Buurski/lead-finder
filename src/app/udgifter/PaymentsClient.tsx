"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface Payment {
  id: string;
  date: string;
  amount: number;
  from: "charlie" | "lucas";
  note?: string;
}

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)", borderRadius: 9, padding: "8px 12px", fontSize: 13,
  background: "var(--surface)", color: "var(--text)", fontFamily: "inherit",
};

export default function PaymentsClient({ owedPerMonth, dueDay }: { owedPerMonth: number; dueDay: number | null }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [from, setFrom] = useState<"charlie" | "lucas">("charlie");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/udgifter/payments")
      .then((r) => r.json())
      .then((d) => setPayments(d.payments ?? []))
      .catch(() => setError("Kunne ikke hente overførsler"))
      .finally(() => setLoading(false));
  }, []);

  async function add() {
    const val = Number(amount.replace(",", "."));
    if (!Number.isFinite(val) || val <= 0) { setError("Skriv et beløb"); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/udgifter/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, from, note: note || undefined }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "fejl");
      setPayments((p) => [...p, d.payment]);
      setAmount("");
      setNote("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setPayments((p) => p.filter((x) => x.id !== id));
    await fetch(`/api/udgifter/payments?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  const month = new Date().toISOString().slice(0, 7);
  const charlieThisMonth = payments.filter((p) => p.from === "charlie" && p.date.startsWith(month)).reduce((s, p) => s + p.amount, 0);
  const charlieTotal = payments.filter((p) => p.from === "charlie").reduce((s, p) => s + p.amount, 0);
  const monthPct = owedPerMonth > 0 ? Math.min(100, (charlieThisMonth / owedPerMonth) * 100) : 0;
  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 10 }}>
        <Icon name="ArrowUpRight" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Overførsler</h2>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>Charlie i alt: {kr(charlieTotal)}</span>
      </div>

      {/* Anbefalet overførselsdag: 2 dage før tidligste fælles træk */}
      {dueDay !== null && (() => {
        const payBy = Math.max(1, dueDay - 2);
        const today = new Date().getDate();
        const covered = charlieThisMonth >= owedPerMonth;
        const overdue = !covered && today >= dueDay;
        const bg = covered ? "var(--accent-soft)" : overdue ? "var(--red-dim)" : "var(--amber-dim)";
        const fg = covered ? "var(--accent-ink)" : overdue ? "var(--red)" : "var(--amber)";
        return (
          <div style={{ background: bg, color: fg, borderRadius: 10, padding: "9px 12px", fontSize: 12.5, marginBottom: 12, fontWeight: 500 }}>
            {covered
              ? `✓ Denne måned er dækket — næste overførsel: senest d. ${payBy}. næste måned.`
              : overdue
                ? `Første fælles træk (d. ${dueDay}.) er passeret — Charlie mangler ${kr(owedPerMonth - charlieThisMonth)} for denne måned.`
                : `Charlie overfører ${kr(owedPerMonth)} senest d. ${payBy}. — første fælles træk er d. ${dueDay}. (Vercel + Google).`}
          </div>
        );
      })()}

      {/* Denne måned: Charlie's ½ selskab */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
          <span className="cc-dim">Charlie denne måned</span>
          <span><strong>{kr(charlieThisMonth)}</strong> af {kr(owedPerMonth)} (½ selskab)</span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
          <div style={{ width: `${monthPct}%`, height: "100%", background: monthPct >= 100 ? "var(--accent)" : "var(--amber)", borderRadius: 4, transition: "width .3s" }} />
        </div>
      </div>

      {/* Tilføj */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <select value={from} onChange={(e) => setFrom(e.target.value as "charlie" | "lucas")} aria-label="Hvem overførte" style={{ ...inputStyle, width: 110 }}>
          <option value="charlie">Charlie</option>
          <option value="lucas">Lucas</option>
        </select>
        <input
          style={{ ...inputStyle, width: 110 }}
          placeholder="Beløb (kr)"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <input
          style={{ ...inputStyle, flex: "1 1 140px" }}
          placeholder="Note (valgfri)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <button type="button" className="cc-btn cc-btn-accent" onClick={add} disabled={busy}>
          {busy ? "Gemmer…" : "Registrér"}
        </button>
      </div>
      {error && <p style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>{error}</p>}

      {/* Historik */}
      {loading ? (
        <p className="cc-dim" style={{ fontSize: 13 }}>Henter…</p>
      ) : sorted.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 13 }}>Ingen overførsler registreret endnu. Når Charlie overfører, så log den her.</p>
      ) : (
        <div>
          {sorted.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid var(--border)", fontSize: 13 }}>
              <span style={{ color: p.from === "charlie" ? "var(--amber)" : "var(--blue)" }}>●</span>
              <span style={{ fontWeight: 600, textTransform: "capitalize" }}>{p.from}</span>
              <span className="cc-dim">{p.date}</span>
              {p.note && <span className="cc-dim" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.note}</span>}
              <span style={{ marginLeft: "auto", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{kr(p.amount)}</span>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label="Slet overførsel"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2 }}
              >
                <Icon name="X" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
