"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { NAV_TREE, type NavItem, type NavNode } from "@/lib/nav-config";
import Icon from "./Icon";

interface Counts {
  queue?: number;
  needs?: number;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function groupIsActive(pathname: string, node: NavNode): boolean {
  return (node.children ?? []).some((c) => isActive(pathname, c.href));
}

function countFor(item: NavItem, counts: Counts): number | undefined {
  return item.badge === "queue" ? counts.queue : item.badge === "needs" ? counts.needs : undefined;
}

function NavLeaf({
  item,
  counts,
  pathname,
  onNavigate,
  child,
}: {
  item: NavItem;
  counts: Counts;
  pathname: string;
  onNavigate?: () => void;
  child?: boolean;
}) {
  const active = isActive(pathname, item.href);
  const count = countFor(item, counts);
  return (
    <Link
      href={item.href}
      className={`cc-navlink cc-focus${child ? " cc-navchild" : ""}`}
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
  // Accordion state — user toggles persist; the group holding the active route
  // opens automatically on navigation (never force-closes the others).
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const node of NAV_TREE) if (node.children && groupIsActive(pathname, node)) s.add(node.label);
    return s;
  });

  useEffect(() => {
    setOpenGroups((prev) => {
      let next: Set<string> | null = null;
      for (const node of NAV_TREE) {
        if (node.children && groupIsActive(pathname, node) && !prev.has(node.label)) {
          next = next ?? new Set(prev);
          next.add(node.label);
        }
      }
      return next ?? prev;
    });
  }, [pathname]);

  function toggle(label: string) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <aside className="cc-sidebar" data-open={open} aria-label="Hovednavigation">
      <div className="cc-brand">
        <svg width="30" height="30" viewBox="0 0 64 64" aria-hidden style={{ flexShrink: 0 }}>
          <rect x="8" y="24" width="22" height="28" rx="7" fill="var(--accent-ink)" />
          <rect x="35.75" y="25.75" width="18.5" height="24.5" rx="5.5" fill="none" stroke="var(--text)" strokeWidth="3.5" />
          <circle cx="32" cy="12.5" r="5" fill="#C8A97E" />
        </svg>
        <span>
          <span className="cc-brand-name">AgenticOS</span>
          <span className="cc-brand-sub" style={{ display: "block" }}>Command Center</span>
        </span>
      </div>

      <nav className="cc-navgroup" aria-label="Navigation">
        {NAV_TREE.map((node) => {
          if (!node.children) {
            return <NavLeaf key={node.href} item={node} counts={counts} pathname={pathname} onNavigate={onNavigate} />;
          }
          const expanded = openGroups.has(node.label);
          const active = groupIsActive(pathname, node);
          const count = countFor(node, counts);
          return (
            <div key={node.label}>
              <button
                type="button"
                className="cc-navlink cc-focus cc-navparent"
                data-active={active && !expanded}
                aria-expanded={expanded}
                onClick={() => toggle(node.label)}
              >
                <Icon name={node.icon} />
                <span>{node.label}</span>
                {!expanded && count ? <span className="cc-count">{count}</span> : null}
                <Icon name="ChevronDown" className="cc-chevron" data-open={expanded} />
              </button>
              {expanded && (
                <div className="cc-navchildren">
                  {node.children.map((item, i) => (
                    <NavLeaf
                      key={`${item.href}-${i}`}
                      item={item}
                      counts={counts}
                      pathname={pathname}
                      onNavigate={onNavigate}
                      child
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

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
