"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NAV_FLAT } from "@/lib/nav-config";
import Icon from "./Icon";

// ⌘K / Ctrl+K command palette. Keyboard-first: type to filter, ↑/↓ to move,
// Enter to navigate, Esc to close. Opens via the topbar button or the shortcut.
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
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

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      // Focus after paint so the modal is in the DOM.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  if (!open) return null;

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
          onChange={(e) => setQ(e.target.value)}
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
