"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, XCircle, ShieldCheck, Clock } from "lucide-react";
import type { Client } from "@/lib/sheets";
import {
  weightedPipeline, dkk, stageOf, isOpen, STAGE_LABELS_DA,
  monthPeriod, quarterOf,
} from "@/lib/finance";
import {
  funnel, conversionRates, winRate, dealEconomics, expectedCloseIn,
  segmentBy, overdueDeals,
} from "@/lib/insights";
import {
  CARD, H2, DIM, StatTile, HeroMetric, NumbersStrip, SectionLabel, BarRow,
  Funnel, StagePill, type FunnelStepView,
} from "@/components/finance/FinanceUI";

const ALL_STAGES = [
  "lead", "contacted", "engaged", "concept", "offer", "negotiation",
  "won", "delivering", "live", "lost",
] as const;

const pct = (x: number | null): string => (x == null ? "—" : `${Math.round(x * 100)}%`);

export default function SalgClient({ clients: clientsProp, nowISO }: { clients: Client[]; nowISO: string }) {
  const router = useRouter();
  const now = new Date(nowISO);
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
  const fn = funnel(deals);
  const conv = conversionRates(fn);
  const wr = winRate(deals);
  const econ = dealEconomics(deals);
  const quarter = quarterOf(now);
  const expMonth = expectedCloseIn(deals, monthPeriod(now));
  const expQuarter = expectedCloseIn(deals, quarter);
  const segSource = segmentBy(deals, "source");
  const segOwner = segmentBy(deals, "owner");
  const overdue = overdueDeals(deals, now);

  const openDeals = deals.filter(isOpen);

  // Funnel view-model: attach each step's inbound conversion rate so the chips
  // between bands show the exact "Overgange" percentages.
  const funnelSteps: FunnelStepView[] = fn.map((s, i) => ({
    label: s.label,
    count: s.count,
    value: dkk(s.weightedValue),
    rate: i > 0 ? conv.transitions[i - 1]?.rate ?? null : undefined,
  }));

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {banner && (
        <div className="cc-card cc-card-pad" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          {banner}
        </div>
      )}

      {/* ============ PIPELINE — hero + editable deal rows ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Pipeline</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Åbne deals vægtet med sandsynlighed pr. stadie — dit deal-bord.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1.5fr) repeat(2, minmax(120px, 1fr))", gap: 14, alignItems: "start" }}>
          <HeroMetric kicker="Pipeline-værdi (vægtet)" value={dkk(pipeline.total)} sub="Σ (setup + 12× mdr) × sandsynlighed" />
          <StatTile label="Åbne deals" value={String(openDeals.length)} sub="i pipelinen nu" />
          <StatTile label="Win rate" value={pct(wr.rate)} sub={`${wr.won} vundet · ${wr.lost} tabt`} />
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          {pipeline.byStage.every((s) => s.count === 0) ? (
            <p style={{ fontSize: 13, color: DIM }}>Ingen åbne deals i pipelinen endnu — nye leads lander her som stadie “Lead”.</p>
          ) : pipeline.byStage.map((s) => {
            const max = Math.max(...pipeline.byStage.map((x) => x.value), 1);
            return <BarRow key={s.stage} label={s.label} sub={`(${s.count})`} frac={s.value / max} value={dkk(s.value)} tip={`${s.label}: ${s.count} deal${s.count === 1 ? "" : "s"} · ${dkk(s.value)} vægtet`} />;
          })}
        </div>

        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 14, display: "grid", gap: 8 }}>
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
        <div>
          <h2 style={H2}>Funnel &amp; konvertering</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
            Nuværende fordeling pr. stadie med overgangs-procenter (ikke en kohorte — stadie-historik kommer med snapshots).
          </p>
        </div>
        <Funnel steps={funnelSteps} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <StatTile label="Kontaktet → Vundet" value={pct(conv.overall)} sub="samlet konvertering" />
          <StatTile label="Win rate" value={pct(wr.rate)} sub={`${wr.won} vundet · ${wr.lost} tabt`} />
        </div>
      </section>

      {/* ============ DEAL-ØKONOMI ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Deal-økonomi</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Hvad en gennemsnitlig vundet deal er værd, og hvad der ligger åbent.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 1.5fr) repeat(2, minmax(130px, 1fr))", gap: 14, alignItems: "start" }}>
          <HeroMetric kicker="Gns. dealværdi" value={dkk(econ.avgDealValue)} sub={`setup + 12× mdr · ${econ.wonCount} vundne deals`} />
          <StatTile label="Gns. engangs" value={dkk(econ.avgSetup)} sub="setup pr. vundet deal" />
          <StatTile label="Gns. recurring (år)" value={dkk(econ.avgRecurringAnnual)} sub="12× mdr pr. vundet deal" />
        </div>
        <NumbersStrip items={[
          { label: "Åben pipeline (rå)", value: dkk(econ.openRaw), sub: "uvægtet total" },
          { label: "Åben pipeline (vægtet)", value: dkk(econ.openWeighted), sub: "× sandsynlighed" },
          { label: "Forventet luk · md", value: dkk(expMonth.weighted), sub: `${expMonth.count} deals · rå ${dkk(expMonth.raw)}` },
          { label: `Forventet luk · ${quarter.key}`, value: dkk(expQuarter.weighted), sub: `${expQuarter.count} deals · rå ${dkk(expQuarter.raw)}` },
        ]} />
      </section>

      {/* ============ SEGMENTERING ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Segmentering</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Hvilken kanal og hvem der faktisk konverterer — vundet værdi pr. segment.</p>
        </div>
        <div style={{ display: "grid", gap: 18 }}>
          <SegmentTable title="Pr. kilde" segments={segSource} emptyNote="Segmenter vises som “ukendt” indtil deals får kilde (outreach/inbound/referral) på Salg-rækkerne." />
          <SegmentTable title="Pr. ejer" segments={segOwner} emptyNote="Sæt ejer (charlie/lucas) på deals, så fordelingen kan vises her." />
        </div>
      </section>

      {/* ============ HYGIEJNE ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Hygiejne</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
            Åbne deals forbi deres forventede lukkedato. (Salgscyklus &amp; dage-pr-stadie kræver stadie-historik — kommer med snapshots.)
          </p>
        </div>
        {overdue.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "12px 14px", background: "var(--accent-soft)", borderRadius: 10, fontSize: 13, color: "var(--accent-ink)" }}>
            <ShieldCheck size={16} aria-hidden /> Ingen forfaldne deals — pipelinen er ajour.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {overdue.map((d) => (
              <div key={d.name} className="cc-hoverrow" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderLeft: "3px solid var(--amber)", borderRadius: 8, padding: "9px 12px", fontSize: 12.5 }}>
                <Clock size={13} style={{ color: "var(--amber)", flexShrink: 0 }} aria-hidden />
                <span style={{ fontWeight: 600, flex: "1 1 130px" }}>{d.name}</span>
                <StagePill stage={d.stage} />
                <span style={{ color: "oklch(45% 0.12 70)", fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums" }}>{d.daysOverdue} dage forsinket</span>
                <span style={{ color: DIM }}>(forventet {d.expectedClose})</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SegmentTable({ title, segments, emptyNote }: { title: string; segments: ReturnType<typeof segmentBy>; emptyNote: string }) {
  const onlyUnknown = segments.length === 1 && segments[0].key === "ukendt";
  const maxValue = Math.max(...segments.map((s) => s.value), 1);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <SectionLabel>{title}</SectionLabel>
      {segments.length === 0 ? (
        <p style={{ fontSize: 12.5, color: DIM }}>{emptyNote}</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, fontSize: 10.5, color: DIM, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0 2px" }}>
              <span>Segment</span><span style={{ textAlign: "right" }}>Antal</span><span style={{ textAlign: "right", minWidth: 92 }}>Værdi</span><span style={{ textAlign: "right", minWidth: 52 }}>Win</span>
            </div>
            {segments.map((s) => (
              <div key={s.key} className="cc-hoverrow" style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12, alignItems: "center", fontSize: 12.5, padding: "7px 2px", borderTop: "1px solid var(--border)", borderRadius: 4 }}>
                <span style={{ textTransform: "capitalize" }}>{s.key}</span>
                <span style={{ textAlign: "right", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums lining-nums" }}>{s.count}</span>
                <span style={{ textAlign: "right", minWidth: 92, position: "relative" }}>
                  {/* faint inline value bar behind the number */}
                  <span aria-hidden style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)", height: 16, width: `${Math.max((s.value / maxValue) * 100, s.value > 0 ? 8 : 0)}%`, maxWidth: "100%", background: "var(--accent-soft)", borderRadius: 4 }} />
                  <span style={{ position: "relative", fontVariantNumeric: "tabular-nums lining-nums" }}>{dkk(s.value)}</span>
                </span>
                <span style={{ textAlign: "right", minWidth: 52, color: "var(--text-muted)" }}>{pct(s.win.rate)}</span>
              </div>
            ))}
          </div>
          {onlyUnknown && <p style={{ fontSize: 11.5, color: DIM }}>{emptyNote}</p>}
        </>
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
  const stage = stageOf(deal);
  const feeStyle: React.CSSProperties = { width: 84, padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, fontVariantNumeric: "tabular-nums lining-nums" };
  const feeLabel: React.CSSProperties = { fontSize: 10, color: DIM, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div className="cc-hoverrow" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 13px", boxShadow: "var(--shadow-card)", opacity: busy ? 0.7 : 1, transition: "opacity 150ms ease" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 150, flex: "1 1 150px" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-display)" }}>{deal.name}</span>
        <StagePill stage={stage} />
      </span>

      <label style={{ display: "grid", gap: 2 }}>
        <span style={feeLabel}>Stadie</span>
        <select value={stage} disabled={busy}
          onChange={(e) => run({ stage: e.target.value }, { stage: e.target.value })}
          aria-label={`Stadie for ${deal.name}`}
          className="cc-focus"
          style={{ padding: "6px 8px", borderRadius: 7, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text)", fontSize: 12.5, cursor: "pointer" }}>
          {ALL_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS_DA[s]}</option>)}
        </select>
      </label>

      <label style={{ display: "grid", gap: 2 }}>
        <span style={feeLabel}>kr/md</span>
        <input type="number" inputMode="numeric" value={mrr} placeholder="0" disabled={busy}
          onChange={(e) => setMrr(e.target.value)}
          onBlur={() => { if (mrr !== (deal.monthlyFee || "")) run({ monthlyFee: mrr }, { monthlyFee: mrr }); }}
          className="cc-focus" style={feeStyle} />
      </label>
      <label style={{ display: "grid", gap: 2 }}>
        <span style={feeLabel}>Setup kr</span>
        <input type="number" inputMode="numeric" value={setup} placeholder="0" disabled={busy}
          onChange={(e) => setSetup(e.target.value)}
          onBlur={() => { if (setup !== (deal.setupFee || "")) run({ setupFee: setup }, { setupFee: setup }); }}
          className="cc-focus" style={feeStyle} />
      </label>

      <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignSelf: "flex-end" }}>
        <button className="cc-btn cc-btn-accent cc-focus" style={{ height: 32 }} disabled={busy}
          onClick={() => run({ markWon: true }, { stage: "won", wonDate: today })}
          title="Markér som vundet (stempler dagens dato)">
          <Trophy size={13} aria-hidden /> Vundet
        </button>
        <button className="cc-btn cc-focus" style={{ height: 32, color: "var(--text-muted)" }} disabled={busy}
          onClick={() => run({ markLost: true }, { stage: "lost", lostDate: today })}
          title="Markér som tabt (stempler dagens dato)">
          <XCircle size={13} aria-hidden /> Tabt
        </button>
      </div>
    </div>
  );
}
