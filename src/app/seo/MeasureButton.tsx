"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MeasureButton({ companyId }: { companyId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function measure() {
    setBusy(true); setMessage("");
    try {
      const res = await fetch("/api/seo/snapshot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
      const data = await res.json() as { ok?: boolean; reason?: string; error?: string };
      if (res.ok && data.ok) router.refresh();
      else setMessage(data.reason ?? data.error ?? "Målingen kunne ikke gennemføres");
    } catch { setMessage("Målingen kunne ikke gennemføres"); }
    finally { setBusy(false); }
  }
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
    <button type="button" className="cc-btn" disabled={busy} onClick={measure}>{busy ? "Måler…" : "Mål nu"}</button>
    {message && <span role="status" className="cc-dim" style={{ fontSize: 12 }}>{message}</span>}
  </span>;
}
