"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface ScheduledTaskStatus {
  taskId: string;
  lastRunAt: string | null;
  enabled: boolean;
  source: string;
}
interface VercelCronStatus { path: string; schedule: string }
interface HermesCronStatus { note: string }
interface AllStatus {
  ok: boolean;
  vercel?: VercelCronStatus[];
  scheduled?: ScheduledTaskStatus[];
  hermes?: HermesCronStatus[];
  generatedAt?: string;
  error?: string;
}

function relAge(iso: string | null): string {
  if (!iso) return "aldrig set";
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return "ukendt";
  const min = Math.round(ms / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  if (min < 60 * 24) return `${Math.round(min / 60)} t siden`;
  return `${Math.round(min / (60 * 24))} d siden`;
}

// Bundle K DEL 3.1 — kompakt tværplatform task-status: Cowork Scheduled
// Tasks (mtime-proxy) + Vercel crons (deklareret skema) + Hermes (stub til
// den har sit eget status-endpoint). Operatør-grade, read-only.
export default function TaskStatusWidget() {
  const [data, setData] = useState<AllStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/ops/all-status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : "ukendt fejl");
      });
    return () => {
      alive = false;
    };
  }, []);

  const nowMs = data?.generatedAt ? Date.parse(data.generatedAt) : NaN;
  const stale = (data?.scheduled ?? []).filter((t) => {
    if (!t.lastRunAt || !Number.isFinite(nowMs)) return true;
    return nowMs - Date.parse(t.lastRunAt) > 26 * 60 * 60 * 1000;
  });
  const border = stale.length > 0 ? "var(--amber)" : "var(--accent-ink)";

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10, borderColor: border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={stale.length > 0 ? "AlertTriangle" : "CheckCircle2"} style={{ width: 16, height: 16, color: border }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600 }}>Task-status (alle platforme)</h2>
      </div>

      {err && <div className="cc-dim" style={{ fontSize: 12, color: "var(--amber)" }}>Kunne ikke hente status: {err}</div>}
      {!data && !err && <div className="cc-dim" style={{ fontSize: 12 }}>Henter…</div>}

      {data && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="cc-dim" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4 }}>
            Cowork Scheduled Tasks
          </div>
          {(data.scheduled ?? []).length === 0 && <div className="cc-dim" style={{ fontSize: 12 }}>Ingen fundet lokalt.</div>}
          {(data.scheduled ?? []).map((t) => {
            const isStale = stale.includes(t);
            return (
              <div key={t.taskId} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
                <span>{t.taskId}</span>
                <span style={{ color: isStale ? "var(--amber)" : "var(--text-dim)" }}>{relAge(t.lastRunAt)}</span>
              </div>
            );
          })}

          <div className="cc-dim" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 }}>
            Vercel crons
          </div>
          {(data.vercel ?? []).map((c) => (
            <div key={c.path} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "3px 0" }}>
              <span>{c.path.replace("/api/cron/", "")}</span>
              <span className="cc-dim">{c.schedule}</span>
            </div>
          ))}

          <div className="cc-dim" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginTop: 4 }}>
            Hermes
          </div>
          {(data.hermes ?? []).map((h, i) => (
            <div key={i} className="cc-dim" style={{ fontSize: 12 }}>{h.note}</div>
          ))}
        </div>
      )}
    </section>
  );
}
