"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { pageTitleFor } from "@/lib/nav-config";
import Sidebar from "./Sidebar";
import Bell from "./Bell";
import Icon from "./Icon";
import CommandPalette from "./CommandPalette";

interface Counts {
  queue?: number;
  needs?: number;
  invoicesOverdue?: number;
}

interface PauseInfo {
  paused: boolean;
  until: string | null;
}

// Human line for the pause banner. `until` can be a date string or a sentinel
// ("indefinite" etc.) — show the raw value when it isn't a parseable date.
function pauseLine(p: PauseInfo): string {
  if (!p.until) return "Al afsendelse er på pause.";
  const t = Date.parse(p.until);
  if (Number.isNaN(t)) return "Al afsendelse er på pause (indtil videre).";
  return `Al afsendelse er på pause til ${new Date(t).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [pause, setPause] = useState<PauseInfo | null>(null);

  // Hydrate badge counts from the read-only deck summary. Best-effort.
  useEffect(() => {
    if (pathname === "/login") return;
    let alive = true;
    fetch("/api/deck/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d) return;
        setCounts({ queue: d?.queue?.pending, needs: d?.needsYou?.length, invoicesOverdue: d?.invoicesOverdue });
        setPause(d?.pause ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  // ⌘K / Ctrl+K åbner kommando-paletten fra hvor som helst i skallen.
  useEffect(() => {
    if (pathname === "/login") return;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pathname]);

  // Login-siden er offentlig: ingen skal, dock eller tællere.
  if (pathname === "/login") return <>{children}</>;

  const title = pageTitleFor(pathname);

  return (
    <div className="cc-shell">
      <Sidebar counts={{ queue: counts.queue }} />

      <div className="cc-main">
        <header className="cc-topbar">
          <h1 className="cc-topbar-title">{title}</h1>
          <div className="cc-topbar-right">
            <button className="cc-search-pill cc-focus" onClick={() => setPaletteOpen(true)} aria-label="Søg og naviger">
              <Icon name="Search" style={{ width: 16, height: 16 }} />
              <span className="txt">Søg virksomheder, aftaler…</span>
              <span className="cc-search-kbd">⌘K</span>
            </button>
            <Bell counts={counts} />
            <button className="cc-btn-new cc-focus" onClick={() => setPaletteOpen(true)} aria-label="Opret nyt">
              <Icon name="Plus" style={{ width: 16, height: 16 }} />
              <span>Ny</span>
            </button>
          </div>
        </header>

        {pause?.paused && (
          <div
            role="status"
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "8px 20px", fontSize: 13, fontWeight: 600,
              background: "var(--amber-dim)", color: "var(--text)",
              borderBottom: "1px solid var(--amber)",
            }}
          >
            <Icon name="Pause" style={{ width: 14, height: 14, color: "var(--amber)" }} />
            {pauseLine(pause)}
            <a href="/review/halt" className="cc-link" style={{ marginLeft: "auto", fontSize: 12.5 }}>Se pause-status</a>
          </div>
        )}
        <div className="cc-content">{children}</div>
      </div>

      {/* Hermes-dock mounter her (fase 2, Task 7) — erstatter den fjernede Claude-chat. */}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
