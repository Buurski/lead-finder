"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/shell/Icon";
import MarkdownLite from "@/components/shell/MarkdownLite";
import type { HermesCronJob, HermesMessage, HermesProfile, HermesSessionMeta } from "@/lib/hermes";

interface Health {
  configured: boolean;
  reachable: boolean;
  gatewayRunning: boolean;
  cronJobs: number;
}

const PROFILES: { id: HermesProfile; label: string; hint: string }[] = [
  { id: "default", label: "Hjernen", hint: "Agentic OS — cron, dreaming, ideer" },
  { id: "lucas", label: "Lucas", hint: "Din egen historik og memory" },
  { id: "charlie", label: "Charlie", hint: "Charlies historik — simple forklaringer" },
];

const QUICK: string[] = [
  "Hvad skal jeg fokusere på i dag?",
  "Hvad fandt du i nattens dream?",
  "Status på systemet?",
];

function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export default function HermesClient({
  initialHealth,
  initialJobs,
  dream,
}: {
  initialHealth: Health;
  initialJobs: HermesCronJob[];
  dream: { path: string; body: string } | null;
}) {
  const [profile, setProfile] = useState<HermesProfile>("lucas");
  const [sessionId, setSessionId] = useState<string>(newSessionId);
  const [msgs, setMsgs] = useState<HermesMessage[]>([]);
  const [sessions, setSessions] = useState<HermesSessionMeta[]>([]);
  const [jobs, setJobs] = useState<HermesCronJob[]>(initialJobs);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cronBusy, setCronBusy] = useState<string | null>(null);
  const [dreamOpen, setDreamOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const offline = !initialHealth.configured || !initialHealth.reachable;

  useEffect(() => {
    fetch(`/api/hermes/sessions?profile=${profile}`)
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {});
  }, [profile, sending]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, sending]);

  function startNewSession(p?: HermesProfile) {
    if (p) setProfile(p);
    setSessionId(newSessionId());
    setMsgs([]);
  }

  async function openSession(meta: HermesSessionMeta) {
    setProfile(meta.profile);
    setSessionId(meta.id);
    try {
      const d = await fetch(`/api/hermes/sessions?id=${meta.id}`).then((r) => r.json());
      setMsgs(d.messages ?? []);
    } catch {
      setMsgs([]);
    }
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    const now = new Date().toISOString();
    setMsgs((m) => [...m, { role: "you", text: q, ts: now }]);
    setSending(true);
    try {
      const res = await fetch("/api/hermes/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, profile, sessionId }),
      });
      const d = await res.json().catch(() => ({}));
      const reply = d.ok ? d.reply : `⚠ ${d.error ?? "Hermes svarede ikke"}`;
      setMsgs((m) => [...m, { role: "hermes", text: reply, ts: new Date().toISOString() }]);
    } catch {
      setMsgs((m) => [...m, { role: "hermes", text: "⚠ Kunne ikke nå serveren — prøv igen.", ts: new Date().toISOString() }]);
    } finally {
      setSending(false);
    }
  }

  async function cronAction(id: string, action: "run" | "pause" | "resume") {
    setCronBusy(id);
    try {
      await fetch("/api/hermes/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const d = await fetch("/api/hermes/cron").then((r) => r.json());
      setJobs(d.jobs ?? []);
    } catch {
      /* keep old list */
    } finally {
      setCronBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 300px", gap: 18, alignItems: "start" }}>
      {/* ---- left: chat ---- */}
      <section className="cc-card" style={{ display: "flex", flexDirection: "column", minHeight: 540 }}>
        <div style={{ display: "flex", gap: 6, padding: "12px 14px", borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
          {PROFILES.map((p) => (
            <button
              key={p.id}
              className="cc-chip"
              title={p.hint}
              onClick={() => startNewSession(p.id)}
              style={{
                cursor: "pointer",
                border: "none",
                background: profile === p.id ? "var(--accent-soft)" : "var(--bg-3)",
                color: profile === p.id ? "var(--accent-ink)" : "var(--text-muted)",
                fontWeight: profile === p.id ? 600 : 400,
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            className="cc-btn"
            style={{ marginLeft: "auto", fontSize: 12, padding: "4px 10px" }}
            onClick={() => startNewSession()}
          >
            + Ny samtale
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 9, minHeight: 0 }}>
          {offline && (
            <div className="cc-card-pad" style={{ background: "var(--bg-3)", borderRadius: 10, fontSize: 13, color: "var(--text-muted)" }}>
              {initialHealth.configured
                ? "Hermes svarer ikke lige nu — tjek at VPS'en kører (hermes-api på port 8787)."
                : "HERMES_API_URL + HERMES_API_SECRET mangler i miljøet. Sæt dem, så er chatten live."}
            </div>
          )}
          {msgs.length === 0 && !offline && (
            <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
              Du skriver med <strong>{PROFILES.find((p) => p.id === profile)?.label}</strong>-profilen.
              Samme Hermes som på Telegram — kort dansk, ærligt, og den sender aldrig noget selv.
            </p>
          )}
          {msgs.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === "you" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: m.role === "you" ? "var(--accent-soft)" : "var(--bg-3)",
                color: "var(--text)",
                borderRadius: 10,
                padding: "8px 12px",
                fontSize: 13.5,
                whiteSpace: "pre-wrap",
                lineHeight: 1.55,
              }}
            >
              {m.text}
            </div>
          ))}
          {sending && (
            <div style={{ alignSelf: "flex-start", color: "var(--text-dim)", fontSize: 12.5 }}>
              Hermes tænker… (kan tage op til et minut)
            </div>
          )}
        </div>

        {msgs.length === 0 && !offline && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 10px" }}>
            {QUICK.map((s) => (
              <button key={s} className="cc-chip" style={{ cursor: "pointer", border: "none" }} onClick={() => send(s)} disabled={sending}>
                {s}
              </button>
            ))}
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          style={{ display: "flex", gap: 8, padding: 14, borderTop: "1px solid var(--border)" }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            placeholder={offline ? "Hermes er offline…" : "Skriv til Hermes… (Enter sender, Shift+Enter ny linje)"}
            disabled={sending || offline}
            rows={2}
            aria-label="Skriv til Hermes"
            style={{
              flex: 1,
              minWidth: 0,
              resize: "none",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "9px 12px",
              fontSize: 13.5,
              background: "var(--surface)",
              color: "var(--text)",
              fontFamily: "var(--font-body)",
            }}
          />
          <button type="submit" disabled={sending || offline || !input.trim()} className="cc-btn cc-btn-accent" style={{ padding: "0 16px" }}>
            Send
          </button>
        </form>
      </section>

      {/* ---- right: status, cron, sessions, dream ---- */}
      <div style={{ display: "grid", gap: 14 }}>
        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="cc-kicker">Status</div>
          <SideRow label="hermes-api" value={initialHealth.reachable ? "online" : "offline"} ok={initialHealth.reachable} />
          <SideRow label="Gateway (Telegram)" value={initialHealth.gatewayRunning ? "kører" : "stoppet"} ok={initialHealth.gatewayRunning} />
          <SideRow label="Cron jobs" value={String(initialHealth.cronJobs)} ok={initialHealth.cronJobs > 0} />
        </section>

        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
          <div className="cc-kicker">Cron jobs</div>
          {jobs.length === 0 && <div className="cc-dim" style={{ fontSize: 12.5 }}>Ingen jobs (eller Hermes offline).</div>}
          {jobs.map((j) => (
            <div key={j.id} style={{ display: "grid", gap: 4, paddingBottom: 8, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Icon name={j.state === "paused" ? "Pause" : "Clock"} style={{ width: 13, height: 13, color: "var(--text-dim)" }} />
                <span style={{ fontWeight: 600, fontSize: 13 }}>{j.name}</span>
                <span className="cc-dim" style={{ fontSize: 11.5, marginLeft: "auto" }}>{j.schedule_display}</span>
              </div>
              {j.last_status === "error" && (
                <div style={{ fontSize: 11.5, color: "var(--danger, #b4453a)" }}>
                  Sidste kørsel fejlede{j.last_error ? `: ${j.last_error.slice(0, 90)}` : ""}
                </div>
              )}
              {j.last_status === "success" && j.last_run_at && (
                <div className="cc-dim" style={{ fontSize: 11.5 }}>Sidst kørt OK · {j.last_run_at.slice(0, 16).replace("T", " ")}</div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                <button className="cc-btn" style={{ fontSize: 11.5, padding: "3px 9px" }} disabled={cronBusy === j.id} onClick={() => cronAction(j.id, "run")}>
                  Kør nu
                </button>
                <button
                  className="cc-btn"
                  style={{ fontSize: 11.5, padding: "3px 9px" }}
                  disabled={cronBusy === j.id}
                  onClick={() => cronAction(j.id, j.state === "paused" ? "resume" : "pause")}
                >
                  {j.state === "paused" ? "Genoptag" : "Pause"}
                </button>
              </div>
            </div>
          ))}
        </section>

        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="cc-kicker">Seneste samtaler · {PROFILES.find((p) => p.id === profile)?.label}</div>
          {sessions.length === 0 && <div className="cc-dim" style={{ fontSize: 12.5 }}>Ingen endnu.</div>}
          {sessions.slice(0, 8).map((s) => (
            <button
              key={s.id}
              onClick={() => openSession(s)}
              style={{
                textAlign: "left",
                background: s.id === sessionId ? "var(--accent-soft)" : "none",
                border: "none",
                borderRadius: 7,
                padding: "6px 8px",
                cursor: "pointer",
                color: "var(--text)",
                fontSize: 12.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {s.title || "(uden titel)"}
            </button>
          ))}
        </section>

        {dream && (
          <section className="cc-card cc-card-pad">
            <button
              onClick={() => setDreamOpen((o) => !o)}
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: 0, width: "100%", color: "var(--text)" }}
            >
              <Icon name="Moon" style={{ width: 14, height: 14, color: "var(--text-dim)" }} />
              <span className="cc-kicker" style={{ margin: 0 }}>Nattens dream</span>
              <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5 }}>{dreamOpen ? "skjul" : "vis"}</span>
            </button>
            {dreamOpen && (
              <div style={{ marginTop: 10, fontSize: 13 }}>
                <MarkdownLite source={dream.body.slice(0, 4000)} />
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function SideRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: "var(--text-dim)" }}>{label}</span>
      <span style={{ fontWeight: 500, color: ok ? "var(--accent-ink)" : "var(--text-muted)" }}>{value}</span>
    </div>
  );
}
