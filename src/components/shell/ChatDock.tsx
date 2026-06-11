"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { NAV_FLAT } from "@/lib/nav-config";
import Icon from "./Icon";

interface DockCounts {
  queue?: number;
  needs?: number;
}

// Map a route to its human nav label ("/leads" -> "Leads") so the Control Room
// shows a friendly screen name, not a raw path.
function screenLabel(pathname: string): string {
  if (pathname === "/") return "Mission Control";
  return NAV_FLAT.find((i) => i.href === pathname)?.label ?? pathname;
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

  // Escape closes the dock (a11y: a dialog must be dismissible from the keyboard,
  // not only via the X button).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  interface ChatAction { type: string; args: Record<string, unknown>; label: string }
  interface Msg { role: "you" | "claude"; text: string; action?: ChatAction; resolved?: boolean }
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    setMsgs((m) => [...m, { role: "you", text: q }]);
    setSending(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, screen: screenLabel(pathname), queue: counts.queue, needs: counts.needs }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.action) {
        setMsgs((m) => [...m, { role: "claude", text: data.humanText || data.action.label, action: data.action }]);
      } else {
        setMsgs((m) => [...m, { role: "claude", text: data.reply || "Noget gik galt — prøv igen." }]);
      }
    } catch {
      setMsgs((m) => [...m, { role: "claude", text: "Kunne ikke nå serveren — prøv igen." }]);
    } finally {
      setSending(false);
    }
  }

  // Confirmed an action proposal → call the matching endpoint, replace the bubble.
  async function confirmAction(idx: number, action: ChatAction) {
    setMsgs((m) => m.map((mm, i) => (i === idx ? { ...mm, resolved: true } : mm)));
    // Unapprove-draft routes til den eksisterende godkendelse-API (anden form
    // end actions/*). Alt andet bruger /api/actions/<type>.
    let url: string;
    let payload: Record<string, unknown> = action.args;
    let okMsg: string | null = null;
    if (action.type === "unapprove-draft") {
      url = "/api/approve/queue";
      const argId = (action.args as { draftId?: unknown }).draftId;
      const argName = (action.args as { leadName?: unknown }).leadName;
      payload = { id: typeof argId === "string" ? argId : "", action: "unapprove" };
      okMsg = `Fjernet "${typeof argName === "string" ? argName : "lead"}" fra godkendt-listen. Blokeret i 14 dage.`;
    } else if (action.type === "note") {
      url = "/api/actions/note";
    } else if (action.type === "suppress") {
      url = "/api/actions/suppress";
    } else {
      url = "/api/actions/mark-lead";
    }
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      const ok = res.ok && (d.ok !== false);
      const successText = okMsg ?? d.message ?? "Udført.";
      setMsgs((m) => [...m, { role: "claude", text: ok ? `✓ ${successText}` : `Kunne ikke: ${d.error || "fejl"}` }]);
    } catch {
      setMsgs((m) => [...m, { role: "claude", text: "Kunne ikke nå serveren — prøv igen." }]);
    }
  }
  function cancelAction(idx: number) {
    setMsgs((m) => m.map((mm, i) => (i === idx ? { ...mm, resolved: true } : mm)));
    setMsgs((m) => [...m, { role: "claude", text: "Annulleret." }]);
  }

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
          <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%", minHeight: 0 }}>
            {msgs.length === 0 ? (
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
                Spørg om dine leads, køen, svar eller det du kigger på. Jeg rådgiver — men sender og sletter intet.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", flex: 1, minHeight: 0 }}>
                {msgs.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === "you" ? "flex-end" : "flex-start", maxWidth: "85%", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div
                      style={{
                        background: m.role === "you" ? "var(--accent-soft)" : "var(--bg-3)",
                        color: "var(--text)",
                        borderRadius: 10,
                        padding: "8px 11px",
                        fontSize: 13,
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.5,
                      }}
                    >
                      {m.text}
                    </div>
                    {m.action && !m.resolved && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className="cc-btn cc-btn-accent" style={{ fontSize: 12, padding: "5px 11px" }} onClick={() => confirmAction(i, m.action!)}>Bekræft</button>
                        <button className="cc-btn" style={{ fontSize: 12, padding: "5px 11px" }} onClick={() => cancelAction(i)}>Annullér</button>
                      </div>
                    )}
                  </div>
                ))}
                {sending && <div style={{ alignSelf: "flex-start", color: "var(--text-dim)", fontSize: 12.5 }}>Claude skriver…</div>}
              </div>
            )}
            {msgs.length === 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {["Hvad kræver mig nu?", "Resumér køen", "Hvem skal følges op?"].map((s) => (
                  <button key={s} className="cc-chip" style={{ cursor: "pointer", border: "none" }} onClick={() => send(s)} disabled={sending}>{s}</button>
                ))}
              </div>
            )}
            <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: "flex", gap: 6, marginTop: "auto" }}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Skriv til Claude…"
                disabled={sending}
                aria-label="Skriv til Claude"
                style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", fontSize: 13, background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-body)" }}
              />
              <button type="submit" disabled={sending || !input.trim()} className="cc-btn" style={{ padding: "0 14px" }}>Send</button>
            </form>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            <div className="cc-kicker">Hvad jeg kan se lige nu</div>
            <Row label="Skærm" value={screenLabel(pathname)} />
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
