"use client";
// Tekst + "Kopiér"-knap (med tegntæller, hvis der er et loft). Falder tilbage til execCommand, hvis clipboard-API'et er spærret.
import { useState } from "react";
import "./marketing.css";

export default function CopyField({ label, text, max }: { label: string; text: string; max?: number }) {
  const [done, setDone] = useState(false);
  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setDone(ok);
    if (ok) setTimeout(() => setDone(false), 1600);
  }
  const over = max !== undefined && text.length > max;
  return (
    <div className="mk-copy">
      <div className="mk-copy-head">
        <span className="mk-label">{label}</span>
        <span className="mk-row">
          {max !== undefined && <span className={`mk-small ${over ? "mk-err" : "mk-dim"}`}>{text.length} af {max} tegn</span>}
          <button type="button" className="cc-btn mk-btn-sm" onClick={copy} aria-label={`Kopiér ${label.toLowerCase()}`}>{done ? "Kopieret" : "Kopiér"}</button>
        </span>
      </div>
      <p className="mk-copy-text">{text}</p>
    </div>
  );
}
