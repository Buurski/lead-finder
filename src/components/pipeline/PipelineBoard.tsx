"use client";
// Deal-kanban (fase 2 Task 5). Kolonner = DEAL_STAGES. Flyt fase via drag
// (mus) eller "..."-menuen (altid tilgængelig — også på touch, hvor drag er
// slået fra). Alle skrivninger er optimistiske med rollback + fejl-toast.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { DealStage, PipelineCard } from "@/lib/hq/deals";
import "./pipeline.css";

type Owner = "" | "lucas" | "charlie";
const OWNER_LABEL: Record<Owner, string> = { "": "ingen ejer", lucas: "Lucas", charlie: "Charlie" };
const STALE_EXEMPT = new Set(["betalt", "tabt"]);

// Spejler stepState() i src/lib/hq/summary.ts — den fil har "server-only" og
// kan ikke importeres herfra, så logikken (6 linjer, stabil) er duplikeret.
type StepState = "forfalden" | "snart" | "ok" | "mangler";
function stepState(due: string, today: string): StepState {
  if (!due) return "mangler";
  if (due < today) return "forfalden";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return due <= t.toISOString().slice(0, 10) ? "snart" : "ok";
}

function formatDue(due: string, today: string): string {
  if (!due) return "";
  if (due === today) return "I dag";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (due === t.toISOString().slice(0, 10)) return "I morgen";
  return new Date(`${due}T00:00:00Z`).toLocaleDateString("da-DK", { day: "2-digit", month: "short" });
}

function formatKr(n: number): string {
  return `${n.toLocaleString("da-DK")} kr`;
}

function colSum(cards: PipelineCard[]): string {
  const mrr = cards.reduce((s, c) => s + (c.mrrDkk || 0), 0);
  const value = cards.reduce((s, c) => s + (c.valueDkk || 0), 0);
  const parts = [mrr ? `${formatKr(mrr)}/md` : "", value ? formatKr(value) : ""].filter(Boolean);
  return parts.length ? parts.join(" + ") : "–";
}

function staleDays(updatedAt: string, today: string): number {
  const upd = new Date(updatedAt);
  const now = new Date(`${today}T00:00:00Z`);
  const updUtc = Date.UTC(upd.getUTCFullYear(), upd.getUTCMonth(), upd.getUTCDate());
  return Math.floor((now.getTime() - updUtc) / 86_400_000);
}

interface StageInfo {
  stage: DealStage;
  label: string;
}

interface Props {
  initialCards: PipelineCard[];
  stages: StageInfo[];
  today: string;
  owner: Owner;
  actionOnly: boolean;
}

