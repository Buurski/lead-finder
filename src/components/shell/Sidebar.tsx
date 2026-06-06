"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav-config";
import Icon from "./Icon";

interface Counts {
  queue?: number;
  needs?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar({
  open,
  counts,
  onNavigate,
}: {
  open: boolean;
  counts: Counts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <aside className="cc-sidebar" data-open={open} aria-label="Hovednavigation">
      <div className="cc-brand">
        <span className="cc-brand-mark" aria-hidden style={{ display: "grid", placeItems: "center" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 10px var(--accent)", display: "block" }} />
        </span>
        <span>
          <span className="cc-brand-name">Command Center</span>
          <span className="cc-brand-sub" style={{ display: "block" }}>agentic OS</span>
        </span>
      </div>

      {NAV.map((group) => (
        <nav key={group.id} className="cc-navgroup" aria-label={group.label}>
          <div className="cc-navgroup-label">{group.label}</div>
          {group.items.map((item) => {
            const active = isActive(pathname, item.href);
            const count =
              item.badge === "queue" ? counts.queue : item.badge === "needs" ? counts.needs : undefined;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="cc-navlink cc-focus"
                data-active={active}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
              >
                <Icon name={item.icon} />
                <span>{item.label}</span>
                {item.soon && <span className="cc-soon">snart</span>}
                {!item.soon && count ? <span className="cc-count">{count}</span> : null}
              </Link>
            );
          })}
        </nav>
      ))}

      <div style={{ marginTop: "auto", paddingTop: 16 }}>
        <div className="cc-navgroup-label" style={{ paddingBottom: 2 }}>Status</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", color: "var(--text-dim)", fontSize: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} />
          read-only · ingen auto-send
        </div>
      </div>
    </aside>
  );
}
