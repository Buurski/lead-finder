"use client";
import { useState } from "react";
import type { Client, Snapshot, Target } from "@/lib/sheets";
import {
  type Period, dkk, mrrRunRate, setupBooked, yearPeriod, monthPeriod, quarterOf,
} from "@/lib/finance";
import {
  comparePeriods, decomposeRevenue, pipelineCoverage, arpa,
  monthlySalesSeries, segmentBy, overdueDeals, keyInsights, type Tone,
} from "@/lib/insights";
import { hasHistory, changeOverDays } from "@/lib/history";
import {
  CARD, H2, DIM, SectionLabel, BarRow, KpiCard, BarChart, LineChart, BuildingHistory,
} from "@/components/finance/FinanceUI";
import Icon from "@/components/shell/Icon";

type PeriodKind = "month" | "quarter" | "year";
const pct = (x: number | null): string => (x == null ? "—" : `${Math.round(x * 100)}%`);
const kShort = (n: number): string => (Math.abs(n) >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));

// Current + previous period for the selected granularity, plus the snapshot
// look-back window used for point-in-time deltas (ARPA).
function periodsFor(kind: PeriodKind, now: Date): { current: Period; previous: Period; label: string; days: number } {
  if (kind === "month") {
    return { current: monthPeriod(now), previous: monthPeriod(new Date(now.getFullYear(), now.getMonth() - 1, 15)), label: "måned", days: 30 };
  }
  if (kind === "year") {
    return { current: yearPeriod(now), previous: yearPeriod(new Date(now.getFullYear() - 1, 5, 15)), label: "år", days: 365 };
  }
  const q = quarterOf(now);
  const prevQ = quarterOf(new Date(q.start.getFullYear(), q.start.getMonth() - 1, 15));
  return { current: { start: q.start, end: q.end }, previous: { start: prevQ.start, end: prevQ.end }, label: "kvartal", days: 91 };
}

const TONE_COLOR: Record<Tone, string> = {
  positive: "var(--accent-ink)",
  neutral: "var(--text-dim)",
  warning: "var(--amber)",
};

