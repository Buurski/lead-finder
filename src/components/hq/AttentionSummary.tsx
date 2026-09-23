"use client";
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import AttentionPanel, { ATTENTION_KIND_ICON } from "@/components/shell/AttentionPanel";
import type { AttentionItem } from "@/lib/hq/attention";
import "@/components/shell/attention.css";

// HQ-forsidens "Kræver dig": de 3 øverste haster-punkter, øverst på siden.
// Genbruger AttentionPanel (samme komponent som klokken) til "Se alle".
// Ingen haster-punkter → intet at vise, sektionen udelades helt.
export default function AttentionSummary({ items }: { items: AttentionItem[] }) {
  const [open, setOpen] = useState(false);
  const haster = items.filter((i) => i.level === "haster");
  if (haster.length === 0) return null;
  const top = haster.slice(0, 3);

  return (
    <div className="hq-attn-summary cc-card cc-card-pad">
      <div className="hq-attn-summary-head">
        <span className="hq-section-label" style={{ margin: 0 }}>Kræver dig</span>
        <button type="button" className="cc-btn" onClick={() => setOpen(true)}>
          Se alle{haster.length > 3 ? ` (${haster.length})` : ""}
        </button>
      </div>
      <div className="hq-attn-summary-list">
        {top.map((it, i) => (
          <Link key={i} href={it.href} className="cc-navlink">
            <Icon name={ATTENTION_KIND_ICON[it.kind]} />
            <span>{it.text}</span>
          </Link>
        ))}
      </div>
      <AttentionPanel items={items} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
