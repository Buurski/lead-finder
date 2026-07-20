"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/shell/Icon";

interface Entry {
  label: string;
  platform: string;
  hourLocal: number;
  minuteLocal: number;
}

// Bundle K DEL 3.3 — static cron-config render, no live data. Times are the
// declared local (Europe/Copenhagen) schedules from vercel.json + the Cowork
// SKILL.md frontmatter + Claude Code Routines cron strings. Update this list
// by hand when a schedule changes — it is not derived live on purpose.
const ENTRIES: Entry[] = [
  { label: "daily-lead-gen", platform: "Cowork", hourLocal: 6, minuteLocal: 0 },
  { label: "omverden-daily", platform: "Claude Code", hourLocal: 6, minuteLocal: 30 },
  { label: "daily-messenger", platform: "Cowork", hourLocal: 7, minuteLocal: 0 },
  { label: "morgen-brief-lucas-os", platform: "Claude Code", hourLocal: 7, minuteLocal: 1 },
  { label: "daglig-brief", platform: "Cowork", hourLocal: 7, minuteLocal: 45 },
  { label: "lucas-os-brief-watchdog", platform: "Cowork", hourLocal: 8, minuteLocal: 30 },
  { label: "engine (kladder)", platform: "Vercel", hourLocal: 0, minuteLocal: 0 },
  { label: "inbox-triage", platform: "Vercel", hourLocal: 0, minuteLocal: 0 },
  { label: "invoices", platform: "Vercel", hourLocal: 5, minuteLocal: 0 },
];

function nextOccurrence(hourLocal: number, minuteLocal: number, now: Date): Date {
  const d = new Date(now);
  d.setHours(hourLocal, minuteLocal, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
}

export default function NextRunsWidget() {
  const [now, setNow] = useState<Date | null>(null);
  // Client-only mount flag (avoids SSR hydration mismatch) — intentional sync setState.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNow(new Date()), []);

  const upcoming = useMemo(() => {
    if (!now) return [];
    return ENTRIES
      .map((e) => ({ ...e, at: nextOccurrence(e.hourLocal, e.minuteLocal, now) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, 5);
  }, [now]);

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="Clock" style={{ width: 16, height: 16, color: "var(--text-dim)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600 }}>Næste 5 planlagte kørsler</h2>
      </div>
      {!now && <div className="cc-dim" style={{ fontSize: 12 }}>Henter…</div>}
      {now && (
        <div style={{ display: "grid", gap: 6 }} suppressHydrationWarning>
          {upcoming.map((e) => (
            <div key={e.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
              <span>{e.label}</span>
              <span className="cc-dim">
                {e.platform} · {String(e.at.getHours()).padStart(2, "0")}:{String(e.at.getMinutes()).padStart(2, "0")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
