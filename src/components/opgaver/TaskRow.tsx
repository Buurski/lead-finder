"use client";
// Én opgave-række — genbruges på /opgaver og i virksomhedsprofilens
// "Åbne opgaver". Rent visnings-/interaktionslag: forælderen ejer data og
// kalder API'et (samme mønster som pipeline/DealCard.tsx).
import { useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";
import { APPROVAL_LABEL } from "@/lib/hq/approval";
import { addDays, nextMonday } from "./date-shortcuts";
import TaskEditDialog, { type EditableTask } from "./TaskEditDialog";

export interface TaskRowItem extends EditableTask {
  context?: string; // fx aftalens navn
  company: string;
}

const MONTH = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

function dueLabel(due: string, today: string, dueTime: string): string {
  const suffix = dueTime ? `, ${dueTime}` : "";
  if (!due) return "Ingen dato";
  if (due === today) return `I dag${suffix}`;
  if (due === addDays(today, 1)) return `I morgen${suffix}`;
  if (due < today) return "Forfalden";
  const d = new Date(`${due}T00:00:00Z`);
  return `${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]}${suffix}`;
}

function OwnerPill({ owner }: { owner: string }) {
  if (owner === "lucas") return <span className="op-owner l" title="Lucas">L</span>;
  if (owner === "charlie") return <span className="op-owner c" title="Charlie">C</span>;
  return <span className="op-owner none" aria-label="Ingen ejer">–</span>;
}

export default function TaskRow({
  item, today, showCompany = true, onComplete, onReschedule, onChanged, canDecide = false, onDecide, highlight = false,
}: {
  item: TaskRowItem;
  today: string;
  showCompany?: boolean;
  onComplete: (id: string) => void;
  onReschedule: (id: string, due: string) => void;
  onChanged: (id: string, change: Omit<EditableTask, "id" | "companyId"> | null) => void;
  canDecide?: boolean; // kun den indloggede ejer; serveren er den egentlige vagt
  onDecide?: (id: string) => void | boolean | Promise<void | boolean>; // forælderens reload efter en beslutning
  highlight?: boolean;
}) {
  const [completing, setCompleting] = useState(false);
  const [pickingDate, setPickingDate] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<"godkendt" | "afvist" | null>(null);
  const [decideError, setDecideError] = useState("");

  const approval = item.approval ?? null;
  const pending = approval?.status === "afventer";
  const canAct = !!pending && canDecide && !!onDecide;
  const hasTitle = item.title.trim() !== "";
  // En afventende godkendelse må ikke kunne "klares" — den skal afgøres først.
  const completable = hasTitle && !pending;
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

  async function decide(decision: "godkendt" | "afvist") {
    if (deciding) return;
    setDeciding(decision);
    setDecideError("");
    try {
      const res = await fetch(`/api/opgaver/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme beslutningen");
      // Vent på forælderens reload, så knappen først låses op når rækken har
      // fået sin nye status. Fejler reloadet, så sig det højt i stedet for at
      // vise en forældet række som om beslutningen ikke var gemt.
      const refreshed = await onDecide?.(item.id);
      if (refreshed === false) setDecideError("Beslutningen er gemt, men listen kunne ikke hentes igen. Genindlæs siden.");
      setDeciding(null);
    } catch (e) {
      setDecideError(e instanceof Error ? e.message : "kunne ikke gemme beslutningen");
      setDeciding(null);
    }
  }

  return (
    <div id={`task-${item.id}`} className={`op-row${completing ? " completing" : ""}${highlight ? " op-row-highlight" : ""}`}>
      <button
        type="button"
        className="op-check cc-focus"
        role="checkbox"
        aria-checked={completing}
        aria-label={completable ? `Marker "${item.title}" som klaret` : pending ? "Godkendelsen skal afgøres, før opgaven kan klares" : "Intet næste skridt at klare"}
        title={pending ? "Godkendelsen skal afgøres, før opgaven kan klares" : undefined}
        disabled={!completable}
        onClick={complete}
      />
      <div className="op-row-body">
        <button type="button" className="op-row-title op-edit-trigger" data-missing={!hasTitle || undefined} onClick={() => setEditing(true)}>
          {hasTitle ? item.title : "Intet næste skridt"}{item.important && <span className="op-important">Vigtig</span>}
        </button>
        <div className="op-row-meta">
          {showCompany && item.companyId ? (
            <Link href={`/virksomheder/${item.companyId}`} className="op-row-company">{item.company}</Link>
          ) : showCompany && item.company ? (
            <span className="op-row-company">{item.company}</span>
          ) : null}
          {item.context && <span className="op-row-context">{item.context}</span>}
        </div>
        {approval && (
          <div className="op-approval">
            <span className="op-approval-badge" data-status={approval.status}>
              {approval.status === "afventer" ? APPROVAL_LABEL.afventer : `${APPROVAL_LABEL[approval.status]} af ${approval.actor}`}
            </span>
            {canAct && (
              <span className="op-approval-actions">
                <button type="button" className="cc-btn cc-btn-accent op-approval-btn" onClick={() => decide("godkendt")} disabled={deciding !== null}>
                  {deciding === "godkendt" ? "Gemmer…" : "Godkend"}
                </button>
                <button type="button" className="cc-btn op-approval-btn" onClick={() => decide("afvist")} disabled={deciding !== null}>
                  {deciding === "afvist" ? "Gemmer…" : "Afvis"}
                </button>
              </span>
            )}
          </div>
        )}
        {decideError && <p role="alert" className="op-approval-err">{decideError}</p>}
        {approval && item.note.trim() && (
          <details className="op-plan">
            <summary className="cc-focus">Vis plan</summary>
            <pre className="op-plan-text">{item.note}</pre>
          </details>
        )}
      </div>
      <OwnerPill owner={item.owner} />
      <details className="op-menu">
        <summary className="op-due cc-focus" data-overdue={overdue} aria-label={`Forfald: ${dueLabel(item.due, today, item.dueTime)}. Klik for at flytte.`}>
          <span className="cc-mono">{dueLabel(item.due, today, item.dueTime)}</span>
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
