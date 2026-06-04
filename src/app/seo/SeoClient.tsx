"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

interface ClientRow {
  id: string;
  name: string;
  branch: string;
  websiteStatus: string;
}

interface SeoResult {
  tier: string;
  schema: { found: boolean; types: string[]; count: number } | null;
  index: { indexed: number | null; note: string } | null;
  aiVisibility: { mentioned: boolean | null; detail: string } | null;
  lighthouse: { available: boolean; note: string } | null;
  notes: string[];
}

export default function SeoClient({ clients, ok }: { clients: ClientRow[]; ok: boolean }) {
  if (!ok) {
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Icon name="Activity" style={{ width: 18, height: 18, color: "var(--amber)" }} />
        <span className="cc-muted" style={{ fontSize: 13.5 }}>Kunne ikke nå Sheets — klientlisten er tom her.</span>
      </div>
    );
  }
  if (clients.length === 0) {
    return (
      <div className="cc-card">
        <div className="cc-empty"><Icon name="Search" /><div>Ingen klienter endnu.</div></div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {clients.map((c) => (
        <SeoCard key={c.id} client={c} />
      ))}
    </div>
  );
}

function SeoCard({ client }: { client: ClientRow }) {
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<SeoResult | null>(null);
  const [report, setReport] = useState("");
  const [err, setErr] = useState("");

  async function run() {
    if (!domain.trim()) { setErr("Angiv et domæne først."); setState("error"); return; }
    setState("running");
    setErr("");
    try {
      const res = await fetch("/api/seo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: client.name, domain }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "fejl"); setState("error"); return; }
      setResult(d.result);
      setReport(d.report ?? "");
      setState("done");
    } catch (e) {
      setErr(String(e));
      setState("error");
    }
  }

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{client.name}</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{client.branch} · {client.websiteStatus}</div>
        </div>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="domæne, fx vida.dk"
          style={{ height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)", minWidth: 160 }}
        />
        <button className="cc-btn" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Tjekker…" : "Kør tjek"}
        </button>
      </div>

      {state === "error" && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{err}</div>}

      {state === "done" && result && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          <span className="cc-chip" style={{ width: "fit-content" }}>{result.tier === "tier_full" ? "fuld" : "basis"}-niveau</span>
          <Metric label="Schema.org" value={result.schema ? (result.schema.found ? result.schema.types.join(", ") : "ingen fundet") : "ikke tjekket"} good={!!result.schema?.found} />
          <Metric label="Lighthouse" value={result.lighthouse?.note ?? "n/a"} />
          {result.index && <Metric label="Google-index" value={result.index.indexed != null ? `~${result.index.indexed} sider` : result.index.note} />}
          {result.aiVisibility && <Metric label="AI-synlighed" value={result.aiVisibility.mentioned == null ? result.aiVisibility.detail : result.aiVisibility.mentioned ? "kendt ✓" : "ukendt"} good={result.aiVisibility.mentioned === true} />}
          {report && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--accent-ink)" }}>Vis månedsrapport (markdown)</summary>
              <pre style={{ marginTop: 8, padding: 12, background: "var(--bg-3)", borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap" }}>{report}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13 }}>
      <span className="cc-dim" style={{ width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ color: good ? "var(--accent-ink)" : "var(--text)", fontWeight: good ? 600 : 400, minWidth: 0 }}>{value}</span>
    </div>
  );
}
