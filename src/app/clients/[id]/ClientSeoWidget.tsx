"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

// SEO-status widget on the client page. Runs the Block 3 checks for this client's
// domain on demand (read-only). Shows schema + lighthouse note inline.
export default function ClientSeoWidget({ name, domain }: { name: string; domain: string }) {
  const [dom, setDom] = useState(domain);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<{ schema: { found: boolean; types: string[] } | null; lighthouse: { note: string } | null; tier: string } | null>(null);
  const [err, setErr] = useState("");

  async function run() {
    if (!dom.trim()) { setErr("Angiv et domæne."); setState("error"); return; }
    setState("running");
    setErr("");
    try {
      const res = await fetch("/api/seo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, domain: dom }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "fejl"); setState("error"); return; }
      setResult(d.result);
      setState("done");
    } catch (e) {
      setErr(String(e));
      setState("error");
    }
  }

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <Icon name="Search" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>SEO-status</h2>
        <input
          value={dom}
          onChange={(e) => setDom(e.target.value)}
          placeholder="domæne"
          style={{ marginLeft: "auto", height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)", minWidth: 150 }}
        />
        <button className="cc-btn" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Tjekker…" : "Kør tjek"}
        </button>
      </div>
      {state === "error" && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{err}</div>}
      {state === "done" && result && (
        <div style={{ marginTop: 12, display: "grid", gap: 6, fontSize: 13 }}>
          <Line k="Niveau" v={result.tier === "tier_full" ? "fuld" : "basis"} />
          <Line k="Schema.org" v={result.schema ? (result.schema.found ? result.schema.types.join(", ") : "ingen fundet") : "ikke tjekket"} good={!!result.schema?.found} />
          <Line k="Lighthouse" v={result.lighthouse?.note ?? "n/a"} />
        </div>
      )}
      {state === "idle" && <p className="cc-dim" style={{ fontSize: 12.5, marginTop: 8 }}>Kører schema-scan + Lighthouse (hvis installeret). Skriver intet.</p>}
    </section>
  );
}

function Line({ k, v, good }: { k: string; v: string; good?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10 }}>
      <span className="cc-dim" style={{ width: 100, flexShrink: 0 }}>{k}</span>
      <span style={{ color: good ? "var(--accent-ink)" : "var(--text)", fontWeight: good ? 600 : 400 }}>{v}</span>
    </div>
  );
}
