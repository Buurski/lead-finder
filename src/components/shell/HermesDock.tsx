"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Icon from "./Icon";
import { parseSseBuffer } from "@/lib/sse";
import "./hermes-dock.css";

// Hermes-docken: eneste assistent i UI'et (Claude-chatten er fjernet). Bor i
// AppShell (rodlayoutet), så samtalen overlever navigation — se sessionStorage
// nedenfor for reload. ⌘J/Ctrl+J åbner/lukker, Esc lukker, "hermes:open" (window
// CustomEvent, valgfri detail.prefill) åbner + udfylder inputfeltet.

type ChatMsg = { id: string; role: "user" | "hermes"; text: string };

// Nøglerne er brugerspecifikke: to personer i samme browser (login-skift) må
// ikke arve hinandens samtale-id eller beskedhistorik fra sessionStorage.
const SESSION_KEY = "hermes-dock:session";
const MESSAGES_KEY = "hermes-dock:messages";
const sessionKey = (userKey: string) => `${SESSION_KEY}:${userKey}`;
const messagesKey = (userKey: string) => `${MESSAGES_KEY}:${userKey}`;
const COMPANY_RE = /^\/virksomheder\/([0-9a-f-]{36})(?:\/|$)/i;
const URL_RE = /(https?:\/\/[^\s]+)/g;
const CALM_ERROR = "Hermes svarer ikke lige nu — prøv igen";

function newSessionId(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

function loadSessionId(userKey: string): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = sessionStorage.getItem(sessionKey(userKey));
    if (existing) return existing;
  } catch {}
  const id = newSessionId();
  try {
    sessionStorage.setItem(sessionKey(userKey), id);
  } catch {}
  return id;
}

function loadMessages(userKey: string): ChatMsg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(messagesKey(userKey));
    return raw ? (JSON.parse(raw) as ChatMsg[]) : [];
  } catch {
    return [];
  }
}

const SUGGESTIONS: Record<string, string[]> = {
  kunde: [
    "Hvad er status på kunden?",
    "Hvad skylder de?",
    "Skriv et udkast til en opdatering til kunden",
  ],
  approve: [
    "Hvilke kladder bør jeg sende først?",
    "Er nogen af kladderne for aggressive?",
    "Hvad venter på svar lige nu?",
  ],
  pipeline: [
    "Hvilke aftaler mangler næste skridt?",
    "Hvad er forfaldent i pipelinen?",
    "Hvor mange aftaler er i gang lige nu?",
  ],
  hq: [
    "Hvad skal jeg tage fat på i dag?",
    "Er der noget der er forfaldent?",
    "Giv mig et kort overblik over dagen",
  ],
  andet: [
    "Hvad kan du hjælpe med her?",
    "Giv mig et kort overblik",
    "Hvad skal jeg vide om denne side?",
  ],
};

// Linjeskift bevares af white-space:pre-wrap på beskeden; her linkifies rene
// URL'er — Hermes-svar er ikke markdown, så en fuld renderer er overkill.
function renderText(text: string): ReactNode[] {
  return text.split(URL_RE).map((seg, i) =>
    /^https?:\/\//.test(seg) ? (
      <a key={i} href={seg} target="_blank" rel="noopener noreferrer">
        {seg}
      </a>
    ) : (
      <span key={i}>{seg}</span>
    )
  );
}