export default function PipelineBoard({ initialCards, stages, today, owner, actionOnly }: Props) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  // Lazy initializer (not an effect+setState): read once, no cascading render.
  const [touchDevice] = useState(() => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; tone?: "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  function notify(msg: string, tone?: "error") {
    setToast({ msg, tone });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3800);
  }

  async function patchDeal(dealId: string, patch: Record<string, unknown>, prevCards: PipelineCard[]) {
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(body.error || "Kunne ikke gemme ændringen");
      }
      router.refresh();
    } catch (err) {
      setCards(prevCards);
      notify(err instanceof Error ? err.message : "Kunne ikke gemme ændringen", "error");
    }
  }

  function moveDeal(dealId: string, stage: DealStage) {
    const current = cards.find((c) => c.id === dealId);
    if (!current || current.stage === stage) return;
    const prevCards = cards;
    setCards(cards.map((c) => (c.id === dealId ? { ...c, stage } : c)));
    void patchDeal(dealId, { stage }, prevCards);
  }

  function patchStep(dealId: string, nextStep: string, nextStepDue: string) {
    const prevCards = cards;
    setCards(cards.map((c) => (c.id === dealId ? { ...c, nextStep, nextStepDue: nextStepDue || null } : c)));
    void patchDeal(dealId, { nextStep, nextStepDue: nextStepDue || "" }, prevCards);
  }

  function cycleOwner(dealId: string, current: Owner) {
    const nextOwner: Owner = current === "lucas" ? "charlie" : "lucas";
    const prevCards = cards;
    setCards(cards.map((c) => (c.id === dealId ? { ...c, owner: nextOwner } : c)));
    void patchDeal(dealId, { owner: nextOwner }, prevCards);
  }

  function onCreated(card: PipelineCard) {
    setCards((prev) => [card, ...prev]);
    setDialogOpen(false);
    router.refresh();
  }

  return (
    <>
      <div className="pl-filters">
        <FilterBar owner={owner} actionOnly={actionOnly} />
        <button type="button" className="cc-btn cc-btn-accent cc-focus" onClick={() => setDialogOpen(true)}>
          <Icon name="Plus" style={{ width: 15, height: 15 }} />
          Ny aftale
        </button>
      </div>

      <div className="pl-board">
        {stages.map(({ stage, label }) => {
          const list = cards.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              className="pl-col"
              data-over={dragOverStage === stage}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setDragOverStage(null);
                setDragId(null);
                if (id) moveDeal(id, stage);
              }}
            >
              <div className="pl-col-head">
                <div className="pl-col-title">
                  {label}
                  <span className="cc-chip">{list.length}</span>
                </div>
                <div className="pl-col-sum">{colSum(list)}</div>
              </div>
              <div className="pl-col-body">
                {list.length === 0 && <div className="pl-col-empty">Ingen aftaler her</div>}
                {list.map((card) => (
                  <DealCard
                    key={card.id}
                    card={card}
                    today={today}
                    stages={stages}
                    draggable={!touchDevice}
                    dragging={dragId === card.id}
                    onDragStart={setDragId}
                    onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                    onMove={moveDeal}
                    onOwner={cycleOwner}
                    onStep={patchStep}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {dialogOpen && (
        <NewDealDialog
          stages={stages}
          onClose={() => setDialogOpen(false)}
          onCreated={onCreated}
          onError={(m) => notify(m, "error")}
        />
      )}

      {toast && (
        <div role="status" className="pl-toast" data-tone={toast.tone}>
          {toast.msg}
        </div>
      )}
    </>
  );
}

// Diskrete filter-chips (ejer + "kræver handling") — sidens egne faner ejes
// centralt af skallen efter merge, så denne bar bliver bevidst kun to
// afgrænsede filtre, ikke en sektions-navigation.
function FilterBar({ owner, actionOnly }: { owner: Owner; actionOnly: boolean }) {
  const router = useRouter();

  function go(nextOwner: Owner, nextAction: boolean) {
    const params = new URLSearchParams();
    if (nextOwner) params.set("owner", nextOwner);
    if (nextAction) params.set("action", "1");
    const qs = params.toString();
    router.push(qs ? `/pipeline?${qs}` : "/pipeline");
  }

  const owners: { value: Owner; label: string }[] = [
    { value: "", label: "Alle" },
    { value: "lucas", label: "Lucas" },
    { value: "charlie", label: "Charlie" },
  ];

  return (
    <div className="pl-filter-group" role="group" aria-label="Filtrér pipeline">
      {owners.map((o) => (
        <button
          key={o.value || "alle"}
          type="button"
          className="pl-chip cc-focus"
          data-on={owner === o.value}
          aria-pressed={owner === o.value}
          onClick={() => go(o.value, actionOnly)}
        >
          {o.label}
        </button>
      ))}
      <button
        type="button"
        className="pl-chip cc-focus"
        data-on={actionOnly}
        aria-pressed={actionOnly}
        onClick={() => go(owner, !actionOnly)}
      >
        Kræver handling
      </button>
    </div>
  );
}

function DealCard({
  card, today, stages, draggable, dragging, onDragStart, onDragEnd, onMove, onOwner, onStep,
}: {
  card: PipelineCard;
  today: string;
  stages: StageInfo[];
  draggable: boolean;
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (id: string, stage: DealStage) => void;
  onOwner: (id: string, current: Owner) => void;
  onStep: (id: string, nextStep: string, nextStepDue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [stepDraft, setStepDraft] = useState(card.nextStep ?? "");
  const [dueDraft, setDueDraft] = useState(card.nextStepDue ?? "");

  function startEdit() {
    setStepDraft(card.nextStep ?? "");
    setDueDraft(card.nextStepDue ?? "");
    setEditing(true);
  }
  function save() {
    if (!stepDraft.trim()) { setEditing(false); return; }
    onStep(card.id, stepDraft.trim(), dueDraft);
    setEditing(false);
  }

  const owner = (card.owner || "") as Owner;
  const noStep = !card.nextStep;
  const state: StepState = noStep ? "mangler" : stepState(card.nextStepDue || "", today);
  const days = staleDays(card.updatedAt, today);
  const showStale = days > 14 && !STALE_EXEMPT.has(card.stage);
  const amount = [card.mrrDkk ? `${formatKr(card.mrrDkk)}/md` : "", card.valueDkk ? formatKr(card.valueDkk) : ""].filter(Boolean).join(" + ");

  return (
    <div
      className="pl-card"
      data-dragging={dragging}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(card.id);
      }}
      onDragEnd={onDragEnd}
    >
      <div className="pl-card-top">
        <div>
          <Link href={`/virksomheder/${card.companyId}`} className="pl-card-company">{card.company}</Link>
          <div className="pl-card-title">{card.title}</div>
        </div>
        <div className="pl-card-actions">
          <button
            type="button"
            className="pl-owner-btn cc-focus"
            data-owner={owner}
            aria-label={`Ejer: ${OWNER_LABEL[owner]}. Klik for at skifte.`}
            onClick={() => onOwner(card.id, owner)}
          >
            {owner ? owner[0].toUpperCase() : "–"}
          </button>
          <details className="pl-menu">
            <summary className="pl-menu-btn cc-focus" aria-label="Flyt til anden fase">
              <Icon name="MoreHorizontal" style={{ width: 15, height: 15 }} />
            </summary>
            <div className="pl-menu-list">
              {stages.map((s) => (
                <button
                  key={s.stage}
                  type="button"
                  className="pl-menu-item"
                  data-current={s.stage === card.stage}
                  onClick={(e) => {
                    (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
                    if (s.stage !== card.stage) onMove(card.id, s.stage);
                  }}
                >
                  Flyt til {s.label}
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>

      {amount && <div className="pl-card-amount">{amount}</div>}

      <div className="pl-nextstep">
        {editing ? (
          <div className="pl-edit-form">
            <input
              className="pl-input"
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              placeholder="Næste skridt"
              aria-label="Næste skridt"
              autoFocus
            />
            <input
              className="pl-input"
              type="date"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              aria-label="Forfaldsdato"
            />
            <div className="pl-edit-actions">
              <button type="button" className="cc-btn cc-btn-accent cc-focus" onClick={save}>Gem</button>
              <button type="button" className="cc-btn cc-focus" onClick={() => setEditing(false)}>Annuller</button>
            </div>
          </div>
        ) : noStep ? (
          <button type="button" className="pl-nextstep-missing cc-focus" onClick={startEdit}>
            Intet næste skridt
          </button>
        ) : (
          <div
            className="pl-nextstep-row cc-focus"
            role="button"
            tabIndex={0}
            onClick={startEdit}
            onKeyDown={(e) => { if (e.key === "Enter") startEdit(); }}
          >
            <div className="pl-nextstep-text">{card.nextStep}</div>
            <span className="pl-due-pill" data-tone={state === "forfalden" ? "forfalden" : state === "snart" ? "snart" : "ok"}>
              {state === "mangler" ? "Ingen dato" : formatDue(card.nextStepDue || "", today).toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {showStale && <div className="pl-stale">står stille {days} dage</div>}
    </div>
  );
}

function NewDealDialog({
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
