"use client";

// "Vurdér 250 leads nu" (2026-09-20): samme on-demand Jev-batch som
// /approve's knap, bare med limit=250 (siden viser lead-attraktivitet, ikke
// kladder). Kører bag samme basic auth som resten af siden (proxy.ts) — ikke
// nat-cronnen, som Lucas ikke selv kan trigge.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

export default function RunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const run = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setMsg("Vurderer…");
    try {
      const res = await fetch("/api/jev-run?limit=250", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setMsg(
        res.ok && d.ok
          ? `${d.leads?.judged ?? 0} leads vurderet (${d.leads?.errors ?? 0} fejl) · ${d.leads?.remaining ?? 0} tilbage.`
          : (d.error ?? "Kunne ikke vurdere.")
      );
      router.refresh();
    } catch {
      setMsg("Netværksfejl.");
    } finally {
      setBusy(false);
    }
  }, [busy, router]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{
          border: "1px solid var(--border)",
          background: busy ? "var(--bg-3)" : "var(--surface)",
          color: "var(--text)",
          cursor: busy ? "default" : "pointer",
          padding: "7px 13px",
          borderRadius: 8,
          fontSize: 12.5,
          fontWeight: 600,
          fontFamily: "inherit",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Vurderer…" : "Vurdér 250 leads nu"}
      </button>
      {msg && <span className="cc-dim" style={{ fontSize: 11.5 }}>{msg}</span>}
    </div>
  );
}
