"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_CATALOG } from "@/lib/demos";
import { previewSignature, stripSignature } from "@/lib/leads/signature-preview";
import Icon from "@/components/shell/Icon";
import { DEFAULT_SEQUENCE_LENGTH, GRADE_META, prettyUrl, WARMTH_META, type ActFn, type Demo, type QueueDraft } from "./types";

// Sender-telefoner brugt i preview. Embedded client-side så bundlen ikke
// trækker server-only env-vars; senders.ts er source of truth ved faktisk
// afsendelse. Hold i sync med LUCAS_SENDER_PHONE / CHARLIE_SENDER_PHONE.
const PREVIEW_LUCAS_PHONE = "+45 23 24 24 82";
const PREVIEW_CHARLIE_PHONE = "+45 42 25 32 62";

const CATALOG_GROUPS: [string, { label: string; url: string }[]][] = (() => {
  const m = new Map<string, { label: string; url: string }[]>();
  for (const d of DEMO_CATALOG) {
    if (!m.has(d.branch)) m.set(d.branch, []);
    m.get(d.branch)!.push({ label: d.label, url: d.url });
  }
  return [...m.entries()];
})();

export default function InboxDetail({
  draft,
  label,
  onLabel,
  onClose,
  onPrev,
  onNext,
  canPrev,
  canNext,
  onAct,
}: {
  draft: QueueDraft;
  label: "god" | "daarlig" | null;
  onLabel: (id: string, value: "god" | "daarlig" | null) => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
  // Samme generiske handling som det gamle /approve (actOn) — parent
  // afgør efter et vellykket approve/edit/reject om næste kladde skal glide ind.
  onAct: ActFn;
}) {
  const strippedOriginal = useMemo(() => stripSignature(draft.body), [draft.body]);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(strippedOriginal);
  const [demos, setDemos] = useState<Demo[]>(draft.demoPair);
  const [sender, setSender] = useState<"lucas" | "charlie">(draft.sender ?? "lucas");
  const [busy, setBusy] = useState<null | "approve" | "reject" | "set-demos" | "unapprove">(null);
  const [violations, setViolations] = useState<string[]>([]);

  // Lokal edit-state nulstilles automatisk ved kladde-skift: parent
  // monterer denne komponent med `key={draft.id}` (se InboxApp), så et
  // skift til en anden kladde giver en frisk instans i stedet for et
  // effect der synkront nulstiller state (undgår react-hooks/set-state-in-effect).

  const dirty = subject !== draft.subject || body !== strippedOriginal;
  const demosDirty = JSON.stringify(demos.map((d) => d.url)) !== JSON.stringify(draft.demoPair.map((d) => d.url));

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function chooseSender(next: "lucas" | "charlie") {
    if (next === sender) return;
    setSender(next);
    await onAct(draft.id, "set-sender", { sender: next });
  }

  function changeDemo(i: number, url: string) {
    const entry = DEMO_CATALOG.find((d) => d.url === url);
    if (!entry) return;
    const old = demos[i];
    setDemos((prev) => prev.map((d, j) => (j === i ? { label: entry.label, url: entry.url } : d)));
    if (old?.url && old.url !== entry.url) setBody((b) => b.split(old.url).join(entry.url));
  }

  async function saveDemos() {
    setBusy("set-demos");
    setViolations([]);
    const r = await onAct(draft.id, "set-demos", { demoPair: demos, body });
    if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    setBusy(null);
  }

  // Én smart godkend-knap: gemmer selv alt der er dirty (demoer → rettelse)
  // og godkender i ét klik — 1:1 med det gamle /approve.
  const approveSmart = useCallback(async () => {
    setBusy("approve");
    setViolations([]);
    if (demosDirty) {
      const r = await onAct(draft.id, "set-demos", { demoPair: demos, body });
      if (!r.ok) { setViolations(r.violations ?? ["Ukendt fejl"]); setBusy(null); return; }
    }
    const r = dirty
      ? await onAct(draft.id, "edit", { subject, body })
      : await onAct(draft.id, "approve");
    if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    setBusy(null);
  }, [draft.id, subject, body, demos, dirty, demosDirty]);

  const reject = useCallback(async () => {
    if (!window.confirm(`Afvis "${draft.name}"? Lead'en blokeres 14 dage. Intet sendes.`)) return;
    setBusy("reject");
    setViolations([]);
    const r = await onAct(draft.id, "reject");
    if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    setBusy(null);
  }, [draft.id, draft.name]);

  async function unapprove() {
    if (!window.confirm(`Fjern "${draft.name}" fra godkendt-listen?\n\nDen flyttes til afviste, og lead'en blokeres 14 dage så motoren ikke re-vælger.`)) return;
    setBusy("unapprove");
    setViolations([]);
    const r = await onAct(draft.id, "unapprove");
    if (!r.ok) setViolations(r.violations ?? ["Ukendt fejl"]);
    setBusy(null);
  }

  function focusEdit() {
    document.getElementById(`inbox-body-${draft.id}`)?.focus();
  }

  const decided = draft.status !== "pending";
  const isRemovable = draft.status === "approved" || draft.status === "edited";
  const g = draft.jev?.grade ?? "?";
  const gm = GRADE_META[g] ?? GRADE_META["?"];
  const complete = draft.jev?.lead != null && draft.jev?.draft != null;
  const facts = [...(draft.jev?.facts ?? []), ...(draft.jev?.followers ? [draft.jev.followers] : [])];
  const jevFlags = draft.jev?.flags ?? [];
  const sendIkke = jevFlags.includes("send ikke");
  const warmth = draft.history?.warmth ? WARMTH_META[draft.history.warmth] : null;

  return (
    <div className="inbox-detail" key={draft.id}>
      <div className="inbox-detail-head">
        <button type="button" className="inbox-detail-back" onClick={onClose}>
          <Icon name="ChevronRight" style={{ width: 16, height: 16, transform: "rotate(180deg)" }} />
          Til listen
        </button>
        <div className="inbox-detail-title-row">
          <div style={{ minWidth: 0 }}>
            <h2 className="inbox-detail-title">
              <a href={`/virksomheder?q=${encodeURIComponent(draft.name)}`} target="_blank" rel="noopener noreferrer">{draft.name}</a>
            </h2>
            <p className="inbox-detail-sub">
              {[draft.branch, draft.city].filter(Boolean).join(" · ")}
              {draft.professionalism ? ` — ${draft.professionalism}` : ""}
            </p>
            {draft.source === "opfoelgning" && draft.step && (
              <p className="inbox-detail-sub" style={{ marginTop: 4, fontWeight: 600, color: "var(--text)" }}>
                Opfølgning {draft.step}/{DEFAULT_SEQUENCE_LENGTH}
              </p>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
            <span title={complete ? `Prioritet: ${draft.jev?.priority}/100` : "Forretningen er ikke vurderet endnu"} style={{ fontSize: 13, fontWeight: 800, color: gm.fg, background: gm.bg, border: `1.5px solid ${gm.border}`, padding: "3px 9px", borderRadius: 8 }}>
              {g}{complete && draft.jev?.priority != null ? <span style={{ fontWeight: 600, fontSize: 11, marginLeft: 5, opacity: 0.85 }}>{draft.jev.priority}</span> : null}
            </span>
            <div className="inbox-detail-nav">
              <button type="button" className="inbox-detail-navbtn" onClick={onPrev} disabled={!canPrev} aria-label="Forrige kladde (k)"><Icon name="ChevronUp" style={{ width: 15, height: 15 }} /></button>
              <button type="button" className="inbox-detail-navbtn" onClick={onNext} disabled={!canNext} aria-label="Næste kladde (j)"><Icon name="ChevronDown" style={{ width: 15, height: 15 }} /></button>
            </div>
          </div>
        </div>

        {draft.source === "opfoelgning" && draft.status === "rejected" && draft.stoppedReason && (
          <div className="inbox-history-bar">
            <Icon name="X" style={{ width: 13, height: 13 }} />
            Sekvensen er stoppet: {draft.stoppedReason}
          </div>
        )}

        {draft.history?.seenBefore && (
          <div className="inbox-history-bar" data-warmth={warmth ? "" : undefined}>
            <Icon name="Clock" style={{ width: 13, height: 13 }} />
            Kontaktet før{draft.history.lastContactAt ? ` · sidst ${draft.history.lastContactAt}` : ""}
            {draft.history.daysSince != null ? ` (${draft.history.daysSince === 0 ? "i dag" : draft.history.daysSince === 1 ? "i går" : `${draft.history.daysSince} dage siden`})` : ""}
            {draft.history.replied === "aldrig" ? " · aldrig svaret" : ""}
            {warmth && <span style={{ marginLeft: "auto", padding: "2px 8px", fontSize: 11, fontWeight: 600, borderRadius: 999, color: warmth.fg, background: warmth.bg }}>{warmth.label}</span>}
          </div>
        )}
      </div>

      <div className="inbox-detail-body">
        {(draft.hooks.length > 0 || facts.length > 0) && (
          <div>
            {facts.length > 0 && <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "var(--text-muted)" }}>{facts.join(" · ")}</p>}
            <div className="inbox-cardrow">
              {draft.hooks.map((h, i) => <span key={i} className="inbox-hookchip" title={h}>{h}</span>)}
            </div>
          </div>
        )}

        {(draft.jev?.links?.length ?? 0) > 0 && (
          <div className="inbox-cardrow">
            {draft.jev!.links!.map((l) => (
              <a key={l.kind} href={l.href} target="_blank" rel="noopener noreferrer" className="inbox-hookchip" style={{ textDecoration: "none", fontWeight: 600 }}>
                {l.label} ↗
              </a>
            ))}
          </div>
        )}

        {sendIkke && <div style={{ fontSize: 12, fontWeight: 700, color: "var(--red)" }}>Send ikke — {jevFlags.filter((f) => f !== "send ikke").join(", ") || "lav kvalitet"}</div>}

        {draft.status === "sent" ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Sendt som <strong style={{ color: "var(--text)" }}>{(draft.sentBy ?? draft.sender ?? "lucas") === "charlie" ? "Charlie" : "Lucas"}</strong>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Afsender</span>
            <div className="inbox-sender-toggle">
              {(["lucas", "charlie"] as const).map((s) => (
                <button key={s} type="button" className="inbox-chip" data-active={sender === s} onClick={() => chooseSender(s)}>{s === "lucas" ? "Lucas" : "Charlie"}</button>
              ))}
            </div>
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Konto + underskrift sættes automatisk ved afsendelse.</span>
          </div>
        )}

        <div className="inbox-paper">
          <div className="inbox-paper-field">
            <label htmlFor={`inbox-subject-${draft.id}`}>Emne</label>
            <input id={`inbox-subject-${draft.id}`} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={decided} />
          </div>
          <div className="inbox-paper-field">
            <label htmlFor={`inbox-body-${draft.id}`}>Besked</label>
            <textarea id={`inbox-body-${draft.id}`} value={body} onChange={(e) => setBody(e.target.value)} disabled={decided} rows={Math.min(18, Math.max(8, body.split("\n").length + 1))} />
          </div>
          <div className="inbox-signature">
            <div className="kicker">Officiel Kinly-signatur tilføjes automatisk ved afsendelse ({sender === "lucas" ? "Lucas Buur <lucas@kinly.dk>" : "Charlie Nielsen <charlie@kinly.dk>"})</div>
            <pre>{previewSignature("", sender, PREVIEW_LUCAS_PHONE, PREVIEW_CHARLIE_PHONE).trim()}</pre>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>Demoer i mailen</div>
          <div className="inbox-cardrow">
            {(decided ? draft.demoPair : demos).map((d, i) => (
              <div key={i} className="inbox-democard">
                {decided ? (
                  <a href={d.url} target="_blank" rel="noopener noreferrer">{d.label} — {prettyUrl(d.url)} ↗</a>
                ) : (
                  <>
                    <select value={d.url} onChange={(e) => changeDemo(i, e.target.value)}>
                      {CATALOG_GROUPS.map(([branch, items]) => (
                        <optgroup key={branch} label={branch}>
                          {items.map((it) => <option key={it.url} value={it.url}>{it.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">{prettyUrl(d.url)} ↗</a>
                  </>
                )}
              </div>
            ))}
          </div>
          {!decided && demosDirty && (
            <button type="button" className="inbox-btn" onClick={saveDemos} disabled={busy !== null} style={{ marginTop: 10 }}>
              {busy === "set-demos" ? "Gemmer…" : "Gem demoer"}
            </button>
          )}
        </div>

        <details className="inbox-jev">
          <summary className="inbox-jev-summary">
            Jev-vurdering
            <span style={{ color: "var(--text-dim)", fontWeight: 500 }}>Lead {draft.jev?.lead ?? "–"}/100 · Kladde {draft.jev?.draft ?? "–"}/100</span>
          </summary>
          <div className="inbox-jev-body">
            {jevFlags.length > 0 && <div className="inbox-cardrow">{jevFlags.map((f) => <span key={f} className="inbox-jev-flag">{f}</span>)}</div>}
            <span>{complete ? "Begge halvdele er vurderet — karakteren er sammenlagt." : "Forretningen er ikke vurderet endnu — kun kladden tæller."}</span>
          </div>
        </details>

        {violations.length > 0 && (
          <div className="inbox-violations">
            <strong style={{ color: "var(--amber)" }}>Bryder stemme-guiden:</strong> {violations.join(" · ")}
          </div>
        )}
      </div>

      {!decided && (
        <div className="inbox-actionbar">
          <button type="button" className="inbox-btn inbox-btn-primary" onClick={approveSmart} disabled={busy !== null}>
            {busy === "approve" ? "Godkender…" : dirty || demosDirty ? "Gem + godkend" : "Godkend"}
          </button>
          <button type="button" className="inbox-btn" onClick={focusEdit} title="Fokusér beskedfeltet for at rette">Ret</button>
          <button type="button" className="inbox-btn inbox-btn-danger" onClick={reject} disabled={busy !== null}>
            {busy === "reject" ? "Afviser…" : "Afvis"}
          </button>
          <div style={{ display: "flex", gap: 4, marginLeft: "auto" }}>
            {([["god", "God kunde", "var(--green)"], ["daarlig", "Dårlig", "var(--red)"]] as const).map(([v, t, farve]) => {
              const aktiv = label === v;
              return (
                <button key={v} type="button" className="inbox-labelbtn" title={`${t} — kun til kalibrering`} onClick={() => onLabel(draft.id, aktiv ? null : v)} style={{ color: aktiv ? "var(--surface)" : farve, background: aktiv ? farve : "transparent", border: `1px solid ${farve}` }}>
                  {v === "god" ? "God" : "Dårlig"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isRemovable && (
        <div className="inbox-actionbar">
          <button type="button" className="inbox-btn" onClick={unapprove} disabled={busy !== null} title="Fjern fra godkendt-listen — lead'en blokeres i 14 dage">
            {busy === "unapprove" ? "Fjerner…" : "Fjern fra godkendt"}
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>Markeres som afvist + lead&apos;en blokeres i 14 dage.</span>
        </div>
      )}
    </div>
  );
}
