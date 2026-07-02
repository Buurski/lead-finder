"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface PreviewDraft {
  id: string;
  name: string;
  subject: string;
  branch: string;
  city: string;
}
interface Summary {
  picked: number;
  drafted: number;
  written?: number;
  qualifiedOut: number;
  source: string;
  skipped: Array<{ name: string; reason: string }>;
  drafts: PreviewDraft[];
}

type Phase = "idle" | "previewing" | "preview" | "running" | "done" | "error";

interface Progress {
  phase: "pick" | "research" | "draft" | "skip" | "collected" | "done";
  idx: number;
  total: number;
  name?: string;
}

const PHASE_LABEL: Record<Progress["phase"], string> = {
  pick: "Vælger leads…",
  research: "Researcher",
  draft: "Skriver udkast til",
  skip: "Springer over",
  collected: "Færdig med",
  done: "Samler op…",
};

// The first real Fase B action: run the engine with a no-write preview, then an
// explicit confirm that fills the queue. Never sends mail. A stray click can't
// mutate the live queue because "run" needs confirm:true server-side too.
//
// The route streams NDJSON progress (one Opus draft per lead is slow), so we show
// a live "drafter 3/12 · <navn>" bar instead of a frozen button.
export default function EngineRunner() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [limit, setLimit] = useState(12);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [elapsed, setElapsed] = useState(0);

  // Elapsed-seconds ticker while the engine runs — reassures it's alive even
  // between per-lead events. The interval's setState lives in a callback (fine);
  // the initial reset happens in call() so the effect has no synchronous setState.
  useEffect(() => {
    const running = phase === "previewing" || phase === "running";
    if (!running) return;
    const t0 = Date.now();
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [phase]);

  async function call(mode: "preview" | "run") {
    setError("");
    setProgress(null);
    setElapsed(0);
    setPhase(mode === "preview" ? "previewing" : "running");
    try {
      const res = await fetch("/api/engine/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "preview" ? { mode, limit } : { mode, limit, confirm: true }),
      });

      // Validation errors (412/400) come back as plain JSON, not a stream.
      const ctype = res.headers.get("content-type") || "";
      if (!res.ok && !ctype.includes("ndjson")) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error ?? `HTTP ${res.status}`);
        setPhase("error");
        return;
      }

      // Parse the NDJSON stream line-by-line.
      const reader = res.body?.getReader();
      if (!reader) throw new Error("ingen stream");
      const decoder = new TextDecoder();
      let buf = "";
      let done = false;
      while (!done) {
        const { value, done: rdone } = await reader.read();
        done = rdone;
        buf += decoder.decode(value ?? new Uint8Array(), { stream: !done });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let msg: { type: string; error?: string; summary?: Summary } & Partial<Progress>;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }
          if (msg.type === "progress") {
            setProgress({ phase: msg.phase!, idx: msg.idx!, total: msg.total!, name: msg.name });
          } else if (msg.type === "error") {
            setError(msg.error ?? "ukendt fejl");
            setPhase("error");
            return;
          } else if (msg.type === "summary" && msg.summary) {
            setSummary(msg.summary);
            if (mode === "preview") {
              setPhase("preview");
            } else {
              setPhase("done");
              setToast(`Køen fyldt med ${msg.summary.written ?? msg.summary.drafted} drafts.`);
              setTimeout(() => setToast(""), 6000);
            }
          }
        }
      }
    } catch (e) {
      setError(String(e));
      setPhase("error");
    }
  }

  const busy = phase === "previewing" || phase === "running";

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Icon name="Sparkles" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Kør motor</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>Preview uden at skrive → bekræft → fylder kun køen. Sender aldrig.</div>
        </div>
        <label className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          antal
          <input
            type="number"
            min={1}
            max={25}
            value={limit}
            onChange={(e) => setLimit(Math.min(25, Math.max(1, Number(e.target.value) || 1)))}
            disabled={busy}
            style={{ width: 54, height: 32, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 8px", color: "var(--text)", fontSize: 13 }}
            aria-label="Antal drafts"
          />
        </label>
        <button className={phase === "preview" ? "cc-btn" : "cc-btn cc-btn-accent"} onClick={() => call("preview")} disabled={busy}>
          {phase === "previewing" ? "Kører…" : "Preview"}
        </button>
      </div>

      {busy && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 7 }}>
            <span className="cc-spin" style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid var(--border-strong)", borderTopColor: "var(--accent-ink)", display: "inline-block" }} />
            <span style={{ fontWeight: 600 }}>
              {progress
                ? progress.phase === "pick" || progress.phase === "done"
                  ? PHASE_LABEL[progress.phase]
                  : `${PHASE_LABEL[progress.phase]} ${progress.name ?? ""}`
                : "Starter motoren…"}
            </span>
            <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 12 }}>
              {progress && progress.total ? `${Math.min(progress.idx, progress.total)}/${progress.total} · ` : ""}{elapsed}s
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                borderRadius: 999,
                background: "var(--accent)",
                width: progress && progress.total ? `${Math.min(100, Math.round((progress.idx / progress.total) * 100))}%` : "12%",
                transition: "width 500ms cubic-bezier(0.22,1,0.36,1)",
              }}
            />
          </div>
          <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 6 }}>
            Ét personligt udkast pr. lead (Opus) — det tager et øjeblik. Sender intet.
          </div>
        </div>
      )}

      {phase === "error" && (
        <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 8, background: "var(--red-dim)", color: "var(--red)", fontSize: 13 }}>
          Kunne ikke køre: {error}
        </div>
      )}

      {(phase === "preview" || phase === "running" || phase === "done") && summary && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
            <Mini label="ville drafte" value={summary.drafted} />
            <Mini label="frasorteret" value={summary.qualifiedOut} />
            <Mini label="kilde" value={summary.source} />
          </div>

          {summary.drafts.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              {summary.drafts.slice(0, 6).map((d, i) => (
                <li key={d.id} style={{ padding: "9px 13px", borderTop: i ? "1px solid var(--border)" : "none", fontSize: 13 }}>
                  <span style={{ fontWeight: 600 }}>{d.name}</span>
                  <span className="cc-dim"> · {d.subject || `${d.branch}, ${d.city}`}</span>
                </li>
              ))}
            </ul>
          )}

          {phase === "preview" && (
            <div style={{ display: "flex", gap: 8, marginTop: 14, alignItems: "center" }}>
              <button className="cc-btn cc-btn-accent" onClick={() => call("run")}>
                Bekræft og fyld kø ({summary.drafted})
              </button>
              <button className="cc-btn" onClick={() => { setPhase("idle"); setSummary(null); }}>Annullér</button>
              <span className="cc-dim" style={{ fontSize: 12, marginLeft: "auto" }}>Preview skrev intet.</span>
            </div>
          )}

          {phase === "done" && (
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--accent-ink)", fontWeight: 600, display: "flex", alignItems: "center", gap: 7 }}>
              <Icon name="CheckCheck" style={{ width: 16, height: 16 }} /> Kø fyldt. Gå til Godkendelse for at gennemgå.
            </div>
          )}
        </div>
      )}

      {toast && (
        <div role="status" style={{ position: "fixed", bottom: 22, left: "50%", transform: "translateX(-50%)", zIndex: 80, background: "var(--text)", color: "var(--bg)", padding: "11px 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 500, boxShadow: "var(--shadow-soft)" }}>
          {toast}
        </div>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600 }}>{value}</span>
      <span className="cc-dim" style={{ fontSize: 12, marginLeft: 6 }}>{label}</span>
    </div>
  );
}
