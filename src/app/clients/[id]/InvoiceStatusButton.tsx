"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// "Markér betalt" på kundeprofilen — bruger samme status-route som /fakturaer,
// og genindlæser siden så saldoen ovenfor er frisk bagefter.
export default function InvoiceStatusButton({ number }: { number: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function markPaid() {
    if (busy) return;
    if (!window.confirm(`Markér faktura ${number} som betalt?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/${number}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "betalt" }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "kunne ikke opdatere status");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ukendt fejl");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button type="button" className="cc-btn" onClick={markPaid} disabled={busy} style={{ fontSize: 11.5 }}>
        {busy ? "Gemmer…" : "Markér betalt"}
      </button>
      {error && (
        <span role="alert" style={{ color: "var(--red, #ff8a8a)", fontSize: 11.5 }}>{error}</span>
      )}
    </span>
  );
}
