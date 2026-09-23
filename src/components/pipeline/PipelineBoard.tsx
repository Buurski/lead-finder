"use client";
// Deal-kanban (fase 2 Task 5). Kolonner = DEAL_STAGES. Flyt fase via drag
// (mus) eller "..."-menuen (altid tilgængelig — også på touch, hvor drag er
// slået fra, og via tastatur). Alle skrivninger er optimistiske med rollback
// + fejl-toast. Kort/dialog/hjælpere bor i separate filer (denne fil var 574
// linjer med tre komponenter blandet sammen — delt for læsbarhed).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import type { DealStage, PipelineCard } from "@/lib/hq/deals";
import DealCard from "./DealCard";
import NewDealDialog from "./NewDealDialog";
import { colSum, dealCountsByCompany, type Owner, type StageInfo } from "./pipeline-utils";
import "./pipeline.css";

interface Props {
  initialCards: PipelineCard[];
  stages: StageInfo[];
  today: string;
  owner: Owner;
  actionOnly: boolean;
  customerByCompany: Record<string, boolean>;
}

export default function PipelineBoard({ initialCards, stages, today, owner, actionOnly, customerByCompany }: Props) {
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

  const dealCounts = dealCountsByCompany(cards);

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
                    dealCount={dealCounts.get(card.companyId) ?? 1}
                    draggable={!touchDevice}
                    dragging={dragId === card.id}
                    isCustomer={customerByCompany[card.companyId] ?? false}
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
