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

function StatusButtons({ item }: { item: InboxItem }) {
  const [done, setDone] = useState("");
  const [busy, setBusy] = useState(false);
  async function set(status: "interested" | "not-interested" | "maybe-later") {
    if (!item.leadId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/replies/${encodeURIComponent(item.leadId)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, leadName: item.fromName }),
      });
      const d = await res.json();
      setDone(d.ok ? (status === "not-interested" ? "Markeret: ikke interesseret — kontakter ikke igen" : status === "maybe-later" ? "Markeret: måske senere (~30 dage)" : "Markeret: interesseret") : (d.error ?? "fejl"));
    } catch { setDone("fejl"); } finally { setBusy(false); }
  }
  if (!item.leadId) return null;
  if (done) return <span className="cc-dim" style={{ fontSize: 12, color: "var(--accent-ink)" }}>{done}</span>;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <button className="cc-btn" onClick={() => set("interested")} disabled={busy}>Interesseret</button>
      <button className="cc-btn" onClick={() => set("maybe-later")} disabled={busy}>Måske senere</button>
      <button className="cc-btn" onClick={() => set("not-interested")} disabled={busy} style={{ borderColor: "var(--red)", color: "var(--red)" }}>Ikke interesseret</button>
    </div>
  );
}

function ItemCard({ item, armed }: { item: InboxItem; armed: boolean }) {
  const [open, setOpen] = useState(false);
  const tone = catTone(item.category);
  return (
    <section className="cc-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="cc-focus"
        style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <span title={`vigtighed ${item.importance}`} style={{ width: 38, flexShrink: 0, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: item.importance >= 80 ? "var(--accent-ink)" : item.importance >= 55 ? "var(--amber)" : "var(--text-dim)" }}>{item.importance}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.fromName || item.from}</span>
            {item.account && (
              <span
                className="cc-chip"
                title={`Modtaget på ${item.account === "lucas" ? "buur.aigro@gmail.com" : "1charlie.nielsen@gmail.com"}`}
                style={{
                  fontSize: 10.5, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase",
                  padding: "2px 7px",
                  background: item.account === "lucas" ? "rgba(56, 132, 255, 0.12)" : "rgba(168, 85, 247, 0.14)",
                  color: item.account === "lucas" ? "#3a6cd6" : "#8b3fcb",
                  border: `1px solid ${item.account === "lucas" ? "rgba(56, 132, 255, 0.3)" : "rgba(168, 85, 247, 0.3)"}`,
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
          {item.suggestedReply && (
            <div>
              <div className="cc-kicker" style={{ marginBottom: 6 }}>Foreslået svar</div>
              <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10 }}>{item.suggestedReply}</p>
            </div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {item.gmailLink && (
              <a className="cc-btn" href={item.gmailLink} target="_blank" rel="noreferrer">
                <Icon name="Mail" style={{ width: 14, height: 14 }} /> Åbn i Gmail
              </a>
            )}
            {item.leadId && item.suggestedReply && <QaSendButton item={item} />}
            {armed && item.leadId && item.suggestedReply && <LiveSendButton item={item} />}
          </div>
          <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div className="cc-kicker" style={{ marginBottom: 6 }}>Marker lead</div>
            <StatusButtons item={item} />
          </div>
          <div className="cc-dim" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="CircleDot" style={{ width: 13, height: 13 }} />
            Triage er read-only. QA-kopi går kun til buur.aigro. Rigtigt svar + status-skift er din egen handling.
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
  async function scan() {
    setBusy(true);
    try { await fetch("/api/cron/inbox-triage?force=1"); onDone(); } catch { /* ignore */ } finally { setBusy(false); }
  }
  return <button className="cc-btn" onClick={scan} disabled={busy}><Icon name="Inbox" style={{ width: 14, height: 14 }} /> {busy ? "Scanner…" : "Scan nu"}</button>;
}

export default function RepliesClient() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [digest, setDigest] = useState<Digest | null>(null);
  const [source, setSource] = useState<string>("");
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [err, setErr] = useState("");
  const [armed, setArmed] = useState(false);
  const [showNoise, setShowNoise] = useState(false);

  function load() {
    setState("loading");
    fetch("/api/replies")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok === false) { setErr(d.error ?? "ukendt fejl"); setState("error"); setDigest(null); return; }
        setDigest(d.digest ?? null);
        setSource(d.source ?? "");
        setAgeMin(typeof d.summary?.ageMinutes === "number" ? d.summary.ageMinutes : null);
        setState("ok");
      })
      .catch((e) => { setErr(String(e)); setState("error"); });
  }
  // Initial load on mount. load() sets "loading" synchronously; that's the intent
  // (the skeleton), so the set-state-in-effect rule is intentionally suppressed.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  if (state === "loading") {
    return <div style={{ display: "grid", gap: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 72 }} />)}</div>;
  }
  if (state === "error") {
    const notConfigured = /imap not configured|not configured|gmail/i.test(err);
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Icon name={notConfigured ? "Mail" : "Activity"} style={{ width: 18, height: 18, color: "var(--amber)" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{notConfigured ? "Gmail er ikke sat op endnu" : "Kunne ikke nå indbakken"}</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{notConfigured ? "Sæt GMAIL_USER + GMAIL_APP_PASSWORD i miljøet, så scanner jeg indbakken for svar. Intet blev rørt." : `${err} — read-only, intet blev rørt.`}</div>
        </div>
      </div>
    );
  }

  const items = digest?.items ?? [];
  const needs = items.filter((i) => i.needsReply);
  const noise = items.filter((i) => !i.needsReply);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <Icon name="Inbox" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{needs.length} kræver svar · {items.length} scannet</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>
            {source === "artifact" ? "Rangeret af morgen-scan (Opus)" : "Live fallback — kun kendte leads. Fuld indbakke-triage kommer fra morgen-scanneren."}
            {ageMin != null && ageMin >= 0 ? ` · opdateret for ${ageMin} min siden` : ""}
          </div>
        </div>
        <ScanNowButton onDone={load} />
        <CopyPromptButton />
        <button className="cc-btn" onClick={load}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater</button>
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
          {needs.map((it) => <ItemCard key={it.id} item={it} armed={armed} />)}
          {noise.length > 0 && (
            <>
              <button className="cc-btn" style={{ justifySelf: "start" }} onClick={() => setShowNoise((v) => !v)}>
                <Icon name="ChevronRight" style={{ width: 14, height: 14, transform: showNoise ? "rotate(90deg)" : "none" }} />
                {showNoise ? "Skjul" : `Vis resten (${noise.length})`}
              </button>
              {showNoise && noise.map((it) => <ItemCard key={it.id} item={it} armed={armed} />)}
            </>
          )}
        </>
      )}
    </div>
  );
}
