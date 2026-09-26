"use client";
// Fasevælger i profilens header (E2E 26/9). Kunder skifter fase via kundestatus, ikke her.
import { useState } from "react";
import { useRouter } from "next/navigation";

const OPTIONS: { value: string; label: string }[] = [
  { value: "interesseret", label: "Interesseret" },
  { value: "tabt", label: "Tabt" },
  { value: "ikke_egnet", label: "Ikke egnet" },
  { value: "ny", label: "Aktiv igen (ny)" },
];

export default function PhaseSelect({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function change(fase: string) {
    if (!fase) return;
    if ((fase === "tabt" || fase === "ikke_egnet") && !window.confirm("Åbne kolde kladder til virksomheden stoppes. Fortsæt?")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/fase`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fase }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke skifte fase");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke skifte fase");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <select
        className="cc-btn"
        aria-label="Skift fase"
        value=""
        disabled={busy}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">{busy ? "Skifter…" : "Skift fase…"}</option>
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {err && <span role="alert" style={{ color: "var(--danger, #c0392b)", fontSize: 12 }}>{err}</span>}
    </span>
  );
}
