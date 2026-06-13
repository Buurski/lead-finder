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
  "pre-cleanup":  { label: "Døde leads-gencheck", icon: "RefreshCw" },
  "sync-replies": { label: "Svar-synk",            icon: "Inbox"     },
  "engine":       { label: "Motor (kladder)",      icon: "Bot"       },
};

function relAge(min: number | null): string {
  if (min === null) return "aldrig";
  if (min < 60) return `${min} min siden`;
  if (min < 60 * 24) return `${Math.round(min / 60)} t siden`;
  return `${Math.round(min / (60 * 24))} d siden`;
}

export default function CronHealth() {
  const [data, setData] = useState<CronHealth | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const r = await fetch("/api/cron/health", { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const d: CronHealth = await r.json();
        if (alive) setData(d);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "ukendt fejl");
      }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const tone = data?.ok ? "ok" : "warn";
  const border = tone === "ok" ? "var(--accent-ink)" : "var(--amber)";

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 12, borderColor: border }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name={tone === "ok" ? "CheckCircle2" : "AlertTriangle"} style={{ width: 17, height: 17, color: border }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Cronjobs (Vercel)</h2>
        <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 12 }}>
          {data ? `opdateret ${relAge(Math.max(0, Math.round((Date.now() - Date.parse(data.generatedAt)) / 60_000)))}` : "henter…"}
        </span>
      </div>

      {err && <div className="cc-dim" style={{ fontSize: 12.5, color: "var(--amber)" }}>Kunne ikke hente /api/cron/health: {err}</div>}

      {data && (
        <div style={{ display: "grid", gap: 10 }}>
          {data.crons.map((c) => {
            const meta = FRIENDLY[c.cron] ?? { label: c.cron, icon: "Clock" };
            const color = c.ok ? "var(--accent-ink)" : "var(--amber)";
            return (
              <div key={c.cron} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 10 }}>
                <Icon name={meta.icon} style={{ width: 16, height: 16, color }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
                  <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 2 }}>
                    {c.ok ? c.note ?? "ok" : c.error ?? c.note ?? "fejlet"} · {c.lastRunAt ? relAge(c.ageMinutes) : "aldrig kørt"} · planlagt {c.scheduled} UTC
                  </div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  {c.ok ? "OK" : "FEJL"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
