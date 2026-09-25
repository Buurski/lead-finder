"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { safeHref } from "@/lib/safe-href";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { timeAgo } from "@/components/hq/time";
import "./gratis-udkast.css";

type Status = "ny" | "researcher" | "bygger" | "preview klar" | "godkendt" | "kladde klar" | "afvist" | "sendt/lukket";

interface PreviewRequest {
  id: string;
  company: string;
  contactName?: string;
  branch?: string;
  channel: "formular" | "mail";
  email: string;
  website?: string;
  questionnaire?: string;
  status: Status;
  research?: string;
  previewUrl?: string;
  screenshotUrl?: string;
  mailDraft?: string;
  reviewNotes?: string;
  /** Fra SEO-tjekket på kinly.dk: ingen demo — besvares med rapportmailen og kan sendes med det samme. */
  seoTjek?: { host: string; score: number; mangler: string[] };
  /** Afsendelseskrav fra Postgres: "sending" = uafklaret/låst, "uncertain" = registreret usikkert, "sent" = sendt. */
  sendClaim?: "sending" | "uncertain" | "sent";
  createdAt: string;
  updatedAt: string;
}

interface Senders {
  lucas: boolean;
  charlie: boolean;
}

const READY: Status[] = ["preview klar", "godkendt", "kladde klar"];
const WORKING: Status[] = ["ny", "researcher", "bygger"];
const SENDABLE: Status[] = ["preview klar", "godkendt", "kladde klar"];

const WORKING_LABEL: Record<string, string> = {
  ny: "Ny henvendelse — venter på Hermes",
  researcher: "Hermes undersøger virksomheden",
  bygger: "Hermes bygger udkastet",
};

const DEFAULT_SUBJECT = "Jeres gratis udkast fra Kinly";

function defaultBody(item: PreviewRequest): string {
  const hilsen = item.contactName ? `Hej ${item.contactName},` : "Hej,";
  if (item.seoTjek) return `${hilsen}

Tak fordi du tjekkede ${item.seoTjek.host} hos os. Herunder er resultatet og de ting, jeg ville rette først.

Skriv eller ring, hvis du vil have hjælp til det.`;
  const link = item.previewUrl ?? "";
  return `${hilsen}\n\nTak fordi I spurgte. Her er et første udkast til en ny hjemmeside til ${item.company}:\n${link}\n\nDet er et udkast — alt kan rettes. Sig til hvad I synes, så tager vi den derfra.`;
}

function groupOf(r: PreviewRequest): "ready" | "working" | "sent" | "rejected" {
  const status = r.status;
  if (READY.includes(status) || (r.seoTjek && WORKING.includes(status))) return "ready";
  if (WORKING.includes(status)) return "working";
  if (status === "afvist") return "rejected";
  return "sent";
}

