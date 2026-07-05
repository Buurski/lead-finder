"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";
import type { Client } from "@/lib/sheets";
import { weightedPipeline, dkk, stageOf, isOpen, STAGE_LABELS_DA } from "@/lib/finance";
import { CARD, H2, DIM } from "@/components/finance/FinanceUI";

const ALL_STAGES = [
  "lead", "contacted", "engaged", "concept", "offer", "negotiation",
  "won", "delivering", "live", "lost",
] as const;

export default function SalgClient({ clients: clientsProp }: { clients: Client[] }) {
  const router = useRouter();
  const [deals, setDeals] = useState<Client[]>(clientsProp);
  const [banner, setBanner] = useState("");

  // Reconcile local state when fresh server props arrive after a router.refresh()
  // (render-phase sync, not an effect — avoids clobbering a pending edit).
  const [seed, setSeed] = useState(clientsProp);
  if (seed !== clientsProp) {
    setSeed(clientsProp);
    setDeals(clientsProp);
  }

  async function saveDeal(id: string, patch: Record<string, unknown>, optimistic: Partial<Client>) {
    const prev = deals;
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, ...optimistic } : d)));
    setBanner("");
    const res = await fetch("/api/clients/deal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) {
      setDeals(prev);
      setBanner("Kunne ikke gemme ændringen — prøv igen.");
      throw new Error("deal save failed");
    }
    router.refresh();
  }

  const pipeline = weightedPipeline(deals);
  const openDeals = deals.filter(isOpen);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {banner && (
        <div className="cc-card cc-card-pad" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          {banner}
        </div>
      )}

      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 style={H2}>Pipeline-værdi (vægtet)</h2>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{dkk(pipeline.total)}</span>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          {pipeline.byStage.filter((s) => s.count > 0 || s.value > 0).length === 0 ? (
            <p style={{ fontSize: 13, color: DIM }}>Ingen åbne deals i pipelinen endnu.</p>
          ) : pipeline.byStage.map((s) => {
            const max = Math.max(...pipeline.byStage.map((x) => x.value), 1);
            return (
              <div key={s.stage} style={{ display: "grid", gridTemplateColumns: "130px 1fr auto", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{s.label} <span style={{ color: DIM }}>({s.count})</span></span>
                <div style={{ height: 10, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
                  <div style={{ width: `${(s.value / max) * 100}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
                <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 74, textAlign: "right" }}>{dkk(s.value)}</span>
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 8 }}>
          <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>Åbne deals — redigér stadie, pris & markér vundet</span>
          {openDeals.length === 0 ? (
            <p style={{ fontSize: 12.5, color: DIM }}>Ingen åbne deals lige nu.</p>
          ) : openDeals.map((d) => (
            // Key includes the fees so a server refresh re-seeds the row's
            // inputs by remounting (no prop→state effect needed).
            <DealRow key={`${d.id}:${d.monthlyFee}:${d.setupFee}`} deal={d} onSave={saveDeal} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DealRow({ deal, onSave }: { deal: Client; onSave: (id: string, patch: Record<string, unknown>, optimistic: Partial<Client>) => Promise<void> }) {
  const [mrr, setMrr] = useState(deal.monthlyFee || "");
  const [setup, setSetup] = useState(deal.setupFee || "");
  const [busy, setBusy] = useState(false);

  async function run(patch: Record<string, unknown>, optimistic: Partial<Client>) {
    setBusy(true);
    try { await onSave(deal.id, patch, optimistic); } catch { /* banner shown by parent */ } finally { setBusy(false); }
  }

  const feeStyle: React.CSSProperties = { width: 78, padding: "5px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--bg-3)", borderRadius: 8, padding: "8px 10px" }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 130, flex: "1 1 130px" }}>{deal.name}</span>

      <select value={stageOf(deal)} disabled={busy}
        onChange={(e) => run({ stage: e.target.value }, { stage: e.target.value })}
        aria-label={`Stadie for ${deal.name}`}
        style={{ padding: "5px 7px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5 }}>
        {ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS_DA[s]}</option>)}
      </select>

      <label style={{ fontSize: 11, color: DIM, display: "inline-flex", alignItems: "center", gap: 4 }}>
        mdr
        <input type="number" inputMode="numeric" value={mrr} placeholder="0" disabled={busy}
          onChange={(e) => setMrr(e.target.value)}
          onBlur={() => { if (mrr !== (deal.monthlyFee || "")) run({ monthlyFee: mrr }, { monthlyFee: mrr }); }}
          style={feeStyle} />
      </label>
      <label style={{ fontSize: 11, color: DIM, display: "inline-flex", alignItems: "center", gap: 4 }}>
        setup
        <input type="number" inputMode="numeric" value={setup} placeholder="0" disabled={busy}
          onChange={(e) => setSetup(e.target.value)}
          onBlur={() => { if (setup !== (deal.setupFee || "")) run({ setupFee: setup }, { setupFee: setup }); }}
          style={feeStyle} />
      </label>

      <button className="cc-btn cc-btn-accent" style={{ height: 30, marginLeft: "auto" }} disabled={busy}
        onClick={() => run({ markWon: true }, { stage: "won", wonDate: new Date().toISOString().slice(0, 10) })}
        title="Markér som vundet (stempler dagens dato)">
        <Trophy size={13} /> Vundet
      </button>
    </div>
  );
}
