"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";

interface Counts {
  queue?: number;
  needs?: number;
}

// Notifikations-klokke i topbaren (Bundle G): viser summen af ubehandlede
// drafts + svar-der-kraever-dig paa tvaers af kanaler. Dataen er den samme
// deck-summary som sidebar-badges bruger, saa de kan aldrig drifte.
export default function Bell({ counts }: { counts: Counts }) {
  const [open, setOpen] = useState(false);

  // Esc lukker dropdownen (tastatur-brugere forventer det; backdrop-klik
  // dækker kun mus). stopPropagation ikke nødvendig — AppShell's Esc-handler
  // lukker kun shortcuts-overlayet.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const queue = counts.queue ?? 0;
  const needs = counts.needs ?? 0;
  const total = queue + needs;

  return (
    <div style={{ position: "relative" }}>
      <button
        className="cc-cmdk"
        onClick={() => setOpen((v) => !v)}
        aria-label={total > 0 ? `${total} ting venter` : "Ingen ventende ting"}
        aria-expanded={open}
        style={{ paddingLeft: 10, paddingRight: 10, position: "relative" }}
      >
        <Icon name="Bell" style={{ width: 15, height: 15 }} />
        {total > 0 && (
          <span
            style={{
              position: "absolute", top: -4, right: -4,
              minWidth: 16, height: 16, padding: "0 4px",
              display: "grid", placeItems: "center",
              borderRadius: 999, fontSize: 10, fontWeight: 700,
              background: "var(--accent)", color: "#fff",
            }}
          >
            {total}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            role="presentation"
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 45 }}
          />
          <div
            className="cc-card"
            role="menu"
            aria-label="Ventende ting"
            style={{
              position: "absolute", right: 0, top: "calc(100% + 8px)", zIndex: 46,
              width: 250, padding: 8, display: "grid", gap: 2,
              boxShadow: "0 8px 28px oklch(24% 0.02 70 / 0.14)",
            }}
          >
            {total === 0 && (
              <div className="cc-dim" style={{ fontSize: 13, padding: "8px 10px" }}>
                Alt er behandlet. Ingen ventende drafts eller svar.
              </div>
            )}
            {queue > 0 && (
              <Link href="/approve" className="cc-navlink" onClick={() => setOpen(false)}>
                <Icon name="CheckCheck" />
                <span>{queue} {queue === 1 ? "draft venter" : "drafts venter"}</span>
                <span className="cc-count">{queue}</span>
              </Link>
            )}
            {needs > 0 && (
              <Link href="/replies" className="cc-navlink" onClick={() => setOpen(false)}>
                <Icon name="Inbox" />
                <span>{needs} {needs === 1 ? "svar kræver dig" : "svar kræver dig"}</span>
                <span className="cc-count">{needs}</span>
              </Link>
            )}
          </div>
        </>
      )}
    </div>
  );
}
