"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "@/components/shell/Icon";
import MarkdownLite from "@/components/shell/MarkdownLite";
import type { HermesCronJob, HermesMessage, HermesProfile, HermesSessionMeta } from "@/lib/hermes";
import { fetchHermesCronRuns, type HermesCronJobWithRuns } from "@/lib/hermes-client";

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
  "Status på systemet?",
];

const DREAM_QUICK = "Hvad er det vigtigste fund fra nattens dream? Giv mig 3 konkrete næste skridt.";

function newSessionId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// Klip ved sidste afsnitsgrænse inden max, så markdown ikke knækker midt i
// en tabel/kodeblok.
function trimAtParagraph(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const brk = cut.lastIndexOf("\n\n");
  return (brk > max * 0.5 ? cut.slice(0, brk) : cut) + "\n\n*… (afkortet)*";
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
  const [jobsWithRuns, setJobsWithRuns] = useState<HermesCronJobWithRuns[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [cronBusy, setCronBusy] = useState<string | null>(null);
  const [cronError, setCronError] = useState<string | null>(null);
  const [dreamOpen, setDreamOpen] = useState(false);
  const [health, setHealth] = useState<Health>(initialHealth);
  const [healthChecking, setHealthChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const offline = !health.configured || !health.reachable;

  useEffect(() => {
    // Guard mod dobbelt-fetch: effekten kører både når sending → true og
    // → false; vi vil kun refetche når sendingen er FÆRDIG (ny titel klar).
    if (sending) return;
    fetch(`/api/hermes/sessions?profile=${profile}`)
      .then((r) => r.json())
      .then((d) => setSessions(d.sessions ?? []))
      .catch(() => {});
    // Hent seneste runs til cron-sektionen (client-safe: går via /api/hermes/cron/runs)
    fetchHermesCronRuns(5).then(setJobsWithRuns).catch(() => {});
  }, [profile, sending]);

  async function recheckHealth() {
    setHealthChecking(true);
    try {
      const d = await fetch("/api/hermes/status").then((r) => r.json());
      setHealth({
        configured: Boolean(d.configured),
        reachable: Boolean(d.reachable),
        gatewayRunning: Boolean(d.gatewayRunning),
        cronJobs: d.cronJobs ?? 0,
      });
    } catch {
      /* behold gammel status */
    } finally {
      setHealthChecking(false);
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs, sending]);

  function startNewSession(p?: HermesProfile) {
    if (sending) return; // skift ikke profil/session midt i et svar
    if (p) setProfile(p);
    setSessionId(newSessionId());
    setMsgs([]);
    setExportMsg(null);
  }

  async function exportSession() {
    if (exporting || msgs.length === 0) return;
    setExporting(true);
    setExportMsg(null);
    try {
      const res = await fetch("/api/hermes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const d = await res.json().catch(() => ({}));
      setExportMsg(d.ok ? `Gemt i vaulten: ${d.path}` : `⚠ ${d.error ?? "kunne ikke gemme"}`);
    } catch {
      setExportMsg("⚠ Kunne ikke nå serveren.");
    } finally {
      setExporting(false);
    }
  }

  async function openSession(meta: HermesSessionMeta) {
    if (sending) return;
    setProfile(meta.profile);
    setSessionId(meta.id);
    try {
      const d = await fetch(`/api/hermes/sessions?id=${meta.id}`).then((r) => r.json());
      setMsgs(d.messages ?? []);
    } catch {
      setMsgs([]);
    }
  }

  // Opdatér den sidste hermes-besked (bruges af streaming-deltas).
  function patchLastHermes(updater: (prev: string) => string) {
    setMsgs((m) => {
      const next = [...m];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === "hermes") {
          next[i] = { ...next[i], text: updater(next[i].text) };
          break;
        }
      }
      return next;
    });
  }

  async function send(text: string) {
    const q = text.trim();
    if (!q || sending) return;
    setInput("");
    const now = new Date().toISOString();
    setMsgs((m) => [...m, { role: "you", text: q, ts: now }]);
    setSending(true);
    try {
      // Streaming først — første token efter ~3s i stedet for 14-18s.
      const res = await fetch("/api/hermes/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, profile, sessionId }),
      });
      if (res.ok && res.body && (res.headers.get("content-type") ?? "").includes("event-stream")) {
        setMsgs((m) => [...m, { role: "hermes", text: "", ts: new Date().toISOString() }]);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let got = false;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (!event.startsWith("data: ")) continue;
            let obj: { text?: string; error?: string; done?: boolean };
            try {
              obj = JSON.parse(event.slice(6));
            } catch {
              continue;
            }
            if (typeof obj.text === "string" && obj.text) {
              got = true;
              const delta = obj.text;
              patchLastHermes((prev) => prev + delta);
            }
            if (obj.error) {
              got = true;
              const err = obj.error;
              patchLastHermes((prev) => prev || `⚠ ${err}`);
            }
          }
        }
        if (!got) patchLastHermes((prev) => prev || "⚠ Hermes svarede ikke — prøv igen.");
        return;
      }
      // Fallback: gammel blocking JSON-rute.
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
    setCronError(null);
    try {
      const res = await fetch("/api/hermes/cron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      const r = await res.json().catch(() => ({}));
      if (!res.ok || r?.ok === false) {
        setCronError(r?.error ?? `Handlingen fejlede (${res.status})`);
      }
      const d = await fetch("/api/hermes/cron").then((r2) => r2.json());
      setJobs(d.jobs ?? []);
    } catch {
      setCronError("Kunne ikke nå serveren — prøv igen.");
    } finally {
      setCronBusy(null);
    }
  }

  // Theme toggle
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem("hermes-theme") as "dark" | "light") || "dark";
  });
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-hermes-theme", theme);
      try { localStorage.setItem("hermes-theme", theme); } catch {}
    }
  }, [theme]);

  // Mobile drawer state
  const [drawer, setDrawer] = useState<"none" | "rail" | "sessions">("none");

  // Resizable sessions sidebar (desktop only)
  const [sessionsWidth, setSessionsWidth] = useState<number>(280);
  const draggingRef = useRef<{ startX: number; startW: number } | null>(null);

  function startResize(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = { startX: e.clientX, startW: sessionsWidth };
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const dx = ev.clientX - draggingRef.current.startX;
      const next = Math.min(480, Math.max(200, draggingRef.current.startW + dx));
      setSessionsWidth(next);
    };
    const onUp = () => {
      draggingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // Gruppér sessions efter dato
  function groupSessions(all: HermesSessionMeta[]): { label: string; items: HermesSessionMeta[] }[] {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const groups: Record<string, HermesSessionMeta[]> = { I_DAG: [], I_GAAR: [], AELDRE: [] };
    for (const s of all) {
      const d = new Date(s.updatedAt);
      if (isNaN(d.getTime())) { groups.AELDRE.push(s); continue; }
      if (d >= today) groups.I_DAG.push(s);
      else if (d >= yesterday) groups.I_GAAR.push(s);
      else groups.AELDRE.push(s);
    }
    return [
      { label: "I dag", items: groups.I_DAG },
      { label: "I går", items: groups.I_GAAR },
      { label: "Tidligere", items: groups.AELDRE },
    ].filter((g) => g.items.length > 0);
  }

  const sessionGroups = groupSessions(sessions);
  const activeSession = sessions.find((s) => s.id === sessionId);
  const online = health.configured && health.reachable;

  return (
    <div
      className={`hermes-shell theme-${theme}`}
      data-drawer={drawer}
      style={{ "--hermes-sessions-w": `${sessionsWidth}px` } as React.CSSProperties}
    >
      {/* ---- MOBILE TOP BAR (kun synlig på mobil) ---- */}
      <div className="hermes-mobile-bar" style={{ gridColumn: "1 / -1" }}>
        <button
          className="hermes-mobile-bar-btn"
          onClick={() => setDrawer(drawer === "rail" ? "none" : "rail")}
          aria-label="Åbn menu"
        ><Icon name="Menu" size={18} /></button>
        <span className="hermes-mobile-bar-title">
          {activeSession?.title || "Hermes · Buur Agent"}
        </span>
        <button
          className="hermes-mobile-bar-btn"
          onClick={() => setDrawer(drawer === "sessions" ? "none" : "sessions")}
          aria-label="Åbn samtaler"
        ><Icon name="MessagesSquare" size={18} /></button>
      </div>

      <div className="hermes-mobile-backdrop" onClick={() => setDrawer("none")} aria-hidden="true" />

      {/* ---- COLUMN 1: Icon rail ---- */}
      <nav className="hermes-rail" aria-label="Hermes navigation">
        <img
          src="/brand/kinly-mark-tight-512.png"
          alt="Hermes · Kinly"
          className="hermes-rail-logo"
          style={{ width: 32, height: "auto", objectFit: "contain" }}
        />
        <button className="hermes-rail-btn active" title="Chat" aria-label="Chat"><Icon name="MessagesSquare" size={18} /></button>
        <button className="hermes-rail-btn" title="Skills" aria-label="Skills"><Icon name="Wand" size={18} /></button>
        <button className="hermes-rail-btn" title="Memory" aria-label="Memory"><Icon name="Brain" size={18} /></button>
        <button className="hermes-rail-btn" title="Knowledge Graph" aria-label="Knowledge Graph"><Icon name="Network" size={18} /></button>
        <button className="hermes-rail-btn" title="Activity" aria-label="Activity"><Icon name="Activity" size={18} /></button>
        <div className="hermes-rail-spacer" />
        <button
          className="hermes-theme-toggle"
          title={theme === "dark" ? "Skift til lys" : "Skift til mørk"}
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Skift tema"
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <button className="hermes-rail-btn" title="Indstillinger" aria-label="Indstillinger"><Icon name="Settings" size={18} /></button>
        <div className="hermes-rail-avatar" title={PROFILES.find((p) => p.id === profile)?.label}>
          {PROFILES.find((p) => p.id === profile)?.label?.[0] ?? "L"}
        </div>
      </nav>

      {/* ---- COLUMN 2: Sessions sidebar ---- */}
      <aside className="hermes-sessions" aria-label="Chat sessions">
        <div className="hermes-sessions-head">
          <span className="hermes-sessions-title">CHAT</span>
          <button
            className="hermes-sessions-new"
            onClick={() => { startNewSession(); setDrawer("none"); }}
            title="Ny samtale"
            aria-label="Ny samtale"
          ><Icon name="Plus" size={16} /></button>
        </div>
        <div className="hermes-sessions-search">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input placeholder="Filter conversations…" aria-label="Filter conversations" />
        </div>

        <div className="hermes-sessions-list">
          {sessionGroups.length === 0 ? (
            <div style={{ padding: "20px 12px", fontSize: 12, color: "var(--hermes-text-dim)", textAlign: "center" }}>
              Ingen samtaler endnu — start en ny.
            </div>
          ) : (
            sessionGroups.map((group) => (
              <div key={group.label}>
                <div className="hermes-sessions-group-label">{group.label}</div>
                {group.items.map((s) => {
                  const isTelegram = s.title?.toLowerCase().includes("telegram");
                  return (
                    <button
                      key={s.id}
                      onClick={() => { openSession(s); setDrawer("none"); }}
                      className={`hermes-session ${s.id === sessionId ? "active" : ""}`}
                      title={s.title || "(uden titel)"}
                    >
                      <span className={`hermes-session-dot ${s.id === sessionId ? "" : "dim"}`} />
                      <div className="hermes-session-content">
                        <div className="hermes-session-title">
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                            {s.title || "(uden titel)"}
                          </span>
                          {isTelegram && <span className="hermes-session-tg">TELEGRAM</span>}
                        </div>
                        <div className="hermes-session-meta">
                          <span>{(s.updatedAt ?? "").slice(11, 16)}</span>
                          <span>·</span>
                          <span>{s.messageCount ?? 0} beskeder</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}

          <div style={{ padding: "16px 8px 8px" }}>
            <div className="hermes-sessions-group-label">System</div>
            <div style={{ fontSize: 12, color: "var(--hermes-text-muted)", marginBottom: 8, padding: "4px 10px" }}>
              {jobs.length} cron jobs · gateway {health.gatewayRunning ? "kører" : "stoppet"}
            </div>
            {dream && (
              <button
                onClick={() => setDreamOpen((o) => !o)}
                className="hermes-session"
                style={{ width: "100%" }}
              >
                <span className="hermes-session-dot" style={{ background: "var(--hermes-gold)" }} />
                <div className="hermes-session-content">
                  <div className="hermes-session-title">Nattens dream</div>
                  <div className="hermes-session-meta">
                    <span>{dreamOpen ? "skjul" : "vis"}</span>
                  </div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Resize handle (desktop) */}
        <div
          className="hermes-sessions-resizer"
          onMouseDown={startResize}
          title="Træk for at ændre bredde"
          aria-label="Træk for at ændre sessions-sidebar bredde"
        />
      </aside>

      {/* ---- COLUMN 3: Chat ---- */}
      <section className="hermes-chat">
        <div className="hermes-chat-top">
          <div className="hermes-chat-title">
            <img
              src="/brand/kinly-mark-tight-512.png"
              alt=""
              className="hermes-mark"
              aria-hidden="true"
            />
            {activeSession?.title || "Ny samtale"}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="hermes-theme-toggle"
              title={theme === "dark" ? "Skift til lys" : "Skift til mørk"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Skift tema"
            >
              {theme === "dark" ? "☀" : "☾"}
            </button>
            <div className="hermes-chat-status">
              <span className="hermes-live-dot" />
              <span>{online ? "ONLINE" : "OFFLINE"}</span>
            </div>
            <div className="hermes-chat-count">{msgs.length} beskeder</div>
          </div>
        </div>

        {sending && (
          <div className="hermes-stream-banner">
            <span className="hermes-resuming">STREAMING</span>
            <span>· {PROFILES.find((p) => p.id === profile)?.label} · session {sessionId.slice(0, 8)}</span>
          </div>
        )}

        <div ref={scrollRef} className="hermes-messages">
          {offline && (
            <div className="hermes-bubble" style={{ background: "var(--hermes-bg-2)", border: "1px solid var(--hermes-ember)" }}>
              <strong><Icon name="AlertTriangle" size={15} style={{ verticalAlign: "middle" }} /> Hermes er offline</strong><br />
              {health.configured
                ? "Tjek at VPS'en kører (hermes-api på port 8787)."
                : "HERMES_API_URL + HERMES_API_SECRET mangler i miljøet."}
              <button onClick={recheckHealth} className="hermes-tool-btn" style={{ marginLeft: 8 }} title="Tjek igen">
                <Icon name="RefreshCw" size={15} />
              </button>
            </div>
          )}

          {msgs.length === 0 && !offline && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--hermes-text-muted)" }}>
              <img
                src="/brand/kinly-mark-tight-512.png"
                alt="Kinly"
                className="hermes-mark-large"
                style={{ display: "block", margin: "0 auto 20px", filter: "drop-shadow(0 4px 16px rgba(212, 80, 15, 0.35))" }}
              />
              <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: 22, color: "var(--hermes-text)", margin: "0 0 8px" }}>
                Hej {PROFILES.find((p) => p.id === profile)?.label}.
              </p>
              <p style={{ fontSize: 13.5, margin: 0 }}>
                Kort dansk, ærlig, sender aldrig noget selv. Stil mig om hvad som helst.
              </p>
            </div>
          )}

          {msgs.map((m, i) => (
            <div key={`${i}-${m.role}`} className={`hermes-msg ${m.role}`}>
              <div className={`hermes-avatar ${m.role}`} aria-hidden="true">
                {m.role === "you" ? PROFILES.find((p) => p.id === profile)?.label?.[0] ?? "D" : (
                  <img
                    src="/brand/kinly-mark-tight-512.png"
                    alt=""
                    style={{ width: 22, height: "auto", display: "block" }}
                  />
                )}
              </div>
              <div className="hermes-msg-body">
                <div className="hermes-msg-meta">
                  <span className="hermes-role-pill">{m.role === "you" ? "DIG" : "HERMES"}</span>
                  <span className="hermes-model-pill">{m.role === "hermes" ? `Hermes · ${PROFILES.find((p) => p.id === profile)?.label}` : (m.ts ?? "").slice(11, 16)}</span>
                </div>
                <div className="hermes-bubble">
                  {m.role === "hermes" ? <MarkdownLite source={m.text} /> : m.text}
                </div>
              </div>
            </div>
          ))}

          {sending && (
            <div className="hermes-thinking">
              <div className="hermes-avatar hermes" aria-hidden="true">
                <img
                  src="/brand/kinly-mark-tight-512.png"
                  alt=""
                  style={{ width: 22, height: "auto", display: "block" }}
                />
              </div>
              <div>
                <div className="hermes-thinking-dots" aria-label="Hermes tænker">
                  <span /><span /><span />
                </div>
                <div className="hermes-msg-meta">
                  <span className="hermes-role-pill">HERMES</span>
                </div>
              </div>
            </div>
          )}

          {dreamOpen && dream && (
            <div className="hermes-bubble" style={{ background: "var(--hermes-bg-3)", border: "1px solid var(--hermes-gold)" }}>
              <strong><Icon name="Moon" size={15} style={{ verticalAlign: "middle" }} /> Nattens dream</strong>
              <div style={{ marginTop: 8 }}>
                <MarkdownLite source={trimAtParagraph(dream.body, 2000)} />
              </div>
            </div>
          )}

          {exportMsg && (
            <div style={{ textAlign: "center", color: "var(--hermes-text-dim)", fontSize: 12, padding: 8 }}>{exportMsg}</div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="hermes-composer"
        >
          <div className="hermes-composer-toolbar">
            <button type="button" className="hermes-tool-btn" title="Vedhæft fil" aria-label="Vedhæft fil"><Icon name="Paperclip" size={15} /></button>
            <button type="button" className="hermes-tool-btn" title="Stemmekommando" aria-label="Stemme"><Icon name="Mic" size={15} /></button>
            <button type="button" className="hermes-tool-btn" title="Profil" aria-label="Skift profil">
              {PROFILES.find((p) => p.id === profile)?.label?.[0] ?? "L"}
            </button>
            <span className="hermes-model-pill" title="Model">
              {PROFILES.find((p) => p.id === profile)?.label}
            </span>
            {msgs.length > 0 && (
              <>
                <button
                  type="button"
                  className="hermes-tool-btn"
                  style={{ marginLeft: 8 }}
                  onClick={exportSession}
                  disabled={exporting}
                  title="Gem i vault"
                  aria-label="Gem i vault"
                >
                  <Icon name="Save" size={15} />
                </button>
                <button
                  type="button"
                  className="hermes-tool-btn"
                  onClick={() => startNewSession()}
                  title="Ny samtale"
                  aria-label="Ny samtale"
                >
                  <Icon name="Plus" size={15} />
                </button>
              </>
            )}
          </div>
          <div className="hermes-composer-row">
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
              rows={1}
              maxLength={8000}
              aria-label="Skriv til Hermes"
              className="hermes-input"
            />
            <button
              type="submit"
              disabled={sending || offline || !input.trim()}
              className="hermes-send-btn"
              aria-label="Send"
              title="Send (Enter)"
            >
              <Icon name="ArrowUp" size={20} />
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}



// Lille pipeline-puls så morgenrutinen kan klares fra Hermes-siden alene.
function PipelineSnapshot() {
  const [nums, setNums] = useState<{ queue?: number; replies?: number; sent?: number } | null>(null);

  useEffect(() => {
    fetch("/api/deck/summary")
      .then((r) => r.json())
      .then((d) =>
        setNums({
          queue: d?.queue?.pending,
          replies: d?.numbers?.repliesPending,
          sent: d?.numbers?.sentToday,
        }),
      )
      .catch(() => {});
  }, []);

  if (!nums) return null;
  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 8 }}>
      <div className="cc-kicker">Pipeline lige nu</div>
      <SideRow label="I godkendelseskøen" value={String(nums.queue ?? "–")} ok={(nums.queue ?? 0) > 0} />
      <SideRow label="Svar der venter" value={String(nums.replies ?? "–")} ok={false} />
      <SideRow label="Sendt i dag" value={String(nums.sent ?? "–")} ok={(nums.sent ?? 0) > 0} />
    </section>
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
