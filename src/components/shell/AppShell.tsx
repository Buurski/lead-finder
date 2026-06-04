"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_FLAT } from "@/lib/nav-config";
import Sidebar from "./Sidebar";
import Clock from "./Clock";
import CommandPalette from "./CommandPalette";
import ChatDock from "./ChatDock";
import Icon from "./Icon";

interface Counts {
  queue?: number;
  needs?: number;
}

function titleFor(pathname: string): string {
  if (pathname === "/") return "Mission Control";
  const hit = NAV_FLAT.find((i) => i.href !== "/" && (pathname === i.href || pathname.startsWith(i.href + "/")));
  return hit?.label ?? "Command Center";
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [counts, setCounts] = useState<Counts>({});

  // Global ⌘K / Ctrl+K to toggle the palette.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // (The mobile drawer closes itself via Sidebar's onNavigate when a link is
  // tapped, so no route-change effect is needed here.)

  // Hydrate badge + dock counts from the read-only deck summary. Best-effort.
  useEffect(() => {
    let alive = true;
    fetch("/api/deck/summary")
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d) return;
        setCounts({ queue: d?.queue?.pending, needs: d?.needsYou?.length });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const closePalette = useCallback(() => setPaletteOpen(false), []);

  return (
    <div className="cc-shell">
      <Sidebar open={navOpen} counts={counts} onNavigate={() => setNavOpen(false)} />

      <div className="cc-main">
        <header className="cc-topbar">
          <button
            className="cc-cmdk cc-menu-btn"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Vis menu"
          >
            <Icon name="Menu" style={{ width: 16, height: 16 }} />
          </button>
          <span className="cc-topbar-title">{titleFor(pathname)}</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <Clock />
            <button className="cc-cmdk" onClick={() => setPaletteOpen(true)} aria-label="Åbn kommando-palette">
              <Icon name="Command" style={{ width: 14, height: 14 }} />
              Hop til
              <span className="cc-kbd">⌘K</span>
            </button>
          </div>
        </header>

        <div className="cc-content">{children}</div>
      </div>

      {paletteOpen && <CommandPalette onClose={closePalette} />}
      <ChatDock counts={counts} />
    </div>
  );
}
