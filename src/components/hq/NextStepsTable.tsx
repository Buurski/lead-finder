"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import TaskEditDialog from "@/components/opgaver/TaskEditDialog";
import "@/components/opgaver/opgaver.css";
import type { NextStep } from "@/lib/hq/summary";

const MONTH = ["JAN", "FEB", "MAR", "APR", "MAJ", "JUN", "JUL", "AUG", "SEP", "OKT", "NOV", "DEC"];

function tomorrowOf(today: string): string {
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

function dueDateLabel(due: string, today: string): string {
  if (!due) return "";
  if (due === today) return "I DAG";
  if (due === tomorrowOf(today)) return "I MORGEN";
  const d = new Date(`${due}T00:00:00Z`);
  return `${d.getUTCDate()}. ${MONTH[d.getUTCMonth()]}`;
}

function duePillLabel(step: NextStep, today: string): string {
  if (step.state === "mangler" || !step.due) return "–";
  if (step.state === "forfalden") return "Forfalden";
  if (step.state === "snart") return "Snart";
  const days = Math.round((Date.parse(`${step.due}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return `Om ${days} dag${days === 1 ? "" : "e"}`;
}

const PILL_CLASS: Record<NextStep["state"], string> = {
  forfalden: "risk",
  snart: "warn",
  ok: "faded",
  mangler: "faded",
};

function OwnerAvatar({ owner }: { owner: string }) {
  if (owner === "lucas") return <span className="hq-owner l" title="Lucas">L</span>;
  if (owner === "charlie") return <span className="hq-owner c" title="Charlie">C</span>;
  return <span className="hq-owner none" aria-label="Ingen ejer">–</span>;
}

export default function NextStepsTable({ steps, today }: { steps: NextStep[]; today: string }) {
  const [editing, setEditing] = useState<NextStep | null>(null);
  const router = useRouter();
  const overdue = steps.filter((s) => s.state === "forfalden").length;
  const upcoming = steps.length - overdue;

  return (
    <div className="hq-table-card cc-card">
      <div className="hq-table-head" role="presentation">
        <span>Virksomhed</span>
        <span>Næste skridt</span>
        <span>Ejer</span>
        <span className="right">Forfald</span>
      </div>

      {steps.length === 0 ? (
        <div className="hq-empty">Ingen opgaver eller næste skridt i kø.</div>
      ) : (
        <div className="hq-table-status">
          {overdue > 0 ? `${overdue} forfaldne. ` : "Intet forfalder i dag. "}
          {upcoming > 0 ? `${upcoming} kommende. ` : ""}
          <Link href="/opgaver" className="cc-link">Se alle opgaver</Link>
        </div>
      )}
      {steps.length > 0 && (
        steps.map((s, i) => {
          const body = (
            <>
              <div className="hq-row-company">
                <div className="hq-row-name">{s.company}</div>
                <div className="hq-row-deal">{s.what}</div>
              </div>
              <div className={`hq-row-step${!s.step.trim() ? " missing" : ""}`}>
                {s.step.trim() || "Intet næste skridt"}{s.important && <span className="op-important">Vigtig</span>}
              </div>
              <div className="hq-row-owner">
                <OwnerAvatar owner={s.owner} />
              </div>
              <div className="hq-row-due">
                <span className={`hq-pill ${PILL_CLASS[s.state]}`}>{duePillLabel(s, today)}</span>
                {s.due && <span className="hq-due-date hq-mono">{dueDateLabel(s.due, today)}</span>}
              </div>
            </>
          );
          const key = s.id || `${s.companyId ?? s.company}-${i}`;
          return (
            <div key={key} className="hq-row hq-row-static" onClick={() => setEditing(s)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditing(s); } }}>
              {body}
            </div>
          );
        })
      )}
      {editing && <TaskEditDialog item={{ id: editing.id, title: editing.step, due: editing.due, owner: editing.owner, note: editing.note, important: editing.important, companyId: editing.companyId }} onClose={() => setEditing(null)} onChanged={() => router.refresh()} />}
    </div>
  );
}
