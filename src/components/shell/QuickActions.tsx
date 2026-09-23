"use client";
// "+ Ny"-knappen i topbaren: lille menu med de fire hurtige handlinger
// (fase 3, Task "Global søgning + Ny + hurtige handlinger"). Erstatter den
// gamle adfærd hvor knappen bare åbnede ⌘K-paletten uden at oprette noget.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Icon from "./Icon";
import NewDealDialog from "@/components/pipeline/NewDealDialog";
import LogWorkDialog from "./LogWorkDialog";
import NewCompanyDialog from "./NewCompanyDialog";
import NewTaskDialog from "./NewTaskDialog";
import "./quick-actions.css";

type DialogKind = "opgave" | "aftale" | "arbejde" | "virksomhed" | null;

export default function QuickActions() {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setMenuOpen(false); }
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  function afterCreate(companyId: string) {
    setDialog(null);
    router.push(`/virksomheder/${companyId}`);
  }

  return (
    <div className="qa-wrap" ref={wrapRef}>
      <button
        className="cc-btn-new cc-focus"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Opret nyt"
      >
        <Icon name="Plus" style={{ width: 16, height: 16 }} />
        <span>Ny</span>
      </button>

      {menuOpen && (
        <div className="qa-menu cc-fade" role="menu">
          <button type="button" role="menuitem" className="qa-menu-item" onClick={() => { setDialog("opgave"); setMenuOpen(false); }}>
            <Icon name="ListChecks" />
            Ny opgave
          </button>
          <button type="button" role="menuitem" className="qa-menu-item" onClick={() => { setDialog("aftale"); setMenuOpen(false); }}>
            <Icon name="Briefcase" />
            Ny aftale
          </button>
          <button type="button" role="menuitem" className="qa-menu-item" onClick={() => { setDialog("arbejde"); setMenuOpen(false); }}>
            <Icon name="Clock" />
            Log arbejde
          </button>
          <button type="button" role="menuitem" className="qa-menu-item" onClick={() => { setDialog("virksomhed"); setMenuOpen(false); }}>
            <Icon name="Building2" />
            Ny virksomhed
          </button>
        </div>
      )}

      {dialog === "aftale" && (
        <NewDealDialog onClose={() => setDialog(null)} onCreated={(d) => afterCreate(d.companyId)} onError={() => {}} />
      )}
      {dialog === "arbejde" && (
        <LogWorkDialog onClose={() => setDialog(null)} onLogged={(r) => afterCreate(r.companyId)} />
      )}
      {dialog === "virksomhed" && <NewCompanyDialog onClose={() => setDialog(null)} />}
      {dialog === "opgave" && <NewTaskDialog onClose={() => setDialog(null)} onCreated={() => { setDialog(null); router.push("/opgaver"); }} />}
    </div>
  );
}
