"use client";
// "Gør til kunde" — samme knap i pipeline-kortet (når en aftale er vundet) og i
// virksomhedsprofilens header (bølge 3). Erstatter den gamle manuelle
// AddClientForm/api/clients/add-vej: at blive kunde starter altid herfra, ikke
// fra en løsrevet formular.
import { useState } from "react";
import { useRouter } from "next/navigation";
import "./make-customer.css";

export default function MakeCustomerButton({
  companyId, companyName, small,
}: {
  companyId: string;
  companyName: string;
  small?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function confirm() {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/virksomheder/${companyId}/kunde`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gøre virksomheden til kunde");
      setOpen(false);
      router.push(`/virksomheder/${companyId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke gøre virksomheden til kunde");
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="cc-btn cc-btn-accent cc-focus"
        style={small ? { height: 28, padding: "0 10px", fontSize: 12 } : undefined}
        onClick={() => setOpen(true)}
      >
        Gør til kunde
      </button>
      {open && (
        <div className="mkk-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setOpen(false); }}>
          <div className="mkk-dialog" role="dialog" aria-modal="true" aria-labelledby="mkk-title">
            <h2 id="mkk-title">Gør {companyName || "virksomheden"} til kunde</h2>
            <ul className="mkk-list">
              <li>Får næste ledige kundenummer</li>
              <li>Åbne kolde mail-kladder til virksomheden stoppes</li>
              <li>Opstartslisten oprettes — det der allerede er på plads, krydses af med det samme</li>
            </ul>
            {err && <p className="mkk-error">{err}</p>}
            <div className="mkk-actions">
              <button type="button" className="cc-btn cc-focus" onClick={() => setOpen(false)} disabled={busy}>Annullér</button>
              <button type="button" className="cc-btn cc-btn-accent cc-focus" onClick={confirm} disabled={busy}>
                {busy ? "Gør til kunde…" : "Bekræft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
