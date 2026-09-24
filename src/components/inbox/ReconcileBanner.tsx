"use client";
import { useState } from "react";
import type { QueueDraft } from "@/components/inbox/types";

// Kladder i "sending": SMTP-svaret gik tabt eller mailen kunne ikke bogføres.
// De sendes aldrig igen af sig selv — Lucas tjekker Gmail Sendt og afstemmer her.
export default function ReconcileBanner({ drafts, onDone }: { drafts: QueueDraft[]; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const stuck = drafts.filter((d) => d.status === "sending");
  if (!stuck.length) return null;

  async function resolve(id: string, result: "sent" | "not-sent") {
    setBusy(id);
    setErr("");
    try {
      const res = await fetch("/api/approve/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action: "reconcile", result }),
      });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error ?? `Fejl ${res.status}`);
      onDone();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cc-card cc-card-pad" role="alert" style={{ display: "grid", gap: 10, borderColor: "var(--amber)", marginBottom: 12 }}>
      <strong>Afstem {stuck.length === 1 ? "1 mail" : `${stuck.length} mails`}: tjek Gmail Sendt</strong>
      <span className="cc-dim" style={{ fontSize: 12.5 }}>Forbindelsen faldt under afsendelsen, så vi ved ikke om mailen gik ud. Den sendes ikke igen før du har svaret.</span>
      {stuck.map((d) => (
        <div key={d.id} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ flex: 1, minWidth: 180 }}>{d.name} · {d.recipientEmail ?? "ukendt modtager"}</span>
          <button className="cc-btn" disabled={busy === d.id} onClick={() => resolve(d.id, "sent")}>Den blev sendt</button>
          <button className="cc-btn" disabled={busy === d.id} onClick={() => resolve(d.id, "not-sent")}>Ikke sendt — send igen</button>
        </div>
      ))}
      {err && <span role="status" style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</span>}
    </div>
  );
}