export default function HermesDock({ userKey = "ukendt" }: { userKey?: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [badge, setBadge] = useState(false);
  const [sessionId, setSessionId] = useState(() => loadSessionId(userKey));
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadMessages(userKey));
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [retryText, setRetryText] = useState<string | null>(null);
  const [chipLabel, setChipLabel] = useState("Kender siden");
  // companyId fra et "hermes:open"-event, tagget med sin sides pathname — gælder
  // kun så længe man bliver på den side (sammenlignes mod pathname ved brug,
  // så den udløber ved navigation uden en ekstra effect/ref-reset).
  const [companyOverride, setCompanyOverride] = useState<{ id: string; path: string } | null>(null);

  const openRef = useRef(open);
  const startRef = useRef<number | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mobil (design-review #8): FAB'en dæmpes mens man scroller, så den ikke
  // dækker kortindhold/statustekst permanent — kun opacity, ingen layout-flyt.
  const [scrolling, setScrolling] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    function onScroll() {
      setScrolling(true);
      clearTimeout(t);
      t = setTimeout(() => setScrolling(false), 500);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      clearTimeout(t);
    };
  }, []);

  const pathCompanyId = useMemo(() => pathname.match(COMPANY_RE)?.[1] ?? null, [pathname]);
  const eventCompanyId = companyOverride?.path === pathname ? companyOverride.id : null;
  const companyId = eventCompanyId ?? pathCompanyId;
  const pageKind = useMemo(() => {
    if (companyId) return "kunde";
    if (pathname.startsWith("/approve")) return "approve";
    if (pathname.startsWith("/pipeline")) return "pipeline";
    if (pathname === "/") return "hq";
    return "andet";
  }, [pathname, companyId]);
  const suggestions = SUGGESTIONS[pageKind];

  // Åbn/luk med ⌘J / Ctrl+J, luk med Esc.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((o) => !o);
        setBadge(false);
      } else if (e.key === "Escape") {
        setOpen((o) => (o ? false : o));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ekstern åbning, fx en knap andetsteds i UI'et: window.dispatchEvent(new
  // CustomEvent("hermes:open", { detail: { prompt: "…", companyId: "…" } })).
  useEffect(() => {
    function onHermesOpen(e: Event) {
      const detail = (e as CustomEvent<{ prompt?: string; companyId?: string }>).detail;
      setOpen(true);
      setBadge(false);
      if (detail?.prompt) setInput(detail.prompt);
      if (detail?.companyId) setCompanyOverride({ id: detail.companyId, path: pathname });
    }
    window.addEventListener("hermes:open", onHermesOpen);
    return () => window.removeEventListener("hermes:open", onHermesOpen);
  }, [pathname]);

  useEffect(() => {
    openRef.current = open;
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Kontekst-chip: navn fra en data-attribut (hvis siden sætter en) eller
  // document.title. Titlen sættes typisk lige efter navigation, så et kort
  // efterfølgende tjek fanger den.
  useEffect(() => {
    function compute() {
      if (!companyId) {
        setChipLabel("Kender siden");
        return;
      }
      const attr = document.querySelector("[data-hermes-company]")?.getAttribute("data-hermes-company")?.trim();
      const titleName = document.title.split(/[·|]/)[0]?.trim();
      const name = attr || (titleName && titleName !== "Kinly HQ" ? titleName : "");
      setChipLabel(name ? `Kender ${name}` : "Kender kunden på siden");
    }
    compute();
    const t = setTimeout(compute, 150);
    return () => clearTimeout(t);
  }, [companyId, pathname]);

  useEffect(() => {
    try {
      sessionStorage.setItem(messagesKey(userKey), JSON.stringify(messages));
    } catch {}
  }, [messages, userKey]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, pending, error]);

  useEffect(() => {
    if (!pending) return;
    const id = setInterval(() => {
      if (startRef.current) setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [pending]);

  // Poll indtil svaret ligger klar i hermes-api. Bruges af fallback-vejen (stream
  // kunne ikke startes) og når en stream dør undervejs. existingId = den
  // streamede bobles id, så svaret lander i SAMME bobbel i stedet for en dublet.
  async function pollUntilDone(rid: string, text: string, existingId?: string): Promise<boolean> {
    const pollUrl = `/api/hermes/ask?sessionId=${encodeURIComponent(sessionId)}&requestId=${rid}&message=${encodeURIComponent(text.slice(0, 4000))}`;
    // eslint-disable-next-line react-hooks/purity -- poll-loop kører kun fra klik, aldrig under render
    const started = Date.now();
    let misses = 0;
    for (let i = 0; ; i++) {
      await new Promise((r) => setTimeout(r, Math.min(6000, 1500 + i * 750)));
      // eslint-disable-next-line react-hooks/purity -- som ovenfor: kun fra klik
      if (Date.now() - started > 45 * 60_000) return false;
      const pr = await fetch(pollUrl).catch(() => null);
      const pd = (await pr?.json().catch(() => null)) as { ok?: boolean; status?: string; reply?: string } | null;
      if (!pd?.ok) {
        // Netværkshikke må ikke dræbe et langt svar — giv op efter tre i træk.
        if (++misses >= 3) return false;
        continue;
      }
      misses = 0;
      if (pd.status === "running") continue;
      if (pd.status === "done") {
        const reply = pd.reply ?? "";
        setMessages((m) =>
          existingId && m.some((x) => x.id === existingId)
            ? m.map((x) => (x.id === existingId ? { ...x, text: reply } : x))
            : [...m, { id: newSessionId(), role: "hermes", text: reply }],
        );
        if (!openRef.current) setBadge(true);
        return true;
      }
      return false;
    }
  }

  async function ask(text: string) {
    setError(null);
    setRetryText(null);
    setPending(true);
    // ask() only ever runs from send()/retry(), both user-triggered — never during render.
    // eslint-disable-next-line react-hooks/purity
    startRef.current = Date.now();
    setElapsed(0);

    const streamId = newSessionId();
    // Løftet ud af try, så catch også kan bruge den (poll-fallback ved brudt stream).
    let streamRid: string | null = null;
    try {
      // Primær vej: streaming — delsvaret vises mens agenten arbejder på VPS'en.
      const res = await fetch("/api/hermes/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ message: text, sessionId, page: pathname, stream: true, ...(companyId ? { companyId } : {}) }),
      }).catch(() => null);
      const ct = res?.headers.get("content-type") ?? "";
      if (res?.ok && res.body && ct.includes("text/event-stream")) {
        setMessages((m) => [...m, { id: streamId, role: "hermes", text: "" }]);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let acc = "";
        let finished = false;
        let failed = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const parsed = parseSseBuffer(buf);
          buf = parsed.rest;
          for (const rawEv of parsed.events) {
            const ev = rawEv as { request_id?: string; text?: string; done?: boolean; full_text?: string; error?: string };
            if (typeof ev.request_id === "string") streamRid = ev.request_id;
            if (typeof ev.text === "string") {
              acc += ev.text;
              // Delsvaret vises mens agenten arbejder — det er hele pointen med streamen.
              setMessages((m) => m.map((x) => (x.id === streamId ? { ...x, text: acc } : x)));
            }
            if (ev.done === true) {
              if (ev.error) {
                failed = true;
              } else {
                const fullText = (typeof ev.full_text === "string" && ev.full_text) || acc || "(tomt svar)";
                setMessages((m) => m.map((x) => (x.id === streamId ? { ...x, text: fullText } : x)));
                if (!openRef.current) setBadge(true);
              }
              finished = true;
            }
          }
          if (finished) break;
        }
        if (finished) {
          // Lad serveren lukke normalt (historik-gemningen kører i flush), men
          // afbryd hvis den hænger — svaret er allerede vist.
          const t0 = Date.now();
          try {
            for (;;) {
              const r = await reader.read();
              if (r.done) break;
              if (Date.now() - t0 > 5_000) {
                await reader.cancel();
                break;
              }
            }
          } catch {
            // ligegyldigt — svaret er allerede vist
          }
        }
        if (finished && !failed) return;
        if (failed) {
          setError(CALM_ERROR);
          setRetryText(text);
          return;
        }
        // Streamen sluttede uden done: fortsæt via poll hvis vi fik et request_id.
        if (streamRid && (await pollUntilDone(streamRid, text, streamId))) return;
        setError(CALM_ERROR);
        setRetryText(text);
        return;
      }

      // Sekundær vej (uændret): start + poll — bruges når streamen ikke kan startes.
      const data = (await res?.json().catch(() => null)) as { ok?: boolean; requestId?: string } | null;
      if (!res?.ok || !data?.ok || !data.requestId) {
        setError(CALM_ERROR);
        setRetryText(text);
        return;
      }
      if (await pollUntilDone(data.requestId, text)) return;
      setError(CALM_ERROR);
      setRetryText(text);
    } catch {
      // Streamen faldt midt i (fx Vercel-dræb ved maxDuration): er request_id
      // kendt, hentes svaret via poll i stedet for at tabe det.
      if (streamRid && (await pollUntilDone(streamRid, text, streamId))) return;
      setError(CALM_ERROR);
      setRetryText(text);
    } finally {
      setPending(false);
      startRef.current = null;
    }
  }

  function send(raw: string) {
    const text = raw.trim();
    if (!text || pending) return;
    setMessages((m) => [...m, { id: newSessionId(), role: "user", text }]);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    void ask(text);
  }

  function retry() {
    if (!retryText || pending) return;
    const text = retryText;
    setRetryText(null);
    void ask(text);
  }

  function newConversation() {
    const id = newSessionId();
    setSessionId(id);
    setMessages([]);
    setError(null);
    setRetryText(null);
    setInput("");
    try {
      sessionStorage.setItem(sessionKey(userKey), id);
      sessionStorage.setItem(messagesKey(userKey), "[]");
    } catch {}
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  return (
    <>
      <button
        type="button"
        className="hermes-dock-fab cc-focus"
        data-dim={scrolling && !open}
        onClick={() => {
          setOpen((o) => !o);
          setBadge(false);
        }}
        aria-label={open ? "Luk Hermes" : "Åbn Hermes"}
      >
        <Icon name="Sparkles" style={{ width: 22, height: 22 }} />
        {badge && !open && <span className="hermes-dock-badge" aria-hidden />}
      </button>

      {open && (
        <>
          <div className="hermes-dock-backdrop" onClick={() => setOpen(false)} />
          <div className="hermes-dock-panel" role="dialog" aria-modal="true" aria-label="Hermes">
            <header className="hermes-dock-head">
              <div className="hermes-dock-head-left">
                <Icon name="Sparkles" style={{ width: 16, height: 16 }} />
                <span className="hermes-dock-title">Hermes</span>
              </div>
              <div className="hermes-dock-head-right">
                <button type="button" className="hermes-dock-icon-btn cc-focus" onClick={newConversation} aria-label="Ny samtale" title="Ny samtale">
                  <Icon name="RefreshCw" style={{ width: 15, height: 15 }} />
                </button>
                <button type="button" className="hermes-dock-icon-btn cc-focus" onClick={() => setOpen(false)} aria-label="Luk">
                  <Icon name="X" style={{ width: 16, height: 16 }} />
                </button>
              </div>
            </header>

            <span className="hermes-dock-chip">{chipLabel}</span>

            <div className="hermes-dock-body" ref={bodyRef}>
              {messages.length === 0 && !pending && (
                <div className="hermes-dock-suggestions">
                  {suggestions.map((s) => (
                    <button key={s} type="button" className="hermes-dock-suggestion cc-focus" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={`hermes-dock-msg hermes-dock-msg-${m.role}`}>
                  {renderText(m.text)}
                </div>
              ))}

              {pending && (
                <div className="hermes-dock-pending">
                  <span className="hermes-dock-dot" aria-hidden />
                  Hermes tænker … {elapsed} s
                </div>
              )}

              {error && (
                <div className="hermes-dock-error" role="alert">
                  <span>{error}</span>
                  <button type="button" className="hermes-dock-retry cc-focus" onClick={retry}>
                    Prøv igen
                  </button>
                </div>
              )}
            </div>

            <form
              className="hermes-dock-input-row"
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
            >
              <textarea
                ref={inputRef}
                className="hermes-dock-input"
                value={input}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                placeholder="Spørg Hermes …"
                aria-label="Besked til Hermes"
                rows={1}
              />
              <button type="submit" className="hermes-dock-send cc-focus" disabled={!input.trim() || pending} aria-label="Send besked">
                <Icon name="ArrowUp" style={{ width: 16, height: 16 }} />
              </button>
            </form>
          </div>
        </>
      )}
    </>
  );
}
