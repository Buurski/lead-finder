"use client";
import { useEffect } from "react";
import Link from "next/link";
import Icon from "./Icon";
import type { AttentionItem } from "@/lib/hq/attention";
import "./attention.css";

// Delt mellem Bell (topbar, alle sider) og HQ-forsidens "Kræver dig"-liste —
// samme panel, to steder det kan åbnes fra (se rul 4 i opgavens regler).
export const ATTENTION_KIND_ICON: Record<AttentionItem["kind"], string> = {
  opgave: "ListChecks",
  svar: "Inbox",
  kladde: "CheckCheck",
  preview: "LayoutGrid",
  faktura: "Receipt",
  kunde: "Building2",
};

export default function AttentionPanel({
  items,
  open,
  onClose,
}: {
  items: AttentionItem[];
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const haster = items.filter((i) => i.level === "haster");
  const obs = items.filter((i) => i.level === "obs");

  return (
    <>
      <div className="cc-attn-backdrop" role="presentation" onClick={onClose} />
      <div className="cc-attn-sheet" role="dialog" aria-modal="true" aria-label="Hvad kræver din opmærksomhed">
        <div className="cc-attn-head">
          <h2>Kræver dig</h2>
          <button type="button" className="cc-mobile-sheet-close cc-focus" onClick={onClose} aria-label="Luk">
            <Icon name="X" style={{ width: 16, height: 16 }} />
          </button>
        </div>
        <div className="cc-attn-body">
          {items.length === 0 && (
            <div className="cc-dim" style={{ fontSize: 13, padding: "8px 4px" }}>
              Intet kræver dig lige nu.
            </div>
          )}
          {haster.length > 0 && (
            <>
              <div className="cc-palette-group-label">Haster</div>
              {haster.map((it, i) => (
                <Link key={`h${i}`} href={it.href} className="cc-navlink" data-level="haster" onClick={onClose}>
                  <Icon name={ATTENTION_KIND_ICON[it.kind]} />
                  <span>{it.text}</span>
                </Link>
              ))}
            </>
          )}
          {obs.length > 0 && (
            <>
              <div className="cc-palette-group-label">Til opfølgning</div>
              {obs.map((it, i) => (
                <Link key={`o${i}`} href={it.href} className="cc-navlink" data-level="obs" onClick={onClose}>
                  <Icon name={ATTENTION_KIND_ICON[it.kind]} />
                  <span>{it.text}</span>
                </Link>
              ))}
            </>
          )}
        </div>
      </div>
    </>
  );
}
