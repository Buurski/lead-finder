"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_FLAT } from "@/lib/nav-config";
import Icon from "./Icon";

// ⌘K / Ctrl+K command palette. Keyboard-first: type to filter, ↑/↓ to move,
// Enter to navigate, Esc to close. Mounted only while open (by AppShell), so its
// initial state is the reset state — no reset effects needed.
export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return NAV_FLAT;
    return NAV_FLAT.filter(
      (i) => i.label.toLowerCase().includes(term) || (i.hint ?? "").toLowerCase().includes(term)
    );
  }, [q]);

  // Focus the input once on mount (DOM side effect only — no setState).
  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

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
      setIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = results[idx];
      if (item) go(item.href);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div className="cc-palette-backdrop" onMouseDown={onClose} role="presentation">
      <div
        className="cc-palette cc-fade"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Kommando-palette"
      >
        <input
          ref={inputRef}
          className="cc-palette-input"
          placeholder="Hop til…  (skriv for at søge)"
          value={q}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Søg i navigation"
        />
        <div className="cc-palette-list" role="listbox">
          {results.length === 0 && <div className="cc-palette-empty">Ingen match for “{q}”.</div>}
          {results.map((item, i) => (
            <div
              key={item.href}
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
          ))}
        </div>
      </div>
    </div>
  );
}
