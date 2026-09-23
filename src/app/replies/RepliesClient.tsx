"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface InboxItem {
  id: string;
  account: string;
  from: string;
  fromName?: string;
  subject: string;
  snippet: string;
  date: string;
  category: string;
  importance: number;
  needsReply: boolean;
  reason: string;
  gmailLink?: string;
  leadId?: string;
  suggestedReply?: string;
}
interface Digest {
  generatedAt: string;
  generatedBy: string;
  account: string;
  items: InboxItem[];
  note?: string;
}

const CAT_LABEL: Record<string, string> = {
  client: "Blev kunde", interested: "Interesseret", question: "Spørgsmål",
  objection: "Indvending", admin: "Praktisk", personal: "Personlig",
  "not-interested": "Ikke nu", newsletter: "Nyhedsbrev", "auto-reply": "Autosvar",
  receipt: "Kvittering", spam: "Spam", other: "Andet",
};

function catTone(c: string): { bg: string; fg: string } {
  if (c === "client" || c === "interested") return { bg: "var(--accent-soft)", fg: "var(--accent-ink)" };
  if (c === "question") return { bg: "var(--blue-dim)", fg: "var(--blue)" };
  if (c === "objection" || c === "admin" || c === "personal") return { bg: "var(--amber-dim)", fg: "var(--amber)" };
  if (c === "not-interested" || c === "spam") return { bg: "var(--red-dim)", fg: "var(--red)" };
  return { bg: "var(--bg-3)", fg: "var(--text-muted)" };
}

// Gmail-konti pr. indbakke — samme mapping som kontopillen nedenfor (RepliesClient
// kan ikke importere src/lib/senders.ts, den er server-only/nodemailer).
const ACCOUNT_EMAIL: Record<string, string> = { lucas: "buur.aigro@gmail.com", charlie: "1charlie.nielsen@gmail.com" };

// Gmail-compose-link, forudfyldt med kladden — "authuser" hopper direkte ind på
// den konto svaret kom ind på, hvis Lucas/Charlie er logget ind med flere konti.
function gmailComposeLink(item: InboxItem): string {
  const authuser = ACCOUNT_EMAIL[item.account] ?? ACCOUNT_EMAIL.lucas;
  const params = new URLSearchParams({
    view: "cm", fs: "1", to: item.from, su: `Re: ${item.subject}`, body: item.suggestedReply ?? "", authuser,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function CopyReplyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ingen clipboard-adgang (sjældent) — knappen ligger stille, intet at vise.
    }
  }
  return (
    <button className="cc-btn" onClick={copy}>
      <Icon name="Copy" style={{ width: 14, height: 14 }} /> {copied ? "Kopieret ✓" : "Kopiér svar"}
    </button>
  );
}

const OUTCOME_OPTIONS: { value: string; label: string }[] = [
  { value: "interesseret", label: "Interesseret" },
  { value: "ikke-interesseret", label: "Ikke interesseret" },
  { value: "ring-op", label: "Skal ringes op" },
  { value: "kunde-spoergsmaal", label: "Har et spørgsmål" },
  { value: "andet", label: "Andet" },
];

