"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

interface FoundRow {
  id: string;
  name: string;
  website: string;
  email: string | null;
}

// Read-only "Find emails" action: runs email-finder over the next N email-less
// leads and shows what it found. Writes nothing to Sheets — persisting is the
// separate bulk-find route, an explicit step.
export default function FindEmailsButton() {
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [limit, setLimit] = useState(25);
  const [rows, setRows] = useState<FoundRow[]>([]);
  const [meta, setMeta] = useState<{ checked: number; found: number }>({ checked: 0, found: 0 });
  const [err, setErr] = useState("");

  async function run() {
    setState("running");
    setErr("");
    try {
      const res = await fetch("/api/email/find-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit }),
      });
      const d = await res.json();
      if (d.ok === false) { setErr(d.error ?? "fejl"); setState("error"); return; }
      setRows(d.results ?? []);
      setMeta({ checked: d.checked ?? 0, found: d.found ?? 0 });
      setState("done");
    } catch (e) {
      setErr(String(e));
      setState("error");
    }
  }

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="Search" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Find emails</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>MX-verificeret opslag på de næste leads uden email. Skriver intet.</div>
        </div>
        <label className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          antal
          <input
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Math.min(100, Math.max(1, Number(e.target.value) || 1)))}
            disabled={state === "running"}
            style={{ width: 58, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 8px", color: "var(--text)", fontSize: 13 }}
            aria-label="Antal leads"
          />
        </label>
        <button className="cc-btn" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Søger…" : "Find"}
        </button>
      </div>

      {state === "error" && (
        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--red-dim)", color: "var(--red)", fontSize: 13 }}>{err}</div>
      )}

      {state === "done" && (
        <div style={{ marginTop: 14 }}>
          <div className="cc-dim" style={{ fontSize: 12.5, marginBottom: 8 }}>
            Tjekkede {meta.checked} · fandt <strong style={{ color: "var(--accent-ink)" }}>{meta.found}</strong> emails (ikke gemt).
          </div>
          {rows.filter((r) => r.email).length > 0 ? (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {rows.filter((r) => r.email).slice(0, 12).map((r, i) => (
                <li key={r.id} style={{ padding: "9px 13px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13, display: "flex", gap: 10 }}>
                  <span style={{ fontWeight: 600, minWidth: 0, flex: "0 1 auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                  <span className="cc-dim" style={{ marginLeft: "auto" }}>{r.email}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cc-dim" style={{ fontSize: 13 }}>Ingen nye emails fundet i denne omgang.</div>
          )}
        </div>
      )}
    </section>
  );
}
