"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import "./kundeopdateringer.css";

// Delt editor for én kundeopdatering-kladde: bruges inline på virksomhedens
// profil (lige efter "Lav kundeopdatering") OG som detaljepanel på
// /kundeopdateringer. Kladden sendes ALDRIG herfra — kun "Åbn i Gmail", som
// åbner mail.google.com i en ny fane med felterne forudfyldt.

export interface CustomerUpdateDTO {
  id: string;
  companyId: string;
  company: string;
  subject: string;
  body: string;
  to: string;
  status: "kladde" | "sendt" | "kasseret";
  actor: string;
  at: string;
}

const STATUS_LABEL: Record<CustomerUpdateDTO["status"], string> = { kladde: "Kladde", sendt: "Sendt", kasseret: "Kasseret" };

const STATUS_STYLE: Record<CustomerUpdateDTO["status"], { background: string; color: string }> = {
  kladde: { background: "var(--bg-3)", color: "var(--text-muted)" },
  sendt: { background: "var(--green-dim)", color: "var(--green)" },
  kasseret: { background: "var(--red-dim)", color: "var(--red)" },
};

function actorName(actor: string): string {
  if (actor === "lucas") return "Lucas";
  if (actor === "charlie") return "Charlie";
  return actor ? actor[0].toUpperCase() + actor.slice(1) : "Kinly";
}

function gmailUrl(to: string, subject: string, body: string, actor: string): string {
  const signed = `${body}\n\nMed venlig hilsen\n${actorName(actor)}\nKinly`;
  const params = new URLSearchParams({ view: "cm", fs: "1", to, su: subject, body: signed });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

export default function UpdateEditor({ update, onChange }: { update: CustomerUpdateDTO; onChange?: (u: CustomerUpdateDTO) => void }) {
  const router = useRouter();
  const [to, setTo] = useState(update.to);
  const [subject, setSubject] = useState(update.subject);
  const [body, setBody] = useState(update.body);
  const [busy, setBusy] = useState<"save" | "sendt" | "kasseret" | null>(null);
  const [err, setErr] = useState("");
  const editable = update.status === "kladde";

  async function patch(change: Record<string, unknown>, kind: "save" | "sendt" | "kasseret") {
    setBusy(kind);
    setErr("");
    try {
      const res = await fetch(`/api/kundeopdateringer/${update.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
      onChange?.({ ...update, to, subject, body, ...change } as CustomerUpdateDTO);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ko-editor">
      <p className="cc-dim" style={{ fontSize: 12 }}>Kladden sendes fra din egen Gmail — intet sendes automatisk.</p>

      <div className="ko-editor-row">
        <span className="virk-status-chip" style={STATUS_STYLE[update.status]}>{STATUS_LABEL[update.status]}</span>
        <span className="cc-dim cc-mono" style={{ fontSize: 11.5 }}>{update.company}</span>
      </div>

      <label className="ko-field">
        <span>Til</span>
        <input value={to} onChange={(e) => setTo(e.target.value)} disabled={!editable} aria-label="Modtager" />
      </label>
      <label className="ko-field">
        <span>Emne</span>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!editable} aria-label="Emne" />
      </label>
      <label className="ko-field">
        <span>Tekst</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!editable} aria-label="Tekst" rows={7} />
      </label>

      {!to.trim() && <span className="cc-dim" style={{ fontSize: 11.5 }}>Ingen modtager-mail fundet — udfyld &quot;Til&quot; for at åbne i Gmail.</span>}
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}

      <div className="ko-editor-actions">
        {editable && (
          <button className="cc-btn virk-btn-press" onClick={() => patch({ subject, body, to }, "save")} disabled={busy !== null}>
            {busy === "save" ? "Gemmer…" : "Gem"}
          </button>
        )}
        <a
          className="cc-btn cc-btn-accent virk-btn-press"
          href={gmailUrl(to, subject, body, update.actor)}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!to.trim()}
          onClick={(e) => { if (!to.trim()) e.preventDefault(); }}
        >
          Åbn i Gmail
        </a>
        {editable && (
          <>
            <button className="cc-btn virk-btn-press" onClick={() => patch({ subject, body, to, status: "sendt" }, "sendt")} disabled={busy !== null}>
              {busy === "sendt" ? "Markerer…" : "Markér som sendt"}
            </button>
            <button className="cc-btn virk-btn-press" onClick={() => patch({ status: "kasseret" }, "kasseret")} disabled={busy !== null} style={{ color: "var(--red)" }}>
              {busy === "kasseret" ? "Kasserer…" : "Kassér"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
