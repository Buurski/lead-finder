"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { fetchHermesCronRuns, type HermesCronJobWithRuns, type HermesCronRun } from "@/lib/hermes-client";

const FRIENDLY: Record<string, { label: string; icon: string }> = {
  dreaming:        { label: "Drømme-analyse",      icon: "Moon" },
  "pipeline-pulse":{ label: "Pipeline-pulse",      icon: "Activity" },
  "followup-reminder": { label: "Followup-påmindelse", icon: "Bell" },
  "heat-generate": { label: "HEAT-generator",      icon: "Thermometer" },
};

function relTime(ts: string | null | undefined): string {
  if (!ts) return "aldrig";
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  const min = Math.round((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  if (min < 60 * 24) return `${Math.round(min / 60)} t siden`;
  return `${Math.round(min / (60 * 24))} d siden`;
}

function fmtRunTs(ts: string): string {
  // "2026-06-14 11-18-53" → "14/6 11:18"
  const m = ts.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2})-(\d{2})-(\d{2})/);
  if (!m) return ts;
  return `${m[3]}/${m[2]} ${m[4]}:${m[5]}`;
}

export default function HermesRuns() {
  const [jobs, setJobs] = useState<HermesCronJobWithRuns[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState<HermesCronRun | null>(null);

  const load = async () => {
    try {
      const j = await fetchHermesCronRuns(5);
      setJobs(j);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "ukendt fejl");
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const overallOk = jobs.every((j) => j.last_status === "ok");
  const border = overallOk ? "var(--accent-ink)" : "var(--amber)";
  const dreamingJob = jobs.find((j) => j.name === "dreaming");

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 12, borderColor: border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={overallOk ? "CheckCircle2" : "AlertTriangle"} style={{ width: 17, height: 17, color: border }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Hermes Cronjobs (VPS)</h2>
        <button onClick={load} className="cc-link" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>opdatér</button>
      </div>

      {dreamingJob && dreamingJob.runs.length > 0 && (
        <Link
          href={`/hermes?job=${dreamingJob.id}`}
          className="cc-card-pad"
          style={{
            display: "block",
            textDecoration: "none",
            color: "inherit",
            background: "var(--bg-elev)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "10px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <Icon name="Moon" style={{ width: 14, height: 14, color: "var(--accent-ink)" }} />
            <span style={{ fontSize: 12, fontWeight: 600 }}>Seneste drøm</span>
            <span className="cc-dim" style={{ fontSize: 11, marginLeft: "auto" }}>{fmtRunTs(dreamingJob.runs[0].timestamp)}</span>
          </div>
          <div className="cc-dim" style={{ fontSize: 11.5, lineHeight: 1.4 }}>
            {dreamingJob.runs[0].size > 0
              ? `${dreamingJob.runs[0].size} bytes · ${dreamingJob.runs[0].status === "ok" ? "✓ skrevet til daily/" : "✗ fejlede"}`
              : "ingen output endnu"}
          </div>
        </Link>
      )}

      {err && <div className="cc-dim" style={{ fontSize: 12.5, color: "var(--amber)" }}>Kunne ikke hente runs: {err}</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {jobs.map((j) => {
          const meta = FRIENDLY[j.name ?? ""] ?? { label: j.name, icon: "Clock" };
          const isOpen = openJob === j.id;
          return (
            <div key={j.id} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
              <button
                onClick={() => setOpenJob(isOpen ? null : j.id)}
                style={{
                  display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center",
                  width: "100%", padding: "8px 10px", background: "none", border: "none", cursor: "pointer",
                  color: "inherit", textAlign: "left", fontSize: 13, fontWeight: 600,
                }}
              >
                <Icon name={meta.icon} style={{ width: 16, height: 16, color: j.last_status === "ok" ? "var(--accent-ink)" : "var(--amber)" }} />
                <span>{meta.label}</span>
                <span className="cc-dim" style={{ fontSize: 11, fontWeight: 400 }}>{relTime(j.last_run_at)}</span>
                <Icon name={isOpen ? "ChevronUp" : "ChevronDown"} style={{ width: 14, height: 14, color: "var(--text-dim)" }} />
              </button>
              {isOpen && j.runs.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "6px 10px", display: "grid", gap: 4 }}>
                  {j.runs.map((r) => {
                    return (
                    <div key={r.file} style={{ borderBottom: "1px solid var(--border-soft)", padding: "4px 6px" }}>
                      <button
                        onClick={() => setOpenRun(r)}
                        style={{
                          display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, alignItems: "center",
                          background: "none", border: "none", padding: "4px 0", cursor: "pointer",
                          textAlign: "left", color: "inherit", fontSize: 11.5, width: "100%",
                        }}
                      >
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{fmtRunTs(r.timestamp)}</span>
                        <span style={{ color: r.status === "ok" ? "var(--accent-ink)" : "var(--amber)", fontWeight: 600 }}>
                          {r.status === "ok" ? "✓" : "✗"}
                        </span>
                        <span className="cc-dim">{r.size}b</span>
                      </button>
                      {r.key_points && r.key_points.length > 0 && (
                        <ul style={{ margin: "2px 0 4px 18px", padding: 0, fontSize: 11, lineHeight: 1.4, color: "var(--text-muted)" }}>
                          {r.key_points.map((kp, i) => <li key={i} style={{ marginBottom: 2 }}>{kp}</li>)}
                        </ul>
                      )}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {openRun && (
        <div
          onClick={() => setOpenRun(null)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100,
            display: "grid", placeItems: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg)", borderRadius: 12, padding: 20, maxWidth: 720, width: "100%",
              maxHeight: "80vh", overflow: "auto", border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h3 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600 }}>
                {openRun.timestamp} · {openRun.status === "ok" ? "✓" : "✗ fejl"} · {openRun.size}b
              </h3>
              <button onClick={() => setOpenRun(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <Icon name="X" style={{ width: 18, height: 18 }} />
              </button>
            </div>
            {openRun.error && (
              <div style={{ padding: "8px 12px", background: "var(--amber)", color: "var(--bg)", borderRadius: 6, fontSize: 12, marginBottom: 12 }}>
                {openRun.error}
              </div>
            )}
            <pre style={{ fontSize: 11.5, whiteSpace: "pre-wrap", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}>
              Fil: <code>~/.hermes/cron/output/{openRun.file}</code>
              {"\n\n"}Fuld output vises i /hermes siden (klik &quot;Se fuld log&quot; når vi lander den).
            </pre>
            <Link
              href={`/hermes?job=${openJob}&run=${openRun.file}`}
              className="cc-btn"
              style={{ display: "inline-block", marginTop: 12, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}
            >
              Åbn i /hermes →
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
