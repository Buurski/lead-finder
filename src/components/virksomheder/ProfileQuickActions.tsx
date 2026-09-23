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
  companyId, companyName, defaultOwner = "lucas",
}: {
  companyId: string;
  companyName: string;
  defaultOwner?: "lucas" | "charlie";
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
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
      </div>

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
