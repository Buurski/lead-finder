"use client";
// Ét deal-kort i kanban-kolonnen (fase 2 Task 5).
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import type { DealStage, PipelineCard } from "@/lib/hq/deals";
import { OWNER_LABEL, STALE_EXEMPT, formatDue, formatKr, staleDays, stepState, type Owner, type StageInfo, type StepState } from "./pipeline-utils";

export default function DealCard({
  card, today, stages, dealCount, draggable, dragging, onDragStart, onDragEnd, onMove, onOwner, onStep,
}: {
  card: PipelineCard;
  today: string;
  stages: StageInfo[];
  dealCount: number;
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
          <div className="pl-card-company-row">
            <Link href={`/virksomheder/${card.companyId}`} className="pl-card-company">{card.company}</Link>
            {dealCount > 1 && <span className="pl-card-count">{dealCount} aftaler</span>}
          </div>
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
