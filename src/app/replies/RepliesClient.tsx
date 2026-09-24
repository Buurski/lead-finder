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
  threadSummary?: string;
  threadCount?: number;
  threadId?: string;
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

// Alder i menneskelig form: minutter når det er nyt, ellers klokkeslæt+dato —
// "opdateret for 31912 min siden" er ikke information nogen kan bruge.
function formatAge(min: number): string {
  if (min < 2) return "lige nu";
  if (min < 90) return `for ${Math.round(min)} min siden`;
  const d = new Date(Date.now() - min * 60_000);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getDate()}/${d.getMonth() + 1} kl. ${hh}:${mm}`;
}

// Gmail-konti pr. indbakke. Kilden er lucas@kinly.dk — der lander kundesvarene
// (afsenderen på udgående mail er også kinly.dk; SMTP-login er en anden sag).
// Denne mapping styrer KUN Gmail-links i UI'et (authuser), ikke afsendelse.
const ACCOUNT_EMAIL: Record<string, string> = { lucas: "lucas@kinly.dk", charlie: "1charlie.nielsen@gmail.com" };

// "Åbn i Gmail" peger på TRÅDEN — ikke en ny mail. En compose ("view=cm") sender
// svaret ud af samtalen, så kunden får to spor i stedet for ét. Uden tråd-id
// (ældre digest uden threadId) søger vi i stedet på afsenderen, så tråden kan
// vælges manuelt — aldrig en ny, løsrevet mail.
function gmailOpenLink(item: InboxItem): string {
  const authuser = ACCOUNT_EMAIL[item.account] ?? ACCOUNT_EMAIL.lucas;
  const base = `https://mail.google.com/mail/?authuser=${encodeURIComponent(authuser)}`;
  return item.threadId
    ? `${base}#all/${encodeURIComponent(item.threadId)}`
    : `${base}#search/from:${encodeURIComponent(item.from)}`;
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

// "Fjern meddelelsen": skjuler mailen i alle visninger (samme KV-markering som
// agent-vejen bruger). Der slettes intet i CRM'et, og et NYERE svar fra samme
// afsender dukker op igen, fordi markeringen tidsstemples.
function RemoveButton({ item, onRemoved }: { item: InboxItem; onRemoved: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/replies/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) onRemoved(item.id);
    } catch {
      // netværksfejl — intet er skjult lokalt, knappen kan trykkes igen.
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="cc-btn kinly-quiet-action" onClick={remove} disabled={busy} title="Skjul meddelelsen i Svar-listen">
      <Icon name="X" style={{ width: 14, height: 14 }} /> {busy ? "Fjerner…" : "Fjern"}
    </button>
  );
}

// "Svaret": Lucas/Charlie har svaret kunden manuelt i Gmail. Logger svaret på
// kundens tidslinje (samme funktion som lead-udfaldene, så "hvem venter på
// hvem" og næste scan hænger sammen) og skjuler meddelelsen — som "Fjern", men
// med et CRM-spor. Kvitteringen vises af forælderen, fordi kortet forsvinder.
function RepliedButton({ item, onDone }: { item: InboxItem; onDone: (id: string, msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function mark() {
    setBusy(true);
    try {
      const res = await fetch("/api/replies/replied", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, from: item.from, note: item.suggestedReply ?? "", date: item.date }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d?.ok) {
        onDone(item.id, d.company ? `Svar logget på ${d.company} ✓` : "Skjult — ingen kunde matchet i CRM");
      } else {
        onDone(item.id, d?.error ? `Kunne ikke gemme: ${d.error}` : "Kunne ikke gemme.");
      }
    } catch {
      onDone(item.id, "Netværksfejl — intet blev gemt.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="cc-btn kinly-quiet-action" onClick={mark} disabled={busy} title="Jeg har svaret kunden — log det i CRM og skjul meddelelsen her">
      <Icon name="CheckCheck" style={{ width: 14, height: 14 }} /> {busy ? "Gemmer…" : "Svaret"}
    </button>
  );
}

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
      <button className="cc-btn cc-btn-accent" onClick={() => setOpen(true)}>
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

function QaSendButton({ item }: { item: InboxItem }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function send() {
    setState("sending"); setMsg("");
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(item.leadId!)}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: item.suggestedReply, subject: item.subject, leadName: item.fromName, mode: "qa" }),
      });
      const d = await res.json();
      if (d.sent) { setState("done"); setMsg("QA-kopi sendt til buur.aigro."); }
      else if (d.wouldSendTo) { setState("done"); setMsg("Ingen mail-creds — ville sende QA-kopi til buur.aigro."); }
      else { setState("error"); setMsg(d.error ?? "Kunne ikke sende."); }
    } catch (e) { setState("error"); setMsg(String(e)); }
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