export default function IndsigterClient({
  clients, snapshots, target, nowISO,
}: {
  clients: Client[]; snapshots: Snapshot[]; target: Target | null; nowISO: string;
}) {
  // This repo runs the React Compiler — it auto-memoizes, so these plain derived
  // consts are fine (manual useMemo here fought the compiler's optimization).
  const now = new Date(nowISO);
  const [kind, setKind] = useState<PeriodKind>("month");

  const p = periodsFor(kind, now);
  const cmp = comparePeriods(clients, p.current, p.previous);
  const dec = decomposeRevenue(cmp.current, cmp.previous);
  const cov = pipelineCoverage(clients, target, now);
  const monthly = monthlySalesSeries(clients, now, 6);
  const segSource = segmentBy(clients, "source");
  const overdueCount = overdueDeals(clients, now).length;
  const insights = keyInsights({
    periodLabel: p.label, comparison: cmp, pipelineCoverage: cov, overdueCount, hasHistory: hasHistory(snapshots),
  });

  const cur = cmp.current;

  // ARPA now, plus a snapshot-derived delta when history reaches back far enough.
  const arpaNow = arpa(clients);
  const mrrCh = changeOverDays(snapshots, "mrr_runrate", p.days);
  const liveCh = changeOverDays(snapshots, "clients_live", p.days);
  const arpaDelta = (!mrrCh || !liveCh || liveCh.previous <= 0)
    ? undefined
    : (() => {
        const prevArpa = mrrCh.previous / liveCh.previous;
        return { abs: arpaNow - prevArpa, pct: prevArpa !== 0 ? (arpaNow - prevArpa) / prevArpa : null };
      })();

  // MRR vs engangs (realized): setup booked this year vs annualised run-rate.
  const engangsYtd = setupBooked(clients, yearPeriod(now));
  const arr = mrrRunRate(clients) * 12;
  const splitMax = Math.max(engangsYtd, arr, 1);

  const maxSeg = Math.max(...segSource.map((s) => s.value), 1);
  const decMax = Math.max(Math.abs(dec.volumeEffect), Math.abs(dec.valueEffect), 1);

  const TABS: { k: PeriodKind; label: string }[] = [
    { k: "month", label: "Måned" }, { k: "quarter", label: "Kvartal" }, { k: "year", label: "År" },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: DIM, marginRight: 4 }}>Periode:</span>
        {TABS.map((t) => (
          <button key={t.k} onClick={() => setKind(t.k)}
            className="cc-btn cc-focus" data-active={kind === t.k}
            style={{ height: 32, background: kind === t.k ? "var(--accent)" : "var(--surface)", color: kind === t.k ? "#fff" : "var(--text)", borderColor: kind === t.k ? "var(--accent)" : "var(--border)" }}>
            {t.label}
          </button>
        ))}
        <span style={{ fontSize: 11.5, color: DIM, marginLeft: "auto" }}>vs. forrige {p.label}</span>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <KpiCard label="Omsætning" value={dkk(cur.revenue)} delta={cmp.deltas.revenue} deltaFormat={dkk} spark={monthly.map((m) => m.revenue)} sub={`setup booket · ${p.label}`} />
        <KpiCard label="Nye kunder lukket" value={String(cur.newClients)} delta={cmp.deltas.newClients} />
        <KpiCard label="Gns. dealværdi" value={dkk(cur.avgDealValue)} delta={cmp.deltas.avgDealValue} deltaFormat={dkk} />
        <KpiCard label="ARPA" value={dkk(arpaNow)} delta={arpaDelta} sub="MRR ÷ aktive kunder" />
        <KpiCard label="Win rate" value={pct(cur.winRate)} delta={cmp.deltas.winRate} sub={`${cur.closedWon}/${cur.closedWon + cur.closedLost} lukkede`} />
        <KpiCard label="MRR tilføjet" value={dkk(cur.mrrAdded)} delta={cmp.deltas.mrrAdded} deltaFormat={dkk} sub="/md" />
        <KpiCard label="Churned MRR" value={dkk(cur.churnedMrr)} delta={cmp.deltas.churnedMrr} goodIsUp={false} deltaFormat={dkk} sub="/md" />
        <KpiCard label="Pipeline-dækning" value={cov == null ? "mål nået" : `${cov.toFixed(1)}×`} sub="vægtet ÷ rest af kvartalsmål" />
      </div>

      {/* Key insights */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Nøgleindsigter</h2>
        {insights.length === 0 ? (
          <p style={{ fontSize: 13, color: DIM }}>Ingen tydelige mønstre i denne {p.label} endnu.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, color: "var(--text)" }}>
                <Icon name={ins.icon} style={{ width: 16, height: 16, color: TONE_COLOR[ins.tone], flexShrink: 0, marginTop: 1 }} />
                <span>{ins.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Charts */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Trends</h2>
        {monthly.every((m) => m.revenue === 0 && m.wonCount === 0) ? (
          <BuildingHistory what="salgshistorik" />
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <SectionLabel>Omsætning pr. måned</SectionLabel>
              <BarChart data={monthly.map((m) => ({ label: m.label, value: m.revenue }))} format={kShort} />
            </div>
            <div>
              <SectionLabel>Deals lukket pr. måned</SectionLabel>
              <BarChart data={monthly.map((m) => ({ label: m.label, value: m.wonCount }))} format={(n) => String(Math.round(n))} />
            </div>
            <div>
              <SectionLabel>Gns. dealværdi (trend)</SectionLabel>
              <LineChart data={monthly.map((m) => ({ label: m.label, value: m.avgDealValue }))} format={kShort} />
            </div>
          </div>
        )}
      </section>

      {/* Splits */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Fordelinger</h2>
        <div>
          <SectionLabel>Omsætning pr. kilde</SectionLabel>
          <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
            {segSource.every((s) => s.value === 0) ? (
              <p style={{ fontSize: 12.5, color: DIM }}>Ingen vundet omsætning at fordele endnu.</p>
            ) : segSource.map((s) => (
              <BarRow key={s.key} label={<span style={{ textTransform: "capitalize" }}>{s.key}</span>} frac={s.value / maxSeg} value={dkk(s.value)} />
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <SectionLabel>Engangs vs. recurring</SectionLabel>
          <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
            <BarRow label="Engangs (setup i år)" frac={engangsYtd / splitMax} value={dkk(engangsYtd)} />
            <BarRow label="Recurring (ARR)" frac={arr / splitMax} value={dkk(arr)} />
          </div>
        </div>
      </section>

      {/* Growth decomposition */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 style={H2}>Vækst-drivere</h2>
          <span style={{ fontSize: 12.5, color: DIM }}>samlet Δ <strong style={{ color: "var(--text)" }}>{signed(dec.totalDelta)}</strong></span>
        </div>
        <p style={{ fontSize: 11.5, color: DIM, marginTop: -6 }}>
          Omsætnings-ændringen vs. forrige {p.label} delt i volumen (flere/færre deals) og værdi (større/mindre deals).
        </p>
        <div style={{ display: "grid", gap: 10 }}>
          <DecompBar label="Volumen-effekt" value={dec.volumeEffect} max={decMax} sub={`${dec.n0} → ${dec.n1} deals`} />
          <DecompBar label="Værdi-effekt" value={dec.valueEffect} max={decMax} sub={`${dkk(dec.v0)} → ${dkk(dec.v1)} / deal`} />
        </div>
      </section>
    </div>
  );
}

function signed(n: number): string {
  const s = dkk(Math.abs(n));
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
}

// Signed horizontal bar centred on zero: green right for positive, red left for
// negative. Used for the two growth-decomposition effects.
function DecompBar({ label, value, max, sub }: { label: string; value: number; max: number; sub: string }) {
  const frac = Math.min(Math.abs(value) / max, 1);
  const positive = value >= 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "150px 1fr auto", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}<span style={{ color: DIM, display: "block", fontSize: 10.5 }}>{sub}</span></span>
      <div style={{ position: "relative", height: 12, background: "var(--bg-3)", borderRadius: 999 }}>
        <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "var(--border-strong)" }} />
        <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 999,
          [positive ? "left" : "right"]: "50%",
          width: `${(frac * 50).toFixed(1)}%`,
          background: positive ? "var(--accent)" : "var(--red)",
          transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" } as React.CSSProperties} />
      </div>
      <span style={{ fontSize: 12.5, fontVariantNumeric: "tabular-nums", minWidth: 84, textAlign: "right", color: positive ? "var(--accent-ink)" : "var(--red)" }}>{signed(value)}</span>
    </div>
  );
}
