"use client";
import { useState, useEffect } from "react";
import { Send, RefreshCw } from "lucide-react";

export default function BulkEmailPanel() {
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [followupCount, setFollowupCount] = useState<number | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => { fetchCounts(); }, []);

  async function fetchCounts() {
    const [b, f] = await Promise.all([
      fetch("/api/email/bulk-send").then((r) => r.json()),
      fetch("/api/email/send-followups").then((r) => r.json()),
    ]);
    setBulkCount(b.count ?? 0);
    setFollowupCount(f.count ?? 0);
  }

  async function runBulkSend() {
    if (!confirm(`Send kold mail til ${bulkCount} leads? Dette kan ikke fortrydes.`)) return;
    setSendingBulk(true);
    setLastResult(null);
    const res = await fetch("/api/email/bulk-send", { method: "POST" });
    const data = await res.json();
    setLastResult(`Sendt: ${data.sent} ✓  Fejlede: ${data.failed}`);
    setSendingBulk(false);
    fetchCounts();
  }

  async function runFollowups() {
    if (!confirm(`Send follow-up til ${followupCount} leads?`)) return;
    setSendingFollowup(true);
    setLastResult(null);
    const res = await fetch("/api/email/send-followups", { method: "POST" });
    const data = await res.json();
    setLastResult(`Follow-ups sendt: ${data.sent} ✓  Fejlede: ${data.failed}`);
    setSendingFollowup(false);
    fetchCounts();
  }

  if (bulkCount === 0 && followupCount === 0) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      {(bulkCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{bulkCount}</strong> leads klar til kold mail (Tier A/B)
          </span>
          <button
            onClick={runBulkSend}
            disabled={sendingBulk}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sendingBulk ? 0.6 : 1 }}
          >
            {sendingBulk ? <RefreshCw size={11} /> : <Send size={11} />}
            {sendingBulk ? "Sender..." : "Send til alle"}
          </button>
        </div>
      )}
      {(followupCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{followupCount}</strong> klar til follow-up
          </span>
          <button
            onClick={runFollowups}
            disabled={sendingFollowup}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#b45309", border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sendingFollowup ? 0.6 : 1 }}
          >
            {sendingFollowup ? <RefreshCw size={11} /> : <Send size={11} />}
            {sendingFollowup ? "Sender..." : "Send follow-ups"}
          </button>
        </div>
      )}
      {lastResult && (
        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>{lastResult}</span>
      )}
    </div>
  );
}
