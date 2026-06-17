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

  return (
    <div className="hermes-grid">
      {/* ---- left: chat ---- */}
      <section className="cc-card hermes-chat">
        <div className="hermes-chips" style={{ display: "flex", gap: 6, padding: "12px 14px", borderBottom: "1px solid var(--border)", alignItems: "center", flexWrap: "wrap" }}>
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
          {msgs.length > 0 && (
            <button
              className="cc-btn hermes-new-btn"
              style={{ marginLeft: "auto" }}
              disabled={exporting}
              onClick={exportSession}
              title="Gem hele samtalen som note i KnowledgeOS-vaulten"
            >
              {exporting ? "Gemmer…" : "Gem i vault"}
            </button>
          )}
          <button
            className="cc-btn hermes-new-btn"
            style={msgs.length > 0 ? { marginLeft: 0 } : undefined}
            onClick={() => startNewSession()}
          >
            + Ny samtale
          </button>
        </div>

        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 9, minHeight: 0 }}>
          {offline && (
            <div className="cc-card-pad" style={{ background: "var(--bg-3)", borderRadius: 10, fontSize: 13, color: "var(--text-muted)", display: "grid", gap: 8 }}>
              <span>
                {health.configured
                  ? "Hermes svarer ikke lige nu — tjek at VPS'en kører (hermes-api på port 8787)."
                  : "HERMES_API_URL + HERMES_API_SECRET mangler i miljøet. Sæt dem, så er chatten live."}
              </span>
              <button
                className="cc-btn hermes-mini-btn"
                style={{ justifySelf: "start" }}
                disabled={healthChecking}
                onClick={recheckHealth}
              >
                {healthChecking ? "Tjekker…" : "Tjek igen"}
              </button>
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
              key={`${i}-${m.role}`}
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
          {exportMsg && (
            <div style={{ alignSelf: "center", color: "var(--text-dim)", fontSize: 12 }}>{exportMsg}</div>
          )}
        </div>

        {!offline && (
          <div className="hermes-chips" style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "0 14px 10px" }}>
            {(dream ? [DREAM_QUICK, ...QUICK] : QUICK).map((s) => (
              <button key={s} className="cc-chip" style={{ cursor: "pointer", border: "none" }} onClick={() => send(s)} disabled={sending}>
                {s === DREAM_QUICK ? "🌙 Nattens vigtigste fund?" : s}
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
            maxLength={8000}
            aria-label="Skriv til Hermes"
            className="hermes-input"
          />
          <button type="submit" disabled={sending || offline || !input.trim()} className="cc-btn cc-btn-accent" style={{ padding: "0 16px" }}>
            Send
          </button>
        </form>
      </section>

      {/* ---- right: status, cron, sessions, dream ---- */}
      <div className="hermes-side">
        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 8 }}>
          <div className="cc-kicker">Status</div>
          <SideRow label="hermes-api" value={health.reachable ? "online" : "offline"} ok={health.reachable} />
          <SideRow label="Gateway (Telegram)" value={health.gatewayRunning ? "kører" : "stoppet"} ok={health.gatewayRunning} />
          <SideRow label="Cron jobs" value={String(health.cronJobs)} ok={health.cronJobs > 0} />
        </section>

        <PipelineSnapshot />

        <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
          <div className="cc-kicker">Cron jobs</div>
          {cronError && <div style={{ fontSize: 12, color: "var(--danger, #b4453a)" }}>{cronError}</div>}
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
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <button
                  className="cc-btn hermes-mini-btn"
                  disabled={cronBusy === j.id || j.last_status === "running"}
                  onClick={() => cronAction(j.id, "run")}
                  style={cronBusy === j.id || j.last_status === "running" ? { opacity: 0.6, cursor: "wait" } : undefined}
                >
                  {cronBusy === j.id || j.last_status === "running" ? "kører…" : "Kør nu"}
                </button>
                <button
                  className="cc-btn hermes-mini-btn"
                  disabled={cronBusy === j.id}
                  onClick={() => cronAction(j.id, j.state === "paused" ? "resume" : "pause")}
                >
                  {j.state === "paused" ? "Genoptag" : "Pause"}
                </button>
                {(cronBusy === j.id || j.last_status === "running") && (
                  <Icon name="Loader2" style={{ width: 13, height: 13, color: "var(--accent-ink)", animation: "spin 1s linear infinite" }} />
                )}
              </div>
              {/* Seneste kørsler + key points for dette job */}
              {(() => {
                const withRuns = jobsWithRuns.find((x) => x.id === j.id);
                if (!withRuns || withRuns.runs.length === 0) return null;
                return (
                  <div style={{ marginTop: 6, paddingLeft: 21, borderLeft: "2px solid var(--border)", display: "grid", gap: 4 }}>
                    {withRuns.runs.slice(0, 3).map((r) => (
                      <div key={r.file} style={{ fontSize: 11, lineHeight: 1.4 }}>
                        <span style={{ color: r.status === "ok" ? "var(--accent-ink)" : "var(--danger, #b4453a)" }}>
                          {r.status === "ok" ? "✓" : "✗"}
                        </span>{" "}
                        <span className="cc-dim" style={{ fontFamily: "var(--font-mono)" }}>{r.timestamp.replace(" ", " ").slice(5, 16)}</span>
                        {r.key_points && r.key_points.length > 0 && (
                          <ul style={{ margin: "2px 0 0 16px", padding: 0 }}>
                            {r.key_points.slice(0, 2).map((kp, i) => <li key={i} className="cc-dim">{kp}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
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
              className="hermes-session-btn"
              style={{
                textAlign: "left",
                background: s.id === sessionId ? "var(--accent-soft)" : "none",
                border: "none",
                borderRadius: 7,
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
                <MarkdownLite source={trimAtParagraph(dream.body, 4000)} />
              </div>
            )}
          </section>
        )}
      </div>
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
