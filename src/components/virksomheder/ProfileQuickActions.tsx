"use client";
// Primære handlinger i kundeprofilens header: Log arbejde / Ny opgave / Ny
// aftale — samme dialoger som "+ Ny" globalt, men med virksomheden forudvalgt.
// Fase 3: der var før intet synligt sted at logge arbejde fra, selvom
// Overblik-fanen nævnte det.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import LogWorkDialog from "@/components/shell/LogWorkDialog";
import NewDealDialog from "@/components/pipeline/NewDealDialog";
import NewTaskDialog from "@/components/shell/NewTaskDialog";

type DialogKind = "arbejde" | "opgave" | "aftale" | null;

export default function ProfileQuickActions({
  companyId, companyName, defaultOwner = "lucas", canDraft = false,
}: {
  companyId: string;
  companyName: string;
  defaultOwner?: "lucas" | "charlie";
  /** Kun for leads (ikke kunder): kold mail-kladde → godkendelsen. */
  canDraft?: boolean;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);

  async function makeDraft() {
    setDrafting(true);
    setDraftMsg(null);
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/kladde`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setDraftMsg(data.error ?? "Kunne ikke lave kladden"); return; }
      router.push(`/approve?id=${encodeURIComponent(data.draftId)}`);
    } catch {
      setDraftMsg("Netværksfejl. Prøv igen.");
    } finally {
      setDrafting(false);
    }
  }
  const company = { id: companyId, name: companyName };

  return (
    <>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="group" aria-label="Hurtige handlinger">
        <button className="cc-btn virk-btn-press" onClick={() => setDialog("arbejde")}>
          <Icon name="Clock" style={{ width: 14, height: 14 }} /> Log arbejde
        </button>
        <button className="cc-btn virk-btn-press" onClick={() => setDialog("opgave")}>
          <Icon name="ListChecks" style={{ width: 14, height: 14 }} /> Ny opgave
        </button>
        <button className="cc-btn virk-btn-press" onClick={() => setDialog("aftale")}>
          <Icon name="Briefcase" style={{ width: 14, height: 14 }} /> Ny aftale
        </button>
        {canDraft && (
          <button className="cc-btn virk-btn-press" onClick={makeDraft} disabled={drafting} title="Lægger en kold mail-kladde i Indbakke → Afventer. Der sendes intet.">
            <Icon name="Mail" style={{ width: 14, height: 14 }} /> {drafting ? "Laver kladde…" : "Lav mail-kladde"}
          </button>
        )}
      </div>
      {draftMsg && <p role="alert" style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--red)" }}>{draftMsg}</p>}

      {dialog === "arbejde" && (
        <LogWorkDialog
          initialCompany={company}
          onClose={() => setDialog(null)}
          onLogged={() => { setDialog(null); router.refresh(); }}
        />
      )}
      {dialog === "opgave" && (
        <NewTaskDialog
          initialCompany={company}
          defaultOwner={defaultOwner}
          onClose={() => setDialog(null)}
          onCreated={() => { setDialog(null); router.refresh(); }}
        />
      )}
      {dialog === "aftale" && (
        <NewDealDialog
          initialCompany={company}
          onClose={() => setDialog(null)}
          onCreated={() => { setDialog(null); router.refresh(); }}
          onError={() => {}}
        />
      )}
    </>
  );
}
