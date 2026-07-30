"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_FLAT, ownerGroupFor } from "@/lib/nav-config";
import Sidebar from "./Sidebar";
import ChatDock from "./ChatDock";
import Bell from "./Bell";
import Icon from "./Icon";

interface Counts {
  queue?: number;
  needs?: number;
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

interface Crumb {
  label: string;
  href?: string;
}

// Breadcrumbs (Bundle G): "Leads › Vida › Messenger"-agtig sti i topbaren.
// Bedste NAV_FLAT-match giver roden; resterende URL-segmenter vises
// prettificeret (ids og slugs som de er — operatøren kender sine egne data).
function crumbsFor(pathname: string): Crumb[] {
  if (pathname === "/") return [{ label: "Mission Control" }];
  // Delte hrefs (Compare under både SEO og Studio): ejer-gruppens leaf vinder,
  // så /studio/compare hedder "Studio · Compare", ikke "SEO · Compare" (B2).
  const owner = ownerGroupFor(pathname);
  const pool = owner?.children ?? NAV_FLAT;
  let best: (typeof NAV_FLAT)[number] | undefined;
  for (const i of pool) {
    if (i.href === "/") continue;
    if (pathname === i.href || pathname.startsWith(i.href + "/")) {
      if (!best || i.href.length > best.href.length) best = i;
    }
  }
  if (!best) return [{ label: "Kinly Lead System" }];
  const crumbs: Crumb[] = [{ label: best.paletteLabel ?? best.label, href: best.href }];
  const rest = pathname.slice(best.href.length).split("/").filter(Boolean);
  for (const seg of rest) {
    let label: string;
    try {
      label = decodeURIComponent(seg);
    } catch {
      label = seg;
    }
    if (label.length > 24) label = label.slice(0, 24) + "…";
    crumbs.push({ label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return crumbs;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [counts, setCounts] = useState<Counts>({});
  const [pause, setPause] = useState<PauseInfo | null>(null);

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
        setPause(d?.pause ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pathname]);

  const crumbs = crumbsFor(pathname);

  return (
    <div className="cc-shell" data-rail-collapsed={railCollapsed}>
      <Sidebar open={navOpen} counts={counts} collapsed={railCollapsed} onToggleSize={() => setRailCollapsed((value) => !value)} onNavigate={() => setNavOpen(false)} />

      <div className="cc-main">
        <header className="cc-topbar">
          <button
            className="cc-cmdk cc-menu-btn"
            onClick={() => setNavOpen((v) => !v)}
            aria-label="Vis menu"
          >
            <Icon name="Menu" style={{ width: 16, height: 16 }} />
          </button>
          <nav aria-label="Brødkrumme" style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            {crumbs.map((c, i) => (
              <span key={`${c.label}-${i}`} style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                {i > 0 && <span style={{ color: "var(--text-dim)", fontSize: 12 }}>›</span>}
                {c.href && i < crumbs.length - 1 ? (
                  <Link href={c.href} className="cc-topbar-title cc-link" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
                    {c.label}
                  </Link>
                ) : (
                  <span className="cc-topbar-title" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            <Bell counts={counts} />
            <button
              className="cc-cmdk cc-rail-toggle"
              onClick={() => setRailCollapsed((value) => !value)}
              aria-label={railCollapsed ? "Udvid navigation" : "Skjul navigationstekst"}
              aria-pressed={railCollapsed}
              title={railCollapsed ? "Udvid navigation" : "Skjul navigationstekst"}
            >
              <Icon name={railCollapsed ? "Columns3" : "Columns2"} style={{ width: 14, height: 14 }} />
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

      <ChatDock counts={counts} />
    </div>
  );
}
