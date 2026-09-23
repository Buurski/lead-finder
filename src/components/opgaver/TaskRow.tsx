"use client";
// Én opgave-række — genbruges på /opgaver og i virksomhedsprofilens
// "Åbne opgaver". Rent visnings-/interaktionslag: forælderen ejer data og
// kalder API'et (samme mønster som pipeline/DealCard.tsx).
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { addDays, nextMonday } from "./date-shortcuts";
import TaskEditDialog, { type EditableTask } from "./TaskEditDialog";

export interface TaskRowItem extends EditableTask {
  context?: string; // fx aftalens navn
  company: string;
}

const MONTH = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dueLabel(due: string, today: string): string {
  if (!due) return "Ingen dato";
  if (due === today) return "I dag";
  if (due === addDays(today, 1)) return "I morgen";
  if (due < today) return "Forfalden";
  const d = new Date(`${due}T00:00:00Z`);
  return `${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]}`;
}

function OwnerPill({ owner }: { owner: string }) {
  if (owner === "lucas") return <span className="op-owner l" title="Lucas">L</span>;
  if (owner === "charlie") return <span className="op-owner c" title="Charlie">C</span>;
  return <span className="op-owner none" aria-label="Ingen ejer">–</span>;
}

export default function TaskRow({
  item, today, showCompany = true, onComplete, onReschedule, onChanged,
}: {
  item: TaskRowItem;
  today: string;
  showCompany?: boolean;
  onComplete: (id: string) => void;
  onReschedule: (id: string, due: string) => void;
  onChanged: (id: string, change: Omit<EditableTask, "id" | "companyId"> | null) => void;
}) {
  const [completing, setCompleting] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [editing, setEditing] = useState(false);
  const completable = item.title.trim() !== "";
  const overdue = !!item.due && item.due < today;

  function complete() {
    if (!completable || completing) return;
    setCompleting(true);
    setTimeout(() => onComplete(item.id), 120);
  }

  function move(due: string, e: React.MouseEvent<HTMLButtonElement>) {
    (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open");
    setPickingDate(false);
    onReschedule(item.id, due);
  }

  return (
    <div className={`op-row${completing ? " completing" : ""}`}>
      <button
        type="button"
        className="op-check cc-focus"
        role="checkbox"
        aria-checked={completing}
        aria-label={completable ? `Marker "${item.title}" som klaret` : "Intet næste skridt at klare"}
        disabled={!completable}
        onClick={complete}
      />
      <div className="op-row-body">
        <button type="button" className="op-row-title op-edit-trigger" data-missing={!completable || undefined} onClick={() => setEditing(true)}>
          {completable ? item.title : "Intet næste skridt"}{item.important && <span className="op-important">Vigtig</span>}
        </button>
        <div className="op-row-meta">
          {showCompany && item.companyId ? (
            <Link href={`/virksomheder/${item.companyId}`} className="op-row-company">{item.company}</Link>
          ) : showCompany && item.company ? (
            <span className="op-row-company">{item.company}</span>
          ) : null}
          {item.context && <span className="op-row-context">{item.context}</span>}
        </div>
      </div>
      <OwnerPill owner={item.owner} />
      <details className="op-menu">
        <summary className="op-due cc-focus" data-overdue={overdue} aria-label={`Forfald: ${dueLabel(item.due, today)}. Klik for at flytte.`}>
          <span className="cc-mono">{dueLabel(item.due, today)}</span>
          <Icon name="ChevronDown" style={{ width: 13, height: 13 }} />
        </summary>
        <div className="op-menu-list">
          <button type="button" className="op-menu-item" onClick={(e) => move(addDays(today, 1), e)}>I morgen</button>
          <button type="button" className="op-menu-item" onClick={(e) => move(addDays(today, 3), e)}>Om 3 dage</button>
          <button type="button" className="op-menu-item" onClick={(e) => move(nextMonday(today), e)}>Næste mandag</button>
          {pickingDate ? (
            <input
              type="date"
              className="op-menu-date"
              autoFocus
              aria-label="Vælg dato"
              onChange={(e) => e.target.value && onReschedule(item.id, e.target.value)}
              onBlur={(e) => (e.currentTarget.closest("details") as HTMLDetailsElement | null)?.removeAttribute("open")}
            />
          ) : (
            <button type="button" className="op-menu-item" onClick={() => setPickingDate(true)}>Vælg dato…</button>
          )}
        </div>
      </details>
      {editing && <TaskEditDialog item={item} onClose={() => setEditing(false)} onChanged={(change) => onChanged(item.id, change)} />}
    </div>
  );
}
