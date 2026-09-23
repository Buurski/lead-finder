"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_FLAT } from "@/lib/nav-config";
import { readRecentCompanies } from "@/lib/recent-companies";
import Icon from "./Icon";
import "./command-palette.css";

interface SearchHit { id: string; title: string; subtitle: string; href: string }
interface SearchGroup { label: string; items: SearchHit[] }

interface PaletteItem {
  key: string;
  href: string;
  icon: string;
  label: string;
  hint?: string;
}
interface PaletteSection {
  label: string;
  items: PaletteItem[];
}

const GROUP_ICON: Record<string, string> = {
  Virksomheder: "Building2",
  Kontakter: "Phone",
  Aftaler: "Briefcase",
  Fakturaer: "Receipt",
};

// ⌘K / Ctrl+K command palette. Søger både i navigation (instant, client-side)
// og i data (⌘K + fase 3: virksomheder/kontakter/aftaler/fakturaer via
// /api/soeg, debounced 150 ms). Tastatur: ↑/↓ flytter gennem den samlede
// (grupperede) liste, Enter navigerer, Esc lukker. Mounted only while open (by
// AppShell), så starttilstanden altid er reset — ingen reset-effekter nødvendige.
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [dataGroups, setDataGroups] = useState<SearchGroup[]>([]);
  // Lazy initializer (ikke en effekt): kører kun ved client-mount — paletten
  // mountes først når den åbnes, så der er intet SSR-localStorage-problem.
  const [recent] = useState(() => readRecentCompanies());
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const term = q.trim();

  const navMatches = useMemo(() => {
    if (!term) return [];
    const t = term.toLowerCase();
    return NAV_FLAT.filter((i) => i.label.toLowerCase().includes(t) || (i.hint ?? "").toLowerCase().includes(t));
  }, [term]);

  // Data-søgningen debounces; navigations-søgningen er instant (ren client-filter ovenfor).
  useEffect(() => {
    // Tom forespørgsel: intet at hente. `sections` læser aldrig dataGroups når
    // term er tom, så gamle resultater fra en tidligere søgning er uskadelige
    // at lade stå (og undgår en synkron setState her).
    if (!term) return;
    if (debounce.current) clearTimeout(debounce.current);
    const ctrl = new AbortController();
    debounce.current = setTimeout(() => {
      fetch(`/api/soeg?q=${encodeURIComponent(term)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((groups: SearchGroup[]) => setDataGroups(Array.isArray(groups) ? groups : []))
        .catch(() => {});
    }, 150);
    return () => { if (debounce.current) clearTimeout(debounce.current); ctrl.abort(); };
  }, [term]);

  const sections: PaletteSection[] = useMemo(() => {
    if (!term) {
      const out: PaletteSection[] = [];
      if (recent.length) {
        out.push({
          label: "Seneste",
          items: recent.map((c) => ({ key: `recent:${c.id}`, href: `/virksomheder/${c.id}`, icon: "Building2", label: c.name })),
        });
      }
      out.push({
        label: "Genveje",
        items: NAV_FLAT.map((i) => ({ key: i.href, href: i.href, icon: i.icon, label: i.label, hint: i.hint })),
      });
      return out;
    }
    const out: PaletteSection[] = [];
    if (navMatches.length) {
      out.push({ label: "Sider", items: navMatches.map((i) => ({ key: i.href, href: i.href, icon: i.icon, label: i.label, hint: i.hint })) });
    }
    for (const g of dataGroups) {
      out.push({
        label: g.label,
        items: g.items.map((h) => ({ key: `${g.label}:${h.id}`, href: h.href, icon: GROUP_ICON[g.label] ?? "Search", label: h.title, hint: h.subtitle })),
      });
    }
    return out;
  }, [term, navMatches, dataGroups, recent]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  function onQueryChange(value: string) {
    setQ(value);
    setIdx(0); // keep selection valid as the result set changes
  }

  function go(href: string) {
    router.push(href);
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = flat[idx];
      if (item) go(item.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  let cursor = -1;

  return (
    <div className="cc-palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="cc-palette cc-fade"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Søg og naviger"
      >
        <input
          ref={inputRef}
          className="cc-palette-input"
          placeholder="Søg virksomheder, aftaler, fakturaer… eller hop til en side"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Søg"
        />
        <div className="cc-palette-list" role="listbox">
          {sections.length === 0 && <div className="cc-palette-empty">Ingen match for “{q}”.</div>}
          {sections.map((s) => (
            <div key={s.label}>
              <div className="cc-palette-group-label">{s.label}</div>
              {s.items.map((item) => {
                cursor += 1;
                const i = cursor;
                return (
                  <div
                    key={item.key}
                    className="cc-palette-item"
                    data-active={i === idx}
                    role="option"
                    aria-selected={i === idx}
                    onMouseEnter={() => setIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      go(item.href);
                    }}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {item.hint && <span className="cc-palette-hint">{item.hint}</span>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
