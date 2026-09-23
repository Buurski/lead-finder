"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DEAL_STAGES, STAGE_LABEL, normalizeStage, type DealStage } from "./dealStages";

interface DealRow {
  id: string;
  title: string;
  stage: string;
  valueDkk: number | null;
  mrrDkk: number | null;
  nextStep: string | null;
  nextStepDue: string | null;
}

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;

async function patchDeal(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/deals/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
}

function Deal({ deal, onSaved }: { deal: DealRow; onSaved: () => void }) {
  const [stage, setStage] = useState(normalizeStage(deal.stage));
  const [nextStep, setNextStep] = useState(deal.nextStep ?? "");
  const [nextStepDue, setNextStepDue] = useState(deal.nextStepDue ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [dirty, setDirty] = useState(false);

  async function saveStage(next: DealStage) {
    const prev = stage;
    setStage(next);
    setErr("");
    try {
      await patchDeal(deal.id, { stage: next });
      onSaved();
    } catch (e) {
      setStage(prev);
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    }
  }

  async function saveNextStep() {
    setBusy(true);
    setErr("");
    try {
      await patchDeal(deal.id, { nextStep, nextStepDue: nextStepDue || null });
      setDirty(false);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke gemme");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="virk-deal">
      <div className="virk-deal-top">
        <strong style={{ fontSize: 13.5 }}>{deal.title || "Aftale"}</strong>
        <span className="virk-deal-amount">
          {deal.mrrDkk ? `${kr(deal.mrrDkk)}/md` : deal.valueDkk ? kr(deal.valueDkk) : "–"}
        </span>
      </div>
      <div className="virk-deal-row">
        <select
          className="virk-stage-select"
          value={stage}
          onChange={(e) => saveStage(e.target.value as DealStage)}
          aria-label={`Fase for ${deal.title || "aftale"}`}
        >
          {DEAL_STAGES.map((s) => (
            <option key={s} value={s}>{STAGE_LABEL[s]}</option>
          ))}
        </select>
        <input
          className="virk-inline-input"
          style={{ flex: 1, minWidth: 120 }}
          value={nextStep}
          placeholder="Næste skridt…"
          onChange={(e) => { setNextStep(e.target.value); setDirty(true); }}
          aria-label="Næste skridt"
        />
        <input
          className="virk-inline-input"
          type="date"
          value={nextStepDue}
          onChange={(e) => { setNextStepDue(e.target.value); setDirty(true); }}
          aria-label="Frist for næste skridt"
        />
        {dirty && (
          <button className="cc-btn virk-btn-press" onClick={saveNextStep} disabled={busy}>
            {busy ? "Gemmer…" : "Gem"}
          </button>
        )}
      </div>
      {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
    </div>
  );
}

export default function DealsSection({ companyId, deals }: { companyId: string; deals: DealRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [mrr, setMrr] = useState("");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function createDeal() {
    if (!title.trim()) { setErr("Titel mangler."); return; }
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          title: title.trim(),
          mrrDkk: mrr ? Number(mrr) : undefined,
          valueDkk: value ? Number(value) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke oprette aftalen");
      setTitle(""); setMrr(""); setValue(""); setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke oprette aftalen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="virk-section-title">
        <span>Aftaler</span>
        {!open && (
          <button className="cc-btn virk-btn-press" onClick={() => setOpen(true)}>+ Ny aftale</button>
        )}
      </div>

      {deals.length === 0 && !open && <p className="cc-dim" style={{ fontSize: 13 }}>Ingen aftaler endnu.</p>}

      {deals.map((d) => <Deal key={d.id} deal={d} onSaved={() => router.refresh()} />)}

      {open && (
        <div className="virk-deal" style={{ gap: 8 }}>
          <input
            className="virk-inline-input"
            style={{ height: 34 }}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Titel (fx Ny hjemmeside) *"
            aria-label="Titel"
            autoFocus
          />
          <div className="virk-deal-row">
            <input className="virk-inline-input" value={mrr} onChange={(e) => setMrr(e.target.value)} placeholder="Kr/md" inputMode="numeric" aria-label="Månedspris i kr" style={{ width: 100 }} />
            <input className="virk-inline-input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Engangsbeløb" inputMode="numeric" aria-label="Engangsbeløb i kr" style={{ width: 120 }} />
          </div>
          {err && <span style={{ fontSize: 12, color: "var(--red)" }}>{err}</span>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cc-btn cc-btn-accent virk-btn-press" onClick={createDeal} disabled={busy}>{busy ? "Opretter…" : "Opret aftale"}</button>
            <button className="cc-btn virk-btn-press" onClick={() => { setOpen(false); setErr(""); }} disabled={busy}>Annullér</button>
          </div>
        </div>
      )}
    </div>
  );
}
