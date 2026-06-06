"use client";
import { useEffect, useState } from "react";

interface QueueSummary {
  total: number;
  pending: number;
  inProgress: number;
  complete: number;
  failed: number;
  oldestPendingAt: string | null;
}

export default function DeepResearchPanel() {
  const [sum, setSum] = useState<QueueSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const [batchSize, setBatchSize] = useState(15);
  const [prompt, setPrompt] = useState<string>("");
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const r = await fetch("/api/leads/queue-deep-research", { cache: "no-store" });
      if (r.ok) setSum(await r.json());
    } catch {
      /* ignore */
    }
  }

  async function queueTop() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/leads/queue-deep-research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ top: batchSize }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "fejl");
      setMsg(`✓ ${j.added} nye leads i kø (${j.pending} pending i alt)`);
      await refresh();
    } catch (e) {
      setMsg(`Fejl: ${e instanceof Error ? e.message : "ukendt"}`);
    } finally {
      setBusy(false);
    }
  }

  async function getPrompt() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch(`/api/leads/cowork-batch?n=${batchSize}&dry=1`, { cache: "no-store" });
      const text = await r.text();
      if (!r.ok) throw new Error("Kunne ikke hente prompt");
      setPrompt(text);
      setShowModal(true);
    } catch (e) {
      setMsg(`Fejl: ${e instanceof Error ? e.message : "ukendt"}`);
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setMsg("Kunne ikke kopiere");
    }
  }

  const pillStyle: React.CSSProperties = {
    padding: "3px 9px",
    borderRadius: 999,
    fontSize: 11.5,
    fontWeight: 600,
    border: "1px solid var(--border)",
  };

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, margin: 0 }}>
            Deep research (Cowork-mode)
          </h2>
          <div className="cc-dim" style={{ fontSize: 12.5, marginTop: 4 }}>
            Kø dine top-leads, hent prompt, kør i Cowork — gratis i stedet for API-spend.
          </div>
        </div>
        {sum && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={pillStyle}>pending: <strong>{sum.pending}</strong></span>
            <span style={pillStyle}>i gang: <strong>{sum.inProgress}</strong></span>
            <span style={pillStyle}>færdig: <strong>{sum.complete}</strong></span>
            {sum.failed > 0 && (
              <span style={{ ...pillStyle, color: "#b91c1c" }}>fejl: <strong>{sum.failed}</strong></span>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13 }}>
          batch:&nbsp;
          <input
            type="number"
            min={1}
            max={25}
            value={batchSize}
            onChange={(e) => setBatchSize(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
            style={{ width: 60, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)" }}
          />
        </label>
        <button
          onClick={queueTop}
          disabled={busy}
          style={{
            background: "var(--green)", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? "..." : `Kø top ${batchSize}`}
        </button>
        <button
          onClick={getPrompt}
          disabled={busy || !sum || sum.pending === 0}
          style={{
            background: "var(--accent-ink)", color: "#fff", border: "none", borderRadius: 8,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            cursor: busy || !sum || sum.pending === 0 ? "default" : "pointer",
            opacity: busy || !sum || sum.pending === 0 ? 0.5 : 1,
          }}
        >
          Hent Cowork-prompt
        </button>
        <button
          onClick={refresh}
          disabled={busy}
          style={{
            background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer",
          }}
        >
          Opdater
        </button>
      </div>

      {msg && (
        <div style={{ fontSize: 13, color: msg.startsWith("Fejl") ? "#b91c1c" : "var(--text)" }}>{msg}</div>
      )}

      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 999,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-2)", borderRadius: 12, maxWidth: 760, width: "100%",
              maxHeight: "90vh", display: "flex", flexDirection: "column",
              border: "1px solid var(--border)", overflow: "hidden",
            }}
          >
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong>Cowork-prompt klar</strong>
              <button onClick={() => setShowModal(false)} style={{ background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={copyPrompt}
                style={{ background: "var(--green)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
              >
                {copied ? "✓ Kopieret" : "Kopier prompt"}
              </button>
              <a
                href="claude://cowork/new"
                style={{ background: "var(--accent-ink)", color: "#fff", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 600, textDecoration: "none" }}
              >
                Åbn Cowork →
              </a>
              <span className="cc-dim" style={{ fontSize: 12, alignSelf: "center" }}>
                Paste prompten i Cowork. Den processer leads og POST’er resultater tilbage.
              </span>
            </div>
            <pre
              style={{
                margin: 0, padding: 18, overflow: "auto", flex: 1,
                fontSize: 12.5, fontFamily: "Menlo, Monaco, Consolas, monospace",
                whiteSpace: "pre-wrap", wordBreak: "break-word",
              }}
            >
              {prompt}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