function LiveSendButton({ item }: { item: InboxItem }) {
  const [state, setState] = useState<"idle" | "confirm" | "sending" | "done" | "blocked" | "error">("idle");
  const [msg, setMsg] = useState("");
  async function doSend() {
    setState("sending"); setMsg("");
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(item.leadId!)}/send-reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: item.suggestedReply, subject: `Re: ${item.subject}`, leadName: item.fromName, toEmail: item.from, mode: "live", confirm: true }),
      });
      const d = await res.json();
      if (d.sent) { setState("done"); setMsg(`Sendt til ${item.from}.`); }
      else if (d.needsArm) { setState("blocked"); setMsg(d.message ?? "Live-send er ikke armed."); }
      else { setState("error"); setMsg(d.message ?? d.error ?? "Kunne ikke sende."); }
    } catch (e) { setState("error"); setMsg(String(e)); }
  }
  if (state === "idle") return (
    <button className="cc-btn" onClick={() => setState("confirm")} style={{ borderColor: "var(--amber)", color: "var(--amber)" }}>
      <Icon name="Mail" style={{ width: 14, height: 14 }} /> Send til kunden…
    </button>
  );
  if (state === "confirm") return (
    <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
      <button className="cc-btn cc-btn-accent" onClick={doSend} style={{ background: "var(--amber)", borderColor: "var(--amber)" }}>Bekræft send til {item.from}</button>
      <button className="cc-btn" onClick={() => setState("idle")}>Fortryd</button>
    </span>
  );
  return <span className="cc-dim" style={{ fontSize: 12.5, color: state === "error" ? "var(--red)" : state === "done" ? "var(--accent-ink)" : "var(--text-muted)" }}>{state === "sending" ? "Sender…" : msg}</span>;
}

function ItemCard({ item, armed, onAnswered, onRemoved, onReplied }: { item: InboxItem; armed: boolean; onAnswered: (id: string) => void; onRemoved: (id: string) => void; onReplied: (id: string, msg: string) => void }) {
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
                title={`Modtaget på ${ACCOUNT_EMAIL[item.account] ?? item.account}`}
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
          {item.threadSummary && (
            <div>
              <div className="cc-kicker" style={{ marginBottom: 6 }}>Tråden indtil nu{item.threadCount ? ` · ${item.threadCount} mails` : ""}</div>
              <p className="cc-muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{item.threadSummary}</p>
            </div>
          )}
          <div>
            <div className="cc-kicker" style={{ marginBottom: 6 }}>Besked</div>
            <p className="cc-muted" style={{ fontSize: 13.5, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{item.snippet}</p>
          </div>
          {item.suggestedReply && (
            <div>
              <div className="cc-kicker" style={{ marginBottom: 6 }}>Foreslået svar</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10 }}>{item.suggestedReply}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {item.suggestedReply && <CopyReplyButton text={item.suggestedReply} />}
            {item.from && (
              <a className="cc-btn" href={gmailOpenLink(item)} target="_blank" rel="noreferrer">
                <Icon name="Mail" style={{ width: 14, height: 14 }} /> Åbn i Gmail
              </a>
            )}
            <RepliedButton item={item} onDone={onReplied} />
            <RemoveButton item={item} onRemoved={onRemoved} />
            {item.leadId && <MarkAnsweredForm item={item} onAnswered={() => onAnswered(item.id)} />}
          </div>
          {(item.leadId && item.suggestedReply) && (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <QaSendButton item={item} />
              {armed && <LiveSendButton item={item} />}
            </div>
          )}
          <div className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="CircleDot" style={{ width: 13, height: 13 }} />
            Selve mailen sender du fra Gmail. &quot;Svaret&quot; logger den på kundens tidslinje og skjuler den her; &quot;Markér som besvaret&quot; opdaterer hele udfaldet (status, tidslinje og opfølgning).
          </div>
        </div>
      )}
    </section>
  );
}

