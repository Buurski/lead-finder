"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface Classification {
  category: string;
  isInterested: boolean;
  becameClient: boolean;
  shouldStop: boolean;
  confidence: number;
  signals: string[];
}
interface ReplyRow {
  leadId: string;
  name: string;
  branch: string;
  city: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
  classification: Classification;
  suggestedReply: string;
  source: "ai" | "deterministic";
}

const CAT_LABEL: Record<string, string> = {
  interested: "Interesseret",
  question: "Spørgsmål",
  objection: "Indvending",
  "not-interested": "Ikke nu",
  "auto-reply": "Autosvar",
  "wrong-person": "Forkert person",
  unsubscribe: "Afmeld",
  other: "Andet",
};

function QaSendButton({ row }: { row: ReplyRow }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "dry" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function send() {
    setState("sending");
    setMsg("");
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(row.leadId)}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: row.suggestedReply, subject: row.subject, leadName: row.name, mode: "qa" }),
      });
      const d = await res.json();
      if (d.sent) { setState("done"); setMsg("QA-kopi sendt til buur.aigro."); }
      else if (d.wouldSendTo) { setState("dry"); setMsg("Ingen mail-creds her — ville sende QA-kopi til buur.aigro."); }
      else { setState("error"); setMsg(d.error ?? "Kunne ikke sende."); }
    } catch (e) {
      setState("error");
      setMsg(String(e));
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button className="cc-btn" onClick={send} disabled={state === "sending" || state === "done"}>
        <Icon name="Mail" style={{ width: 14, height: 14 }} />
        {state === "sending" ? "Sender…" : state === "done" ? "Sendt ✓" : "Send QA-kopi til mig"}
      </button>
      {msg && <span className="cc-dim" style={{ fontSize: 12, color: state === "error" ? "var(--red)" : "var(--text-dim)" }}>{msg}</span>}
    </div>
  );
}

function catTone(c: string): { bg: string; fg: string } {
  if (c === "interested") return { bg: "var(--accent-soft)", fg: "var(--accent-ink)" };
  if (c === "question") return { bg: "var(--blue-dim)", fg: "var(--blue)" };
  if (c === "objection") return { bg: "var(--amber-dim)", fg: "var(--amber)" };
  if (c === "not-interested" || c === "unsubscribe" || c === "wrong-person") return { bg: "var(--red-dim)", fg: "var(--red)" };
  return { bg: "var(--bg-3)", fg: "var(--text-muted)" };
}

export default function RepliesClient() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [rows, setRows] = useState<ReplyRow[]>([]);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/replies")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok === false) {
          setErr(d.error ?? "ukendt fejl");
          setState("error");
          setRows([]);
          return;
        }
        setRows(d.replies ?? []);
        setState("ok");
      })
      .catch((e) => {
        if (!alive) return;
        setErr(String(e));
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "loading") {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="cc-skel" style={{ height: 76 }} />
        ))}
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Icon name="Activity" style={{ width: 18, height: 18, color: "var(--amber)" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Kunne ikke nå indbakken</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{err} — read-only scan, intet blev rørt.</div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="cc-card">
        <div className="cc-empty">
          <Icon name="Inbox" />
          <div>Ingen svar at triagere lige nu.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Indkommende svar på kolde mails dukker op her, for-klassificeret.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {rows.map((r) => {
        const tone = catTone(r.classification.category);
        const isOpen = open === r.leadId;
        return (
          <section key={r.leadId} className="cc-card">
            <button
              onClick={() => setOpen(isOpen ? null : r.leadId)}
              aria-expanded={isOpen}
              className="cc-focus"
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "15px 20px", display: "flex", alignItems: "center", gap: 12 }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14.5 }}>{r.name}</span>
                  {r.classification.becameClient && (
                    <span className="cc-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>blev klient</span>
                  )}
                </div>
                <div className="cc-dim" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {r.subject} · {r.preview}
                </div>
              </div>
              <span className="cc-chip" style={{ background: tone.bg, color: tone.fg }}>
                {CAT_LABEL[r.classification.category] ?? r.classification.category}
              </span>
              <Icon name="ChevronRight" style={{ width: 16, height: 16, color: "var(--text-dim)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 140ms ease" }} />
            </button>

            {isOpen && (
              <div className="cc-fade" style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", display: "grid", gap: 14 }}>
                <div>
                  <div className="cc-kicker" style={{ marginBottom: 6 }}>Deres besked</div>
                  <p className="cc-muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{r.preview}</p>
                </div>
                <div>
                  <div className="cc-kicker" style={{ marginBottom: 6 }}>Foreslået svar ({r.source === "ai" ? "AI" : "skabelon"})</div>
                  {r.suggestedReply ? (
                    <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10 }}>{r.suggestedReply}</p>
                  ) : (
                    <p className="cc-dim" style={{ fontSize: 13, margin: 0 }}>Intet svar foreslået (fx autosvar).</p>
                  )}
                </div>
                {r.suggestedReply && <QaSendButton row={r} />}
                <div className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="CircleDot" style={{ width: 13, height: 13 }} />
                  QA-kopi går kun til buur.aigro. Rigtigt svar til kunden + status-skift er din egen handling.
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
