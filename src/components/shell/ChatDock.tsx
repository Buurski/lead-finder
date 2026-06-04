"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

interface DockCounts {
  queue?: number;
  needs?: number;
}

// The contextual chat widget. Two modes:
//   Chat        — talk to Claude (composer is live in Fase B; here it explains itself).
//   Control Room — shows what the widget can currently "see" on screen.
// Fase A is read-only: nothing is sent. The composer is intentionally disabled
// with an honest note rather than a fake input.
export default function ChatDock({ counts }: { counts: DockCounts }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "control">("control");
  const pathname = usePathname();

  if (!open) {
    return (
      <button className="cc-chatdock-fab" onClick={() => setOpen(true)} aria-label="Åbn chat / control room">
        <Icon name="MessageSquare" style={{ width: 17, height: 17 }} />
        Spørg Claude
      </button>
    );
  }

  return (
    <div className="cc-chatdock cc-fade" role="dialog" aria-label="Chat og Control Room">
      <div className="cc-chatdock-head">
        <div className="cc-chatdock-toggle" role="tablist">
          <button role="tab" aria-selected={mode === "chat"} data-active={mode === "chat"} onClick={() => setMode("chat")}>
            Chat
          </button>
          <button role="tab" aria-selected={mode === "control"} data-active={mode === "control"} onClick={() => setMode("control")}>
            Control Room
          </button>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Luk"
          style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}
        >
          <Icon name="X" style={{ width: 16, height: 16 }} />
        </button>
      </div>

      <div className="cc-chatdock-body">
        {mode === "chat" ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0 }}>
              Her taler du med Claude om det du kigger på. Skrive-feltet tændes i Fase B,
              hvor knappen kan køre rigtige handlinger (dry-run, bekræft, toast).
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["Hvad kræver mig nu?", "Resumér køen", "Hvem skal følges op?"].map((s) => (
                <span key={s} className="cc-chip" style={{ cursor: "default" }}>{s}</span>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            <div className="cc-kicker">Hvad jeg kan se lige nu</div>
            <Row label="Skærm" value={pathname === "/" ? "Mission Control" : pathname} />
            <Row label="Drafts i kø" value={counts.queue != null ? String(counts.queue) : "—"} />
            <Row label="Kræver dig" value={counts.needs != null ? String(counts.needs) : "—"} />
            <p style={{ margin: "4px 0 0", color: "var(--text-dim)", fontSize: 12 }}>
              Live data-binding udvides i Fase C, så widget&apos;en kan handle på det viste.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ color: "var(--text)", fontWeight: 500, textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}