export default function GratisUdkast({ senders }: { senders: Senders }) {
  const [requests, setRequests] = useState<PreviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Kun det allerførste kald viser skeletonen. En baggrunds-genindlæsning
  // (fx efter send) må ikke afmontere detalje-panelet og nulstille dets
  // lokale "Sendt"-tilstand.
  const loadedOnce = useRef(false);

  const load = useCallback(async (keepSelection = true) => {
    if (!loadedOnce.current) setLoading(true);
    try {
      const res = await fetch("/api/previews", { cache: "no-store" });
      if (!res.ok) throw new Error("Serveren svarede ikke som ventet.");
      const list: PreviewRequest[] = (await res.json()).requests ?? [];
      setRequests(list);
      setError("");
      setSelectedId((prev) => {
        if (keepSelection && prev && list.some((r) => r.id === prev)) return prev;
        // Auto-vælg kun på desktop — på mobil er detaljen en fuldskærms-overlay,
        // og skal åbnes med et bevidst tryk, ikke poppe op over listen.
        if (typeof window === "undefined" || !window.matchMedia("(min-width: 900px)").matches) return null;
        const firstReady = list.find((r) => groupOf(r) === "ready");
        return firstReady?.id ?? null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunne ikke hente udkastene");
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(false); }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const by = { ready: [] as PreviewRequest[], working: [] as PreviewRequest[], sent: [] as PreviewRequest[], rejected: [] as PreviewRequest[] };
    for (const r of requests) by[groupOf(r)].push(r);
    return by;
  }, [requests]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  async function patch(id: string, body: Record<string, unknown>) {
    const res = await fetch("/api/previews", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Kunne ikke gemme ændringen lige nu.");
    await load();
  }

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        icon="LayoutGrid"
        title="Gratis udkast"
        subtitle="Henvendelser fra kinly.dk og ja-tak-svar. Hermes forsker og bygger — I tjekker og sender."
        action={<button className="cc-btn" onClick={() => void load()}>Opdatér</button>}
      />

      {error && (
        <div className="cc-card cc-card-pad" role="alert" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span>Kunne ikke hente udkastene: {error}</span>
          <button className="cc-btn" style={{ marginLeft: "auto" }} onClick={() => void load()}>Prøv igen</button>
        </div>
      )}

      {loading && !error && (
        <div style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 60 }} />)}
        </div>
      )}

      {!loading && !error && requests.length === 0 && (
        <div className="cc-card cc-card-pad">
          <div className="cc-empty">
            <Icon name="LayoutGrid" />
            <div>Ingen udkast venter. Nye kommer automatisk når nogen beder om et på kinly.dk eller svarer ja tak.</div>
          </div>
        </div>
      )}

      {!loading && !error && requests.length > 0 && (
        <div className="gu-layout">
          <div className="gu-list-col">
            <Group title="Klar til dig" items={groups.ready} selectedId={selectedId} onPick={setSelectedId} />
            <Group title="Hermes arbejder" items={groups.working} selectedId={selectedId} onPick={setSelectedId} />
            <Group title="Sendt" items={groups.sent} selectedId={selectedId} onPick={setSelectedId} />
            <Group title="Afvist" items={groups.rejected} selectedId={selectedId} onPick={setSelectedId} />
          </div>

          {selected ? (
            <Detail
              key={selected.id}
              item={selected}
              senders={senders}
              onClose={() => setSelectedId(null)}
              onPatch={(body) => patch(selected.id, body)}
              onSent={() => void load()}
            />
          ) : (
            <div className="cc-card cc-card-pad gu-detail-placeholder">
              <div className="cc-empty">
                <Icon name="LayoutGrid" />
                <div>Vælg et udkast i listen for at se detaljer.</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({ title, items, selectedId, onPick }: { title: string; items: PreviewRequest[]; selectedId: string | null; onPick: (id: string) => void }) {
  if (items.length === 0) return null;
  const tone = title === "Klar til dig" ? "ready" : title === "Hermes arbejder" ? "working" : title === "Sendt" ? "sent" : "rejected";
  return (
    <div className="gu-group">
      <div className="gu-group-title">
        <span className="cc-kicker">{title}</span>
        <span className="gu-group-count">{items.length}</span>
      </div>
      {items.map((item) => (
        <button
          key={item.id}
          className="gu-item"
          data-active={item.id === selectedId}
          onClick={() => onPick(item.id)}
        >
          <div className="gu-item-top">
            <span className="gu-item-name"><span className="gu-dot" data-tone={tone} style={{ marginRight: 7 }} />{item.company}</span>
            <span className="gu-item-time">{timeAgo(item.createdAt)}</span>
          </div>
          <span className="gu-item-sub">
            {item.seoTjek ? `SEO-tjek ${item.seoTjek.score}/100 · klar til svar` : WORKING.includes(item.status) ? WORKING_LABEL[item.status] : item.branch || item.email}
          </span>
        </button>
      ))}
    </div>
  );
}

function CompanyLink({ item }: { item: PreviewRequest }) {
  const [hit, setHit] = useState<{ id: string; name: string; city: string } | null | undefined>(undefined);

  useEffect(() => {
    // Detail (forælderen) har key={item.id}, så denne komponent genmonteres
    // pr. udkast — item.company skifter aldrig inden for ét mount.
    let cancelled = false;
    fetch(`/api/virksomheder/search?q=${encodeURIComponent(item.company)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Array<{ id: string; name: string; city: string }>) => {
        if (cancelled) return;
        const exact = rows.find((r) => r.name.toLowerCase() === item.company.toLowerCase());
        setHit(exact ?? rows[0] ?? null);
      })
      .catch(() => { if (!cancelled) setHit(null); });
    return () => { cancelled = true; };
  }, [item.company]);

  if (!hit) return null;
  return (
    <a className="gu-company-link" href={`/virksomheder/${hit.id}`}>
      <Icon name="Building2" style={{ width: 14, height: 14 }} />
      Virksomhedsprofil: {hit.name}{hit.city ? ` · ${hit.city}` : ""}
    </a>
  );
}

function Detail({ item, senders, onClose, onPatch, onSent }: {
  item: PreviewRequest;
  senders: Senders;
  onClose: () => void;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
  onSent: () => void;
}) {
  const [subject, setSubject] = useState(item.seoTjek ? `Dit SEO-tjek af ${item.seoTjek.host}` : DEFAULT_SUBJECT);
  const [body, setBody] = useState(item.mailDraft || defaultBody(item));
  const [sender, setSender] = useState<"lucas" | "charlie">(senders.lucas ? "lucas" : "charlie");
  const [sendState, setSendState] = useState<"idle" | "confirm" | "sending" | "sent" | "error">(
    item.status === "sendt/lukket" ? "sent" : "idle",
  );
  const [sendErr, setSendErr] = useState("");
  // Afledt af den aktuelle liste (opdateres ved reload); "cleared" skjuler kun det krav vi selv har afstemt (Sol R5-4).
  const [cleared, setCleared] = useState<string | undefined>();
  const claim = cleared === item.sendClaim ? undefined : item.sendClaim;
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [screenshotFailed, setScreenshotFailed] = useState(false);
  const [sentAt, setSentAt] = useState(item.status === "sendt/lukket" ? item.updatedAt : "");

  // Samme regel som isSendable() i lib/hq/preview-send.ts (server-kopien er den der gælder).
  const sendable = item.seoTjek ? !["afvist", "sendt/lukket"].includes(item.status) : SENDABLE.includes(item.status) && Boolean(item.previewUrl);

  async function send() {
    setSendState("sending");
    setSendErr("");
    setCleared(undefined); // nyt forsøg ⇒ et nyt krav må ikke skjules af et gammelt (Sol R6-F4)
    try {
      const res = await fetch(`/api/previews/${item.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, subject, body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Kunne ikke sende lige nu.");
      setSendState("sent");
      setSentAt(new Date().toISOString());
      onSent();
    } catch (e) {
      setSendState("error");
      setSendErr(e instanceof Error ? e.message : "kunne ikke sende");
    }
  }

  async function reconcile(verdict: "sent" | "not-sent") {
    try {
      const res = await fetch(`/api/previews/${item.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconcile: verdict }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || "Kunne ikke afstemme lige nu.");
      setSendErr("");
      setCleared(item.sendClaim);
      if (verdict === "sent") {
        setSendState("sent");
        setSentAt(new Date().toISOString());
        onSent();
      } else setSendState("idle");
    } catch (e) {
      setSendErr(e instanceof Error ? e.message : "kunne ikke afstemme");
    }
  }

  async function saveDraft() {
    setSaving(true);
    setSaveMsg("");
    try {
      await onPatch({ status: item.status, mailDraft: body });
      setSaveMsg("Kladde gemt");
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  }

  async function reject() {
    setRejecting(true);
    try {
      await onPatch({ status: "afvist" });
    } catch {
      // load() i onPatch retryer selv ved næste opdatér — vis intet spinnende fejlbanner for et lavrisiko-klik.
    } finally {
      setRejecting(false);
    }
  }

  return (
    <div className="cc-card cc-card-pad gu-detail">
      <button className="cc-btn gu-detail-back" style={{ marginBottom: 14 }} onClick={onClose}>
        <Icon name="ChevronRight" style={{ width: 14, height: 14, transform: "rotate(180deg)" }} /> Tilbage
      </button>

      <div className="gu-detail-head">
        <div style={{ minWidth: 0 }}>
          <h2 className="gu-detail-title">{item.company}</h2>
          <div className="gu-detail-meta">
            {item.contactName ? `${item.contactName} · ` : ""}{item.email}
            {item.branch ? ` · ${item.branch}` : ""}
          </div>
        </div>
        <span className="cc-chip" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{item.status}</span>
      </div>

      <div className="gu-visual">
        {item.screenshotUrl && !screenshotFailed ? (
          <a href={safeHref(item.previewUrl || item.screenshotUrl)} target="_blank" rel="noreferrer" style={{ flex: 1 }}>
            <img src={safeHref(item.screenshotUrl)} alt={`Screenshot af ${item.company}`} onError={() => setScreenshotFailed(true)} />
          </a>
        ) : (
          <span className="gu-visual-empty" style={{ margin: "auto" }}>
            {item.seoTjek
              ? `SEO-tjek ${item.seoTjek.score}/100 på ${item.seoTjek.host} · ${item.seoTjek.mangler.length} ting at rette. Svar med rapportmailen herunder.`
              : item.previewUrl ? "Intet screenshot endnu" : "Demo ikke klar endnu"}
          </span>
        )}
        {item.previewUrl && (
          <a className="gu-visual-link" href={safeHref(item.previewUrl)} target="_blank" rel="noreferrer">
            <Icon name="ArrowUpRight" style={{ width: 14, height: 14 }} /> Åbn udkastet
          </a>
        )}
      </div>

      {WORKING.includes(item.status) && !item.seoTjek && (
        <div className="gu-working-note">
          <Icon name="Hourglass" style={{ width: 15, height: 15 }} />
          {WORKING_LABEL[item.status]} · startede {timeAgo(item.createdAt)}
        </div>
      )}

      <div className="gu-fields">
        <div>
          <span className="cc-kicker">Kanal</span>
          <div className="gu-field-value">{item.channel === "formular" ? "Formular på kinly.dk" : "Svar på mail (ja tak til udkast)"}</div>
        </div>
        {item.questionnaire && (
          <div>
            <span className="cc-kicker">Hvad de skrev</span>
            <div className="gu-field-value">{item.questionnaire}</div>
          </div>
        )}
        {item.website && (
          <div>
            <span className="cc-kicker">Nuværende side</span>
            <div className="gu-field-value"><a href={safeHref(item.website)} target="_blank" rel="noreferrer">{item.website}</a></div>
          </div>
        )}
        <CompanyLink item={item} />
      </div>

      {sendState === "sent" ? (
        <div className="gu-sent-note">
          <Icon name="CheckCheck" style={{ width: 16, height: 16 }} />
          Sendt{sentAt ? ` · ${new Date(sentAt).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
        </div>
      ) : item.status === "afvist" ? (
        <div className="gu-working-note">
          <Icon name="X" style={{ width: 15, height: 15 }} />
          Afvist — sendes ikke.
        </div>
      ) : sendable ? (
        <div className="gu-mail-form">
          <label>
            <span className="cc-kicker">Emne</span>
            <input className="gu-input" style={{ marginTop: 5 }} value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Emne" />
          </label>
          <label>
            <span className="cc-kicker">Mail til {item.email}</span>
            <textarea className="gu-textarea" style={{ marginTop: 5 }} rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Mailtekst" />
          </label>
          <MailPreview id={item.id} sender={sender} body={body} />
          <div className="gu-mail-row">
            <span className="cc-kicker" style={{ marginRight: 2 }}>Afsender</span>
            <div className="gu-sender-pick">
              <SenderButton id="lucas" label="Lucas" active={sender === "lucas"} connected={senders.lucas} onPick={setSender} />
              <SenderButton id="charlie" label="Charlie" active={sender === "charlie"} connected={senders.charlie} onPick={setSender} />
            </div>
          </div>

          <div className="gu-actions">
            {sendState === "confirm" ? (
              <span className="gu-confirm">
                <button className="cc-btn cc-btn-accent" onClick={() => void send()}>Bekræft send til {item.email}</button>
                <button className="cc-btn" onClick={() => setSendState("idle")}>Fortryd</button>
              </span>
            ) : (
              <button
                className="cc-btn cc-btn-accent"
                disabled={sendState === "sending" || !(sender === "lucas" ? senders.lucas : senders.charlie)}
                onClick={() => setSendState("confirm")}
              >
                {sendState === "sending" ? "Sender…" : "Send udkast"}
              </button>
            )}
            <button className="cc-btn" onClick={() => void saveDraft()} disabled={saving}>{saving ? "Gemmer…" : "Gem kladde"}</button>
            <button className="cc-btn" onClick={() => void reject()} disabled={rejecting} style={{ color: "var(--red)" }}>Afvis</button>
            {saveMsg && <span className="cc-dim" style={{ fontSize: 12.5 }}>{saveMsg}</span>}
          </div>
          {sendErr && <div className="gu-error-note">{sendErr}</div>}
        </div>
      ) : (
        <div className="gu-actions">
          <button className="cc-btn" onClick={() => void reject()} disabled={rejecting} style={{ color: "var(--red)" }}>Afvis</button>
        </div>
      )}
      {/* Afstemning vises uanset status/link: et uafklaret krav skal altid kunne løses (Sol R6-F3). */}
      {!sendable && sendErr && <div className="gu-error-note">{sendErr}</div>}
      {(claim === "sent" || claim === "sending") && item.status !== "sendt/lukket" && (
        <div className="gu-actions">
          <span className="cc-dim" style={{ fontSize: 12.5 }}>
            {claim === "sent" ? "Mailen er sendt, men status blev ikke opdateret." : "Afsendelsen blev ikke afklaret. Tjek Gmail Sendt."}
          </span>
          <button className="cc-btn" onClick={() => void reconcile("sent")}>Markér som sendt</button>
        </div>
      )}
      {(claim === "uncertain" || (!claim && sendErr.includes("usikkert"))) && (
        <div className="gu-actions">
          <span className="cc-dim" style={{ fontSize: 12.5 }}>Tjekket Gmail Sendt?</span>
          <button className="cc-btn" onClick={() => void reconcile("sent")}>Den er sendt</button>
          <button className="cc-btn" onClick={() => void reconcile("not-sent")}>Den er ikke sendt</button>
        </div>
      )}
    </div>
  );
}

function SenderButton({ id, label, active, connected, onPick }: { id: "lucas" | "charlie"; label: string; active: boolean; connected: boolean; onPick: (id: "lucas" | "charlie") => void }) {
  return (
    <button
      type="button"
      className="gu-sender-btn"
      aria-pressed={active}
      disabled={!connected}
      onClick={() => onPick(id)}
    >
      {label}
      {!connected && <span className="gu-pill-unconnected">Ikke forbundet</span>}
    </button>
  );
}

/**
 * Forhåndsvisning af den mail der faktisk sendes (samme komposition som send-ruten).
 * Kom henvendelsen fra SEO-tjekket, er det den designede rapport med tal, huller og tilbud.
 * Sandboxet iframe: ingen scripts, ingen navigation fra mailens links.
 */
function MailPreview({ id, sender, body }: { id: string; sender: "lucas" | "charlie"; body: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [report, setReport] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/previews/${id}/mail-preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender, body }),
        signal: ctrl.signal,
      })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }: { ok: boolean; j: { html?: string; report?: boolean; error?: string } }) => {
          if (ok && j.html) {
            setErr(null);
            setHtml(j.html);
            setReport(Boolean(j.report));
          } else {
            setHtml(null);
            setErr(j.error ?? "Kunne ikke vise mailen");
          }
        })
        .catch(() => {});
    }, 400);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [open, id, sender, body]);
  return (
    <div>
      <button type="button" className="cc-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "Skjul forhåndsvisning" : "Vis mailen som modtageren ser den"}
      </button>
      {open ? (
        <div style={{ marginTop: 8 }}>
          {report ? <p className="cc-kicker" style={{ margin: "0 0 6px" }}>SEO-rapport med tilbud (fra SEO-tjekket)</p> : null}
          {err ? (
            <p role="alert" className="cc-kicker" style={{ color: "var(--danger, #b3261e)" }}>Kan ikke sendes sådan: {err}</p>
          ) : html ? (
            <iframe title="Forhåndsvisning af mailen" sandbox="" srcDoc={html} style={{ width: "100%", height: 640, border: "1px solid var(--rule, #e4dccd)", borderRadius: 10, background: "#faf6ef" }} />
          ) : (
            <p className="cc-kicker">Henter…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
