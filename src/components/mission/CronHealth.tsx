"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface CronStatus {
  cron: string;
  ok: boolean;
  lastRunAt: string | null;
  durationMs: number | null;
  note: string | null;
  error: string | null;
  ageMinutes: number | null;
  scheduled: string;
}
interface CronHealth { ok: boolean; generatedAt: string; crons: CronStatus[]; }

const FRIENDLY: Record<string, { label: string; icon: string }> = {
  "pre-cleanup":    { label: "Døde leads-gencheck", icon: "RefreshCw" },
  "sync-replies":   { label: "Svar-synk",           icon: "Inbox"     },
  "engine":         { label: "Motor (kladder)",     icon: "Bot"       },
  "inbox-triage":   { label: "Inbox-triage",        icon: "Mail"      },
  "ingest-leadgen": { label: "Leadgen-ingest",      icon: "Download"  },
};

function relAge(min: number | null): string {
  if (min === null) return "aldrig";
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  if (min < 60 * 24) return `${Math.round(min / 60)} t siden`;
  return `${Math.round(min / (60 * 24))} d siden`;
}

export default function CronHealth() {
  const [data, setData] = useState<CronHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/cron/health", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d: CronHealth = await r.json();
      setData(d);
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

  const runNow = async (name: string) => {
    setRunning(name);
    setToast(null);
    try {
      const r = await fetch(`/api/cron/run/${name}`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
      setToast({ kind: "ok", text: `${name} kørt ✓` });
      await load();
    } catch (e) {
      setToast({ kind: "err", text: `${name} fejlede: ${e instanceof Error ? e.message : "ukendt"}` });
    } finally {
      setRunning(null);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const tone = data?.ok ? "ok" : "warn";
  const border = tone === "ok" ? "var(--accent-ink)" : "var(--amber)";

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 12, borderColor: border, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={tone === "ok" ? "CheckCircle2" : "AlertTriangle"} style={{ width: 17, height: 17, color: border }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Cronjobs (Vercel)</h2>
        <button onClick={load} className="cc-link" style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>opdatér</button>
      </div>

      {err && <div className="cc-dim" style={{ fontSize: 12.5, color: "var(--amber)" }}>Kunne ikke hente /api/cron/health: {err}</div>}
      {toast && (
        <div style={{ position: "absolute", top: 8, right: 8, padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: toast.kind === "ok" ? "var(--accent-ink)" : "var(--amber)", color: toast.kind === "ok" ? "var(--bg)" : "var(--text)" }}>
          {toast.text}
        </div>
      )}

      {data && (
        <div style={{ display: "grid", gap: 10 }}>
          {data.crons.map((c) => {
            const meta = FRIENDLY[c.cron] ?? { label: c.cron, icon: "Clock" };
            const color = c.ok ? "var(--accent-ink)" : "var(--amber)";
            const isRunning = running === c.cron;
            return (
              <div key={c.cron} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <Icon name={meta.icon} style={{ width: 16, height: 16, color }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                  <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {c.ok ? c.note ?? "ok" : c.error ?? c.note ?? "fejlet"} · {c.lastRunAt ? relAge(c.ageMinutes) : "aldrig kørt"} · planlagt {c.scheduled} UTC
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: 0.4 }}>{c.ok ? "OK" : "FEJL"}</span>
                <button
                  onClick={() => runNow(c.cron)}
                  disabled={isRunning}
                  className="cc-btn"
                  style={{ padding: "4px 10px", fontSize: 11.5, fontWeight: 600, opacity: isRunning ? 0.6 : 1, cursor: isRunning ? "wait" : "pointer" }}
                >
                  {isRunning ? "kører…" : "Kør nu"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
