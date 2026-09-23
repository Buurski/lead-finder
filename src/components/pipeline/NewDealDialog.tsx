"use client";
// "Ny aftale"-dialog: søg/vælg virksomhed, udfyld felter (fase 2 Task 5).
import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "@/components/shell/Icon";
import type { DealStage, PipelineCard } from "@/lib/hq/deals";
import type { Owner, StageInfo } from "./pipeline-utils";

export default function NewDealDialog({
  stages, onClose, onCreated, onError,
}: {
  stages: StageInfo[];
  onClose: () => void;
  onCreated: (card: PipelineCard) => void;
  onError: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; city: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [title, setTitle] = useState("");
  const [stage, setStage] = useState<DealStage>(stages[0]?.stage ?? "tilbud");
  const [valueDkk, setValueDkk] = useState("");
  const [mrrDkk, setMrrDkk] = useState("");
  const [owner, setOwner] = useState<Owner>("");
  const [nextStep, setNextStep] = useState("");
  const [nextStepDue, setNextStepDue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => { firstFieldRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (picked || !query.trim()) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/pipeline/companies?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { companies: [] }))
        .then((d) => setResults(d.companies ?? []))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, picked]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!picked) { setError("Vælg en virksomhed"); return; }
    if (!title.trim()) { setError("Titel mangler"); return; }
    setError("");
    setSaving(true);
    try {
      const body: Record<string, unknown> = { companyId: picked.id, title: title.trim(), stage };
      if (valueDkk) body.valueDkk = Number(valueDkk);
      if (mrrDkk) body.mrrDkk = Number(mrrDkk);
      if (owner) body.owner = owner;
      if (nextStep.trim()) {
        body.nextStep = nextStep.trim();
        if (nextStepDue) body.nextStepDue = nextStepDue;
      }
      const res = await fetch("/api/deals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}) as { error?: string; deal?: Record<string, unknown> });
      if (!res.ok) throw new Error((data as { error?: string }).error || "Kunne ikke oprette aftalen");
      const d = data.deal as { id: string; companyId: string; title: string; stage: DealStage; owner: string; valueDkk: number | null; mrrDkk: number | null; nextStep: string | null; nextStepDue: string | null; updatedAt: string };
      onCreated({
        id: d.id,
        companyId: d.companyId,
        company: picked.name,
        title: d.title || title.trim(),
        stage: d.stage,
        owner: d.owner || "",
        valueDkk: d.valueDkk ?? null,
        mrrDkk: d.mrrDkk ?? null,
        nextStep: d.nextStep ?? null,
        nextStepDue: d.nextStepDue ?? null,
        updatedAt: d.updatedAt,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Kunne ikke oprette aftalen";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pl-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="pl-dialog" role="dialog" aria-modal="true" aria-labelledby="pl-dialog-title" onSubmit={submit}>
        <div className="pl-dialog-head">
          <h2 id="pl-dialog-title">Ny aftale</h2>
          <button type="button" className="pl-close-btn cc-focus" onClick={onClose} aria-label="Luk">
            <Icon name="X" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div className="pl-field">
          <label htmlFor="pl-company">Virksomhed</label>
          {picked ? (
            <div className="pl-picked">
              {picked.name}
              <button type="button" onClick={() => { setPicked(null); setQuery(""); }} aria-label="Fjern valgt virksomhed">
                <Icon name="X" style={{ width: 14, height: 14 }} />
              </button>
            </div>
          ) : (
            <div className="pl-search-wrap">
              <input
                id="pl-company"
                ref={firstFieldRef}
                className="pl-input"
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); }}
                placeholder="Søg virksomhed…"
                autoComplete="off"
              />
              {results.length > 0 && (
                <div className="pl-search-results">
                  {results.map((c) => (
                    <button key={c.id} type="button" className="pl-search-result" onClick={() => { setPicked(c); setResults([]); }}>
                      {c.name}{c.city && <span className="city">{c.city}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="pl-field">
          <label htmlFor="pl-title">Titel</label>
          <input id="pl-title" className="pl-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fx Hjemmeside" />
        </div>

        <div className="pl-field-row">
          <div className="pl-field">
            <label htmlFor="pl-stage">Fase</label>
            <select id="pl-stage" className="pl-select" value={stage} onChange={(e) => setStage(e.target.value as DealStage)}>
              {stages.map((s) => <option key={s.stage} value={s.stage}>{s.label}</option>)}
            </select>
          </div>
          <div className="pl-field">
            <label htmlFor="pl-owner">Ejer</label>
            <select id="pl-owner" className="pl-select" value={owner} onChange={(e) => setOwner(e.target.value as Owner)}>
              <option value="">Ingen</option>
              <option value="lucas">Lucas</option>
              <option value="charlie">Charlie</option>
            </select>
          </div>
        </div>

        <div className="pl-field-row">
          <div className="pl-field">
            <label htmlFor="pl-value">Engangsbeløb (kr)</label>
            <input id="pl-value" className="pl-input" type="number" min={0} value={valueDkk} onChange={(e) => setValueDkk(e.target.value)} />
          </div>
          <div className="pl-field">
            <label htmlFor="pl-mrr">Månedspris (kr/md)</label>
            <input id="pl-mrr" className="pl-input" type="number" min={0} value={mrrDkk} onChange={(e) => setMrrDkk(e.target.value)} />
          </div>
        </div>

        <div className="pl-field-row">
          <div className="pl-field">
            <label htmlFor="pl-step">Næste skridt</label>
            <input id="pl-step" className="pl-input" value={nextStep} onChange={(e) => setNextStep(e.target.value)} placeholder="Fx Send tilbud" />
          </div>
          <div className="pl-field">
            <label htmlFor="pl-due">Dato</label>
            <input id="pl-due" className="pl-input" type="date" value={nextStepDue} onChange={(e) => setNextStepDue(e.target.value)} />
          </div>
        </div>

        {error && <p className="pl-error">{error}</p>}

        <div className="pl-dialog-actions">
          <button type="button" className="cc-btn cc-focus" onClick={onClose}>Annuller</button>
          <button type="submit" className="cc-btn cc-btn-accent cc-focus" disabled={saving}>{saving ? "Opretter…" : "Opret aftale"}</button>
        </div>
      </form>
    </div>
  );
}
