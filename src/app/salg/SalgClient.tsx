"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, XCircle } from "lucide-react";
import type { Client } from "@/lib/sheets";
import {
  weightedPipeline, dkk, stageOf, isOpen, STAGE_LABELS_DA,
  monthPeriod, quarterOf,
} from "@/lib/finance";
import {
  funnel, conversionRates, winRate, dealEconomics, expectedCloseIn,
  segmentBy, overdueDeals,
} from "@/lib/insights";
import { CARD, H2, DIM, StatTile, SectionLabel, BarRow } from "@/components/finance/FinanceUI";

const ALL_STAGES = [
  "lead", "contacted", "engaged", "concept", "offer", "negotiation",
  "won", "delivering", "live", "lost",
] as const;

const pct = (x: number | null): string => (x == null ? "—" : `${Math.round(x * 100)}%`);

export default function SalgClient({ clients: clientsProp, nowISO }: { clients: Client[]; nowISO: string }) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowISO), [nowISO]);
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

  const pipeline = useMemo(() => weightedPipeline(deals), [deals]);
  const fn = useMemo(() => funnel(deals), [deals]);
  const conv = useMemo(() => conversionRates(fn), [fn]);
  const wr = useMemo(() => winRate(deals), [deals]);
  const econ = useMemo(() => dealEconomics(deals), [deals]);
  const quarter = useMemo(() => quarterOf(now), [now]);
  const expMonth = useMemo(() => expectedCloseIn(deals, monthPeriod(now)), [deals, now]);
  const expQuarter = useMemo(() => expectedCloseIn(deals, quarter), [deals, quarter]);
  const segSource = useMemo(() => segmentBy(deals, "source"), [deals]);
  const segOwner = useMemo(() => segmentBy(deals, "owner"), [deals]);
  const overdue = useMemo(() => overdueDeals(deals, now), [deals, now]);

  const openDeals = deals.filter(isOpen);
  const maxFunnel = Math.max(...fn.map((s) => s.count), 1);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {banner && (
        <div className="cc-card cc-card-pad" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          {banner}
        </div>
      )}

      {/* ============ PIPELINE + EDIT ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 style={H2}>Pipeline-værdi (vægtet)</h2>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{dkk(pipeline.total)}</span>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          {pipeline.byStage.every((s) => s.count === 0) ? (
            <p style={{ fontSize: 13, color: DIM }}>Ingen åbne deals i pipelinen endnu.</p>
          ) : pipeline.byStage.map((s) => {
            const max = Math.max(...pipeline.byStage.map((x) => x.value), 1);
            return <BarRow key={s.stage} label={s.label} sub={`(${s.count})`} frac={s.value / max} value={dkk(s.value)} />;
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 8 }}>
          <SectionLabel>Åbne deals — redigér stadie, pris, markér vundet/tabt</SectionLabel>
          {openDeals.length === 0 ? (
            <p style={{ fontSize: 12.5, color: DIM }}>Ingen åbne deals lige nu.</p>
          ) : openDeals.map((d) => (
            <DealRow key={`${d.id}:${d.monthlyFee}:${d.setupFee}`} deal={d} onSave={saveDeal} />
          ))}
        </div>
      </section>

      {/* ============ FUNNEL & KONVERTERING ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Funnel &amp; konvertering</h2>
        <p style={{ fontSize: 11.5, color: DIM, marginTop: -6 }}>
          Nuværende fordeling af deals pr. stadie (ikke en kohorte — stadie-historik kommer med snapshots).
        </p>
        <div style={{ display: "grid", gap: 9 }}>
          {fn.map((s) => (
            <BarRow key={s.stage} label={s.label} frac={s.count / maxFunnel}
              value={`${s.count} · ${dkk(s.weightedValue)}`} />
          ))}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gap: 8 }}>
          <SectionLabel>Overgange</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {conv.transitions.map((t) => (
              <span key={`${t.from}-${t.to}`} style={{ fontSize: 12, color: "var(--text-muted)" }}>
                {t.from} → {t.to}: <strong style={{ color: "var(--text)" }}>{pct(t.rate)}</strong>
              </span>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Kontaktet → Vundet" value={pct(conv.overall)} sub="samlet konvertering" />
          <StatTile label="Win rate" value={pct(wr.rate)} sub={`${wr.won} vundet · ${wr.lost} tabt`} />
        </div>
      </section>

      {/* ============ DEAL-ØKONOMI ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Deal-økonomi</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Gns. dealværdi" value={dkk(econ.avgDealValue)} sub={`setup + 12× mdr · ${econ.wonCount} vundne`} />
          <StatTile label="Gns. engangs" value={dkk(econ.avgSetup)} sub="setup pr. vundet deal" />
          <StatTile label="Gns. recurring (år)" value={dkk(econ.avgRecurringAnnual)} sub="12× mdr pr. vundet deal" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Åben pipeline (rå)" value={dkk(econ.openRaw)} sub="uvægtet total" />
          <StatTile label="Åben pipeline (vægtet)" value={dkk(econ.openWeighted)} sub="× sandsynlighed pr. stadie" />
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Forventet luk (måned)" value={dkk(expMonth.weighted)} sub={`${expMonth.count} deals · rå ${dkk(expMonth.raw)}`} />
          <StatTile label={`Forventet luk (${quarter.key})`} value={dkk(expQuarter.weighted)} sub={`${expQuarter.count} deals · rå ${dkk(expQuarter.raw)}`} />
        </div>
      </section>

      {/* ============ SEGMENTERING ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Segmentering</h2>
        <div style={{ display: "grid", gap: 16 }}>
          <SegmentTable title="Pr. kilde" segments={segSource} />
          <SegmentTable title="Pr. ejer" segments={segOwner} />
        </div>
      </section>

      {/* ============ HYGIEJNE ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Hygiejne</h2>
        <p style={{ fontSize: 11.5, color: DIM, marginTop: -6 }}>
          Åbne deals over deres forventede lukkedato. (Salgscyklus &amp; dage-pr-stadie kræver stadie-historik — kommer med snapshots.)
        </p>
        {overdue.length === 0 ? (
          <p style={{ fontSize: 12.5, color: DIM }}>Ingen forfaldne deals — pipelinen er ajour. 🎯</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {overdue.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", background: "var(--bg-3)", borderRadius: 8, padding: "8px 10px", fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, flex: "1 1 130px" }}>{d.name}</span>
                <span style={{ color: DIM }}>{d.label}</span>
                <span style={{ color: "var(--amber)", fontWeight: 600 }}>{d.daysOverdue} dage forsinket</span>
                <span style={{ color: DIM }}>(forventet {d.expectedClose})</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SegmentTable({ title, segments }: { title: string; segments: ReturnType<typeof segmentBy> }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SectionLabel>{title}</SectionLabel>
      {segments.length === 0 ? (
        <p style={{ fontSize: 12.5, color: DIM }}>Ingen data endnu.</p>
      ) : (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, fontSize: 10.5, color: DIM, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 2px" }}>
            <span>Segment</span><span style={{ textAlign: "right" }}>Antal</span><span style={{ textAlign: "right", minWidth: 78 }}>Værdi</span><span style={{ textAlign: "right", minWidth: 52 }}>Win</span>
          </div>
          {segments.map((s) => (
            <div key={s.key} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center", fontSize: 12.5, padding: "6px 2px", borderTop: "1px solid var(--border)" }}>
              <span style={{ textTransform: "capitalize" }}>{s.key}</span>
              <span style={{ textAlign: "right", color: "var(--text-muted)" }}>{s.count}</span>
              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", minWidth: 78 }}>{dkk(s.value)}</span>
              <span style={{ textAlign: "right", minWidth: 52, color: "var(--text-muted)" }}>{pct(s.win.rate)}</span>
            </div>
          ))}
        </div>
      )}
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

  const today = new Date().toISOString().slice(0, 10);
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

      <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
        <button className="cc-btn cc-btn-accent" style={{ height: 30 }} disabled={busy}
          onClick={() => run({ markWon: true }, { stage: "won", wonDate: today })}
          title="Markér som vundet (stempler dagens dato)">
          <Trophy size={13} /> Vundet
        </button>
        <button className="cc-btn" style={{ height: 30 }} disabled={busy}
          onClick={() => run({ markLost: true }, { stage: "lost", lostDate: today })}
          title="Markér som tabt (stempler dagens dato)">
          <XCircle size={13} /> Tabt
        </button>
      </div>
    </div>
  );
}
