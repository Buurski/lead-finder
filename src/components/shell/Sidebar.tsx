"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_PRIMARY, NAV_MORE, isRailActive } from "@/lib/nav-config";
import Icon from "./Icon";

interface Counts {
  queue?: number;
}

// Bundbar-genveje (mobil, <768px): kun de 3 vigtigste + "Mere", som åbner et
// ark med hele IA'en. Opgaver er den daglige arbejdsløkke for begge ejere og
// har erstattet Pipeline her (Pipeline er stadig i railen og i "Mere").
const BOTTOMBAR_HREFS = ["/", "/opgaver", "/approve"];

function RailItem({ item, active, badge }: { item: (typeof NAV_PRIMARY)[number]; active: boolean; badge?: number }) {
  return (
    <Link
      href={item.href}
      className="cc-rail-item cc-focus"
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-label={item.label}
      title={item.label}
    >
      <Icon name={item.icon} />
      {!!badge && <span className="cc-rail-badge">{badge > 99 ? "99+" : badge}</span>}
    </Link>
  );
}

function SheetItem({ item, active, badge, onNavigate }: { item: { href: string; label: string; icon: string }; active: boolean; badge?: number; onNavigate: () => void }) {
  return (
    <Link href={item.href} className="cc-mobile-sheet-item cc-focus" data-active={active} aria-current={active ? "page" : undefined} onClick={onNavigate}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
      {!!badge && <span className="cc-count">{badge}</span>}
    </Link>
  );
}

// Dark icon-rail (desktop, fuld højde, sticky) — bliver til en bundbar +
// "Mere"-ark på mobil (spec §4/§5, mockup-rettelse 1).
export default function Sidebar({ counts, user }: { counts: Counts; user?: string }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Esc lukker "Mere"-arket.
  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const queue = counts.queue;

  return (
    <>
      {/* --- desktop rail ------------------------------------------------ */}
      <aside className="cc-rail" aria-label="Hovednavigation">
        <div className="cc-rail-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/kinly-mark-rail.svg" alt="Kinly" draggable={false} />
        </div>
        <nav className="cc-rail-nav" aria-label="Primær navigation">
          {NAV_PRIMARY.map((item) => (
            <RailItem
              key={item.href}
              item={item}
              active={isRailActive(pathname, item.href)}
              badge={item.badge === "queue" ? queue : undefined}
            />
          ))}
        </nav>
        <div className="cc-rail-spacer" />
        <Link
          href="/settings"
          className="cc-rail-avatar"
          style={{ textDecoration: "none" }}
          title="Indstillinger — konto, adgangskode og log ud"
          aria-label="Indstillinger — konto og log ud"
        >
          {user === "lucas" ? "LB" : user === "charlie" ? "CN" : "K"}
        </Link>
      </aside>

      {/* --- mobile bottom bar --------------------------------------------- */}
      <nav className="cc-bottombar" aria-label="Hovednavigation, mobil">
        {NAV_PRIMARY.filter((i) => BOTTOMBAR_HREFS.includes(i.href)).map((item) => (
          <Link key={item.href} href={item.href} data-active={isRailActive(pathname, item.href)} aria-current={isRailActive(pathname, item.href) ? "page" : undefined}>
            <Icon name={item.icon} />
            {item.href === "/" ? "HQ" : item.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen} aria-label="Vis hele menuen">
          <Icon name="MoreHorizontal" />
          Mere
        </button>
      </nav>

      {/* --- mobile "Mere"-ark: hele IA'en ---------------------------------- */}
      {moreOpen && (
        <>
          <div className="cc-mobile-sheet-backdrop" role="presentation" onClick={() => setMoreOpen(false)} />
          <div className="cc-mobile-sheet" role="dialog" aria-modal="true" aria-label="Hele menuen">
            <div className="cc-mobile-sheet-handle" aria-hidden="true" />
            <div className="cc-mobile-sheet-head">
              <h2>Menu</h2>
              <button type="button" className="cc-mobile-sheet-close cc-focus" onClick={() => setMoreOpen(false)} aria-label="Luk menu">
                <Icon name="X" style={{ width: 15, height: 15 }} />
              </button>
            </div>
            <div className="cc-mobile-sheet-group">
              {NAV_PRIMARY.map((item) => (
                <SheetItem
                  key={item.href}
                  item={item}
                  active={isRailActive(pathname, item.href)}
                  badge={item.badge === "queue" ? queue : undefined}
                  onNavigate={() => setMoreOpen(false)}
                />
              ))}
            </div>
            <div className="cc-mobile-sheet-divider" />
            <div className="cc-mobile-sheet-group">
              {NAV_MORE.map((item) => (
                <SheetItem key={item.href} item={item} active={isRailActive(pathname, item.href)} onNavigate={() => setMoreOpen(false)} />
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
