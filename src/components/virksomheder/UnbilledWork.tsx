"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface UnbilledItem { id: string; summary: string; amount: number; at: string; actor: string }

export default function UnbilledWork({ companyId, items }: { companyId: string; items: UnbilledItem[] }) {
  const router = useRouter();
  // Alle er valgt som standard: vi holder styr på FRAVALG, ikke valg — så en
  // ny/genindlæst liste altid starter "alle valgt" uden en effect der
  // synkroniserer state ind i state (react-hooks/set-state-in-effect).
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  function toggle(id: string) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selected = items.filter((i) => !unchecked.has(i.id));
  const sum = selected.reduce((s, i) => s + i.amount, 0);

  async function makeInvoice() {
    if (selected.length === 0) return;
    setBusy(true);
    setErr("");
    setCreated(null);
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/faktura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activityIds: selected.map((i) => i.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke lave fakturaen");
      setCreated(data.invoice.number);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke lave fakturaen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="virk-section-title"><span>Ufaktureret arbejde</span></div>

      {created && (
        <p style={{ fontSize: 13 }}>
          Faktura {created} oprettet som kladde. <Link className="cc-link" href="/fakturaer">Se fakturaer</Link>
        </p>
      )}

      {items.length === 0 ? (
        <p className="cc-dim" style={{ fontSize: 12.5 }}>Intet ufaktureret arbejde. Log arbejde med beløb, så samles det her.</p>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((i) => (
              <li key={i.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={!unchecked.has(i.id)}
                  onChange={() => toggle(i.id)}
                  aria-label={`Medtag på faktura: ${i.summary}`}
                  style={{ marginTop: 3 }}
                />
                <span style={{ flex: 1 }}>{i.summary}</span>
                <span className="cc-mono">{i.amount.toLocaleString("da-DK")} kr</span>
              </li>
            ))}
          </ul>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 10 }}>
            <span className="cc-mono" style={{ fontWeight: 600, fontSize: 13.5 }}>{sum.toLocaleString("da-DK")} kr</span>
            <button className="cc-btn cc-btn-accent virk-btn-press" onClick={makeInvoice} disabled={busy || selected.length === 0}>
              {busy ? "Laver…" : "Lav faktura-kladde"}
            </button>
          </div>
          {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
        </>
      )}
    </div>
  );
}