// Erstatter det gamle "Marker lead" (skrev til Sheets, kun status — se
// /api/replies/[leadId]/status). Denne knap er den ene vej til at lukke et
// svar: sætter status, stopper kolde kladder, logger tidslinjen og kan sætte
// en opfølgning, alt i ét kald (src/lib/hq/reply-outcome.ts).
function MarkAnsweredForm({ item, onAnswered }: { item: InboxItem; onAnswered: () => void }) {
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState("interesseret");
  const [note, setNote] = useState("");
  const [followUpDue, setFollowUpDue] = useState("");
  const [owner, setOwner] = useState<"lucas" | "charlie">("lucas");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!item.leadId) return null;

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(item.leadId!)}/udfald`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome, note: note.trim() || undefined, followUpDue: followUpDue || undefined, owner, replyDate: item.date }),
      });
      const d = await res.json();
      if (!res.ok || d.error) { setErr(d.error ?? "Kunne ikke gemme."); return; }
      onAnswered();
    } catch {
      setErr("Netværksfejl. Prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="cc-btn" onClick={() => setOpen(true)}>
        <Icon name="CheckCheck" style={{ width: 14, height: 14 }} /> Markér som besvaret
      </button>
    );
  }

  return (
    <div style={{ display: "grid", gap: 8, padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10, width: "100%" }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="cc-input" style={{ height: 38 }} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {OUTCOME_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" className="cc-input" style={{ height: 38 }} value={followUpDue} onChange={(e) => setFollowUpDue(e.target.value)} title="Følg op den (valgfri)" />
        <div style={{ display: "inline-flex", gap: 4 }}>
          {(["lucas", "charlie"] as const).map((o) => (
            <button key={o} type="button" className="cc-chip" onClick={() => setOwner(o)} title="Hvem opfølgningen er for"
              style={{ cursor: "pointer", border: "1px solid var(--border)", background: owner === o ? "var(--accent-soft)" : "transparent", color: owner === o ? "var(--accent-ink)" : "var(--text-muted)" }}>
              {o === "lucas" ? "Lucas" : "Charlie"}
            </button>
          ))}
        </div>
      </div>
      <textarea className="cc-input" style={{ height: "auto", padding: "10px 14px", resize: "vertical" }} rows={2}
        placeholder="Note (valgfri)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="cc-btn cc-btn-accent" onClick={submit} disabled={busy}>{busy ? "Gemmer…" : "Gem"}</button>
        <button className="cc-btn" onClick={() => setOpen(false)} disabled={busy}>Fortryd</button>
      </div>
    </div>
  );
}

function ReplyComposer({ item, onSent }: { item: InboxItem; onSent: () => void }) {
  const [text, setText] = useState(item.suggestedReply ?? "");
  const [sender, setSender] = useState<"lucas" | "charlie">(item.account === "charlie" ? "charlie" : "lucas");
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function send() {
    setState("sending"); setMsg("");
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(item.leadId!)}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text, subject: item.subject, toEmail: item.from, sender, confirm: true, replyDate: item.date }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.sent) { setState("error"); setMsg(d.message ?? "Kunne ikke sende."); return; }
      setState("done");
      setMsg(d.recorded ? `Sendt til ${item.from} og registreret.` : `Sendt til ${item.from}. Markér det som besvaret nedenfor.`);
      if (d.recorded) setTimeout(onSent, 1200);
    } catch {
      setState("error"); setMsg("Netværksfejl — tjek Sendt-mappen før du prøver igen.");
    }
  }
  const locked = state === "sending" || state === "done";
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <label className="cc-kicker" htmlFor={`svar-${item.id}`}>Dit svar</label>
      <textarea id={`svar-${item.id}`} className="cc-input" rows={7} value={text} onChange={(e) => { setText(e.target.value); if (state === "confirm") setState("idle"); }}
        disabled={locked} style={{ height: "auto", minHeight: 170, padding: "12px 14px", lineHeight: 1.55, resize: "vertical" }} placeholder="Skriv svaret her…" />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", gap: 10, alignItems: "center" }} disabled={locked}>
          <legend className="cc-dim" style={{ fontSize: 12.5, float: "left", marginRight: 6 }}>Fra</legend>
          {(["lucas", "charlie"] as const).map((o) => (
            <label key={o} style={{ display: "inline-flex", gap: 5, alignItems: "center", fontSize: 13 }}>
              <input type="radio" name={`fra-${item.id}`} checked={sender === o} onChange={() => setSender(o)} />
              {o === "lucas" ? "Lucas" : "Charlie"}
            </label>
          ))}
        </fieldset>
        {state === "confirm" ? (
          <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="cc-btn cc-btn-accent" onClick={send}>Ja, send til {item.from}</button>
            <button className="cc-btn" onClick={() => setState("idle")}>Fortryd</button>
          </span>
        ) : (
          <button className="cc-btn cc-btn-accent" onClick={() => setState("confirm")} disabled={locked || !text.trim()}>
            <Icon name="Mail" style={{ width: 14, height: 14 }} /> {state === "sending" ? "Sender…" : state === "done" ? "Sendt" : "Send svar"}
          </button>
        )}
      </div>
      {msg && <p role="status" style={{ margin: 0, fontSize: 12.5, color: state === "error" ? "var(--red)" : "var(--text-muted)" }}>{msg}</p>}
    </div>
  );
}

function ItemCard({ item, canSend, onAnswered }: { item: InboxItem; canSend: boolean; onAnswered: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const tone = catTone(item.category);
  return (
    <section className="cc-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="cc-focus"
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <span title={`vigtighed ${item.importance}`} style={{ width: 38, flexShrink: 0, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: item.importance >= 80 ? "var(--accent-ink)" : item.importance >= 55 ? "var(--amber)" : "var(--text-dim)" }}>{item.importance}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {/* minWidth:0 — uden den kan nowrap-navnet ikke krympe, og hele siden bliver bredere end telefonen. */}
            <span style={{ minWidth: 0, fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.fromName || item.from}</span>
            {item.account && (
              <span
                className="cc-chip"
                title={`Modtaget på ${item.account === "lucas" ? "buur.aigro@gmail.com" : "1charlie.nielsen@gmail.com"}`}
                style={{
                  fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase",
                  padding: "2px 7px",
                  // Konto skelnes med ro: samme neutrale chip, kun kant/ink skifter.
                  background: item.account === "lucas" ? "var(--blue-dim)" : "var(--bg-3)",
                  color: item.account === "lucas" ? "var(--blue)" : "var(--text-muted)",
                  border: `1px solid ${item.account === "lucas" ? "var(--blue)" : "var(--border-light)"}`,
                }}
              >
                {item.account}
              </span>
            )}
            {item.category === "client" && <span className="cc-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>blev kunde</span>}
          </div>
          <div className="cc-dim" style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.subject} · {item.reason || item.snippet}</div>
        </div>
        <span className="cc-chip" style={{ background: tone.bg, color: tone.fg }}>{CAT_LABEL[item.category] ?? item.category}</span>
        <Icon name="ChevronRight" style={{ width: 16, height: 16, color: "var(--text-dim)", transform: open ? "rotate(90deg)" : "none", transition: "transform 140ms ease" }} />
      </button>
      {open && (
        <div className="cc-fade" style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", display: "grid", gap: 14 }}>
          <div>
            <div className="cc-kicker" style={{ marginBottom: 6 }}>Besked</div>
            <p className="cc-muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{item.snippet}</p>
          </div>
          {canSend && item.leadId && item.from ? (
            <ReplyComposer item={item} onSent={() => onAnswered(item.id)} />
          ) : item.suggestedReply && (
            <div>
              <div className="cc-kicker" style={{ marginBottom: 6 }}>Foreslået svar</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10 }}>{item.suggestedReply}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {item.suggestedReply && <CopyReplyButton text={item.suggestedReply} />}
            {item.from && (
              <a className="cc-btn" href={gmailComposeLink(item)} target="_blank" rel="noreferrer">
                <Icon name="Mail" style={{ width: 14, height: 14 }} /> Åbn i Gmail
              </a>
            )}
            {item.leadId && <MarkAnsweredForm item={item} onAnswered={() => onAnswered(item.id)} />}
          </div>
          <div className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="CircleDot" style={{ width: 13, height: 13 }} />
            {canSend ? "Send svar herfra, eller åbn i Gmail og markér som besvaret bagefter." : "Selve mailen sender du fra Gmail. \"Markér som besvaret\" opdaterer CRM'et — status, tidslinje og opfølgning i ét klik."}
          </div>
        </div>
      )}
    </section>
  );
}

// Fetches the morning triage prompt and copies it, so Lucas can paste it into a
// Cowork/Opus session for an on-demand scan (the scheduled task does this daily).
function CopyPromptButton() {
  const [label, setLabel] = useState("Hent morgen-scan prompt");
  async function copy() {
    try {
      const r = await fetch("/api/inbox/cowork-prompt");
      const text = await r.text();
      await navigator.clipboard.writeText(text);
      setLabel("Kopieret ✓");
    } catch {
      setLabel("Kunne ikke kopiere");
    }
    setTimeout(() => setLabel("Hent morgen-scan prompt"), 2000);
  }
  return <button className="cc-btn" onClick={copy}><Icon name="Sparkles" style={{ width: 14, height: 14 }} /> {label}</button>;
}

// Manual "kør nu": runs the live inbox scan immediately (bypasses the fallback
// gates) and refreshes — for when Cowork hasn't delivered and Lucas wants it now.
function ScanNowButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function scan() {
    setBusy(true);
    setFailed(false);
    try {
      // Bundle A's browser-safe manuelle cron-trigger (ingen CRON_SECRET i
      // klienten) kombineret med Bundle E/F's fejl-notits.
      const r = await fetch("/api/ops/run-cron/inbox-triage", { method: "POST" });
      if (!r.ok) setFailed(true);
      onDone();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
      // Don't let a stale failure notice linger after later successful loads.
      setTimeout(() => setFailed(false), 8000);
    }
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="cc-btn kinly-next-action" onClick={scan} disabled={busy}><Icon name="Inbox" style={{ width: 14, height: 14 }} /> {busy ? "Scanner…" : "Scan nu"}</button>
      {failed && <span className="cc-dim" style={{ fontSize: 12, color: "var(--amber)" }}>Scan fejlede — prøv igen om lidt.</span>}
    </span>
  );
}

export default function RepliesClient({ canSend = false }: { canSend?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [source, setSource] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [showNoise, setShowNoise] = useState(false);

  function load() {
    setState("loading");
    // Timeout: uden den hænger skeletonen i evighed hvis /api/replies aldrig svarer.
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 12_000);
    fetch("/api/replies", { signal: ac.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok === false) { setErr(d.error ?? "ukendt fejl"); setState("error"); setDigest(null); return; }
        setDigest(d.digest ?? null);
        setSource(d.source ?? "");
        setAgeMin(typeof d.summary?.ageMinutes === "number" ? d.summary.ageMinutes : null);
        setState("ok");
      })
      .catch((e) => { setErr(e?.name === "AbortError" ? "Serveren svarede ikke i tide." : String(e)); setState("error"); })
      .finally(() => clearTimeout(timeout));
  }
  // Initial load on mount. load() sets "loading" synchronously; that's the intent
  // (the skeleton), so the set-state-in-effect rule is intentionally suppressed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  // Udfaldet er allerede gemt server-side (API'et markerer også den cachede
  // digest, se /api/replies/[leadId]/udfald) — her flipper vi bare needsReply
  // lokalt så svaret med det samme forsvinder fra "kræver svar" og lander i
  // den skjulte "resten"-liste i stedet, uden en ny hentning.
  function markAnswered(id: string) {
    setDigest((d) => (d ? { ...d, items: d.items.map((i) => (i.id === id ? { ...i, needsReply: false } : i)) } : d));
  }

  if (state === "loading") {
    return <div style={{ display: "grid", gap: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 72 }} />)}</div>;
  }
  if (state === "error") {
    const notConfigured = /imap not configured|not configured|gmail/i.test(err);
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center", flexWrap: "wrap" }}>
        {notConfigured ? (
          <span className="cc-chip">Gmail ikke forbundet</span>
        ) : (
          <span className="cc-dim" style={{ fontSize: 13 }}>Kunne ikke nå indbakken — intet blev rørt.</span>
        )}
        {!notConfigured && (
          <button className="cc-btn" onClick={load} style={{ marginLeft: "auto" }}>
            <Icon name="Activity" style={{ width: 14, height: 14 }} /> Prøv igen
          </button>
        )}
      </div>
    );
  }

  const items = digest?.items ?? [];
  const needs = items.filter((i) => i.needsReply);
  const noise = items.filter((i) => !i.needsReply);

  return (
    // minmax(0, 1fr): grid-items har min-width:auto, så en lang emnelinje ellers
    // gør hele siden bredere end telefonen i stedet for at blive forkortet.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Icon name="Inbox" style={{ width: 18, height: 18, color: "var(--kinly-signal)" }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{needs.length} kræver svar · {items.length} scannet</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>
            {source === "artifact" ? "Rangeret af morgen-scan (Opus)" : "Live fallback — kun kendte leads. Fuld indbakke-triage kommer fra morgen-scanneren."}
            {ageMin != null && ageMin >= 0 ? ` · opdateret for ${ageMin} min siden` : ""}
          </div>
        </div>
        <ScanNowButton onDone={load} />
        <CopyPromptButton />
        <button className="cc-btn kinly-quiet-action" onClick={load}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater</button>
      </div>

      {items.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="Inbox" /><div>Ingen svar at triagere lige nu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Morgen-scanneren fylder de vigtige svar ind her.</div></div></div>
      ) : (
        <>
          {needs.map((it) => <ItemCard key={it.id} item={it} canSend={canSend} onAnswered={markAnswered} />)}
          {noise.length > 0 && (
            <>
              <button className="cc-btn" style={{ justifySelf: "start" }} onClick={() => setShowNoise((v) => !v)}>
                <Icon name="ChevronRight" style={{ width: 14, height: 14, transform: showNoise ? "rotate(90deg)" : "none" }} />
                {showNoise ? "Skjul" : `Vis resten (${noise.length})`}
              </button>
              {showNoise && noise.map((it) => <ItemCard key={it.id} item={it} canSend={canSend} onAnswered={markAnswered} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