// "Scan nu": starter VPS-scanningen af Kinly-indbakken (inbox-digest-sync på
// lucas@kinly.dk) og genindlæser siden automatisk et par minutter efter —
// selve kørslen er asynkron og tager typisk 1-3 minutter.
function ScanNowButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function scan() {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/replies/refresh", { method: "POST" });
      const d = await r.json().catch(() => null);
      if (r.ok && d?.ok) {
        // Jobbet tager typisk 5-10 min på VPS'en — derfor 10 min og ærlig tekst,
        // så knappen ikke lover hurtigere resultat end den kan holde.
        setMsg("Scan kører på VPS'en (5-10 min). Siden opdateres om 10 min — eller tryk Opdater.");
        setTimeout(onDone, 600_000);
      } else {
        setMsg(d?.error ?? "Kunne ikke starte scan.");
      }
    } catch {
      setMsg("Kunne ikke starte scan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <button className="cc-btn kinly-next-action" onClick={scan} disabled={busy}><Icon name="Inbox" style={{ width: 14, height: 14 }} /> {busy ? "Starter…" : "Scan nu"}</button>
      {msg && <span className="cc-dim" style={{ fontSize: 12, color: "var(--amber)" }}>{msg}</span>}
    </span>
  );
}

export default function RepliesClient() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [source, setSource] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(false);
  const [showNoise, setShowNoise] = useState(false);
  const [flash, setFlash] = useState("");

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

  // "Svaret": meddelelsen er skjult server-side (KV-markering) — fjern den fra
  // listen med det samme og vis kvitteringen i toppen; kortet forsvinder, så
  // knappen kan ikke selv vise beskeden.
  function repliedItem(id: string, msg: string) {
    setDigest((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
    setFlash(msg);
    setTimeout(() => setFlash(""), 8000);
  }

  // Fjern: meddelelsen er allerede skjult server-side (KV-markering) — fjern den
  // fra den viste liste med det samme, så UI'et ikke venter på en ny hentning.
  function removeItem(id: string) {
    setDigest((d) => (d ? { ...d, items: d.items.filter((i) => i.id !== id) } : d));
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
            {source === "artifact" ? "Rangeret fra Kinly-indbakken (lucas@kinly.dk)" : "Ingen frisk digest — viser kun lead-matchede svar. Kør «Scan nu»."}
            {ageMin != null && ageMin >= 0 ? ` · opdateret ${formatAge(ageMin)}` : ""}
          </div>
        </div>
        {flash && <span className="cc-chip" style={{ background: "var(--accent-soft)", color: "var(--accent-ink)" }}>{flash}</span>}
        <ScanNowButton onDone={load} />
        <button className="cc-btn kinly-quiet-action" onClick={load}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater</button>
      </div>

      <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderColor: armed ? "var(--amber)" : "var(--border)" }}>
        <Icon name="ShieldCheck" style={{ width: 18, height: 18, color: armed ? "var(--amber)" : "var(--text-dim)" }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Live-send til kunden</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>{armed ? "Armed — hvert svar kræver stadig bekræftelse. Kun for lead-matchede svar." : "Slået fra. QA-kopier går kun til buur.aigro."}</div>
        </div>
        <button role="switch" aria-checked={armed} aria-label="Arm live-send" onClick={() => setArmed((v) => !v)}
          style={{ width: 46, height: 27, borderRadius: 999, border: "none", cursor: "pointer", position: "relative", background: armed ? "var(--amber)" : "var(--border-strong)", transition: "background 160ms ease", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 3, left: armed ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left 160ms cubic-bezier(0.22,1,0.36,1)" }} />
        </button>
      </div>

      {items.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="Inbox" /><div>Ingen svar at triagere lige nu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Morgen-scanneren fylder de vigtige svar ind her.</div></div></div>
      ) : (
        <>
          {needs.map((it) => <ItemCard key={it.id} item={it} armed={armed} onAnswered={markAnswered} onRemoved={removeItem} onReplied={repliedItem} />)}
          {noise.length > 0 && (
            <>
              <button className="cc-btn" style={{ justifySelf: "start" }} onClick={() => setShowNoise((v) => !v)}>
                <Icon name="ChevronRight" style={{ width: 14, height: 14, transform: showNoise ? "rotate(90deg)" : "none" }} />
                {showNoise ? "Skjul" : `Vis resten (${noise.length})`}
              </button>
              {showNoise && noise.map((it) => <ItemCard key={it.id} item={it} armed={armed} onAnswered={markAnswered} onRemoved={removeItem} onReplied={repliedItem} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
