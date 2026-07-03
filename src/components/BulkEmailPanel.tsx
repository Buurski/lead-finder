"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, RefreshCw, Search, MailCheck } from "lucide-react";

export default function BulkEmailPanel() {
  const router = useRouter();
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [findEmailCount, setFindEmailCount] = useState<number | null>(null);
  const [countsError, setCountsError] = useState(false);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [findingEmails, setFindingEmails] = useState(false);
  const [syncingReplies, setSyncingReplies] = useState(false);
  const [syncingBounces, setSyncingBounces] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => { fetchCounts(); }, []);

  async function fetchCounts() {
    // Best-effort: a failed status fetch must not crash the panel or hide it
    // silently — surface a retry instead.
    try {
      const [b, e] = await Promise.all([
        fetch("/api/email/bulk-send").then((r) => r.json()),
        fetch("/api/email/bulk-find-emails").then((r) => r.json()),
      ]);
      setBulkCount(b.eligible ?? 0);
      setFindEmailCount(e.count ?? 0);
      setCountsError(false);
    } catch {
      setCountsError(true);
    }
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

async function runFindEmails() {
    if (!confirm(`Søg efter mails til ${Math.min(findEmailCount ?? 0, 200)} leads (op til 200 ad gangen)?`)) return;
    setFindingEmails(true);
    setLastResult(null);
    const res = await fetch("/api/email/bulk-find-emails", { method: "POST" });
    const data = await res.json();
    const remaining = data.remaining > 0 ? ` · ${data.remaining} tilbage, tryk igen` : "";
    setLastResult(`Fandt ${data.found} mails ud af ${data.scanned} hjemmesider${remaining}`);
    setFindingEmails(false);
    fetchCounts();
  }

  async function runSyncReplies() {
    setSyncingReplies(true);
    setLastResult(null);
    const res = await fetch("/api/email/sync-replies", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setLastResult(`Sync fejlede: ${data.error}`);
    } else {
      setLastResult(`Sync: ${data.synced} nye svar fundet (af ${data.checked} sendte)`);
      router.refresh();
    }
    setSyncingReplies(false);
  }

  async function runSyncBounces() {
    setSyncingBounces(true);
    setLastResult(null);
    const res = await fetch("/api/email/sync-bounces", { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setLastResult(`Bounce-sync fejlede: ${data.error}`);
    } else {
      setLastResult(`Bounce-sync: ${data.bounced} ugyldige adresser fundet (af ${data.checked} sendte)`);
      router.refresh();
      fetchCounts();
    }
    setSyncingBounces(false);
  }

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>

      {(findEmailCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{findEmailCount}</strong> leads mangler mail
          </span>
          <button
            onClick={runFindEmails}
            disabled={findingEmails}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#0891b2", border: "1px solid #67e8f9", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: findingEmails ? "default" : "pointer", opacity: findingEmails ? 0.6 : 1 }}
          >
            {findingEmails ? <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> : <Search size={11} />}
            {findingEmails ? "Søger..." : "Find mails (200 ad gangen)"}
          </button>
        </div>
      )}

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

      {countsError && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Kunne ikke hente mail-status.</span>
          <button
            onClick={fetchCounts}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            <RefreshCw size={11} />
            Prøv igen
          </button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={runSyncReplies}
          disabled={syncingReplies}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#15803d", border: "1px solid #86efac", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: syncingReplies ? "default" : "pointer", opacity: syncingReplies ? 0.6 : 1 }}
        >
          {syncingReplies ? <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> : <MailCheck size={11} />}
          {syncingReplies ? "Synkroniserer..." : "Sync svar fra Gmail"}
        </button>
        <button
          onClick={runSyncBounces}
          disabled={syncingBounces}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "transparent", color: "#7c3aed", border: "1px solid #c4b5fd", borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: syncingBounces ? "default" : "pointer", opacity: syncingBounces ? 0.6 : 1 }}
        >
          {syncingBounces ? <RefreshCw size={11} style={{ animation: "spin 1s linear infinite" }} /> : <MailCheck size={11} />}
          {syncingBounces ? "Checker..." : "Sync fejlede mails"}
        </button>
      </div>

      {lastResult && (
        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>{lastResult}</span>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
