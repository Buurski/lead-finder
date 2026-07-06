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
  CARD, H2, DIM, SectionLabel, BarRow, KpiCard, BarChart, LineChart, GhostChart,
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

// Briefing tones: icon circle tint + hairline accent per insight.
const TONE_STYLE: Record<Tone, { fg: string; bg: string }> = {
  positive: { fg: "var(--accent-ink)", bg: "var(--accent-soft)" },
  neutral: { fg: "var(--text-dim)", bg: "var(--bg-3)" },
  warning: { fg: "oklch(45% 0.12 70)", bg: "var(--amber-dim)" },
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
  const salesEmpty = monthly.every((m) => m.revenue === 0 && m.wonCount === 0);

  const TABS: { k: PeriodKind; label: string }[] = [
    { k: "month", label: "Måned" }, { k: "quarter", label: "Kvartal" }, { k: "year", label: "År" },
  ];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {/* Period selector — the app's segmented control */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="cc-tabs" role="tablist" aria-label="Vælg periode">
          {TABS.map((t) => (
            <button key={t.k} role="tab" aria-selected={kind === t.k} className="cc-tab cc-focus"
              data-active={kind === t.k} onClick={() => setKind(t.k)}>
              {t.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 11.5, color: DIM }}>vs. forrige {p.label}</span>
      </div>

      {/* KPI rows: 4 primary, then 4 compact secondary */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
        <KpiCard primary label="Omsætning" value={dkk(cur.revenue)} delta={cmp.deltas.revenue} deltaFormat={dkk} spark={monthly.map((m) => m.revenue)} sub={`setup booket · denne ${p.label}`} />
        <KpiCard primary label="Nye kunder lukket" value={String(cur.newClients)} delta={cmp.deltas.newClients} />
        <KpiCard primary label="MRR tilføjet" value={dkk(cur.mrrAdded)} delta={cmp.deltas.mrrAdded} deltaFormat={dkk} sub="/md" />
        <KpiCard primary label="Win rate" value={pct(cur.winRate)} delta={cmp.deltas.winRate} sub={`${cur.closedWon}/${cur.closedWon + cur.closedLost} lukkede`} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: -8 }}>
        <KpiCard label="Gns. dealværdi" value={dkk(cur.avgDealValue)} delta={cmp.deltas.avgDealValue} deltaFormat={dkk} />
        <KpiCard label="ARPA" value={dkk(arpaNow)} delta={arpaDelta} sub="MRR ÷ aktive kunder" />
        <KpiCard label="Churned MRR" value={dkk(cur.churnedMrr)} delta={cmp.deltas.churnedMrr} goodIsUp={false} deltaFormat={dkk} sub="/md" />
        <KpiCard label="Pipeline-dækning" value={cov == null ? "mål nået" : `${cov.toFixed(1)}×`} sub="vægtet ÷ rest af kvartalsmål" />
      </div>

      {/* Nøgleindsigter — the briefing */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Nøgleindsigter</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Automatisk briefing ud fra tallene — intet er opdigtet.</p>
        </div>
        {insights.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", background: "var(--bg-3)", borderRadius: 10, fontSize: 12.5, color: DIM }}>
            <Icon name="Hourglass" style={{ width: 15, height: 15 }} aria-hidden />
            Ingen tydelige mønstre i denne {p.label} endnu — briefingen skriver sig selv når der er lukket flere deals.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 7 }}>
            {insights.map((ins, i) => {
              const t = TONE_STYLE[ins.tone];
              return (
                <div key={i} className="cc-hoverrow" style={{ display: "flex", alignItems: "center", gap: 11, fontSize: 13, color: "var(--text)", padding: "7px 9px", borderRadius: 9 }}>
                  <span aria-hidden style={{ width: 27, height: 27, borderRadius: 999, background: t.bg, display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Icon name={ins.icon} style={{ width: 14, height: 14, color: t.fg }} />
                  </span>
                  <span style={{ lineHeight: 1.45 }}>{ins.text}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Trends */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Trends</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Sidste 6 måneder, afledt af vundne deals (won_date).</p>
        </div>
        {salesEmpty ? (
          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <SectionLabel>Omsætning pr. måned</SectionLabel>
              <div style={{ marginTop: 8 }}><GhostChart note="Bygger salgshistorik — søjlerne tegnes af vundne deals måned for måned." /></div>
            </div>
            <div>
              <SectionLabel>Deals lukket pr. måned</SectionLabel>
              <div style={{ marginTop: 8 }}><GhostChart height={72} note="Fyldes i takt med at deals markeres “Vundet” på Salg-siden." /></div>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 22 }}>
            <div>
              <SectionLabel>Omsætning pr. måned</SectionLabel>
              <BarChart data={monthly.map((m) => ({ label: m.label, value: m.revenue }))} format={kShort} tipFormat={dkk} />
            </div>
            <div>
              <SectionLabel>Deals lukket pr. måned</SectionLabel>
              <BarChart data={monthly.map((m) => ({ label: m.label, value: m.wonCount }))} format={(n) => String(Math.round(n))} height={80} />
            </div>
            <div>
              <SectionLabel>Gns. dealværdi (trend)</SectionLabel>
              <LineChart data={monthly.map((m) => ({ label: m.label, value: m.avgDealValue }))} format={kShort} />
            </div>
          </div>
        )}
      </section>

      {/* Fordelinger */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Fordelinger</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Hvor omsætningen kommer fra — kanal og indtægtstype.</p>
        </div>
        <div>
          <SectionLabel>Omsætning pr. kilde</SectionLabel>
          <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
            {segSource.every((s) => s.value === 0) ? (
              <p style={{ fontSize: 12.5, color: DIM }}>Ingen vundet omsætning at fordele endnu — vind den første deal, så tegnes fordelingen her.</p>
            ) : segSource.map((s) => (
              <BarRow key={s.key} label={<span style={{ textTransform: "capitalize" }}>{s.key}</span>} frac={s.value / maxSeg} value={dkk(s.value)} tip={`${s.key}: ${dkk(s.value)} · win rate ${pct(s.win.rate)}`} />
            ))}
          </div>
        </div>
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <SectionLabel>Engangs vs. recurring</SectionLabel>
          <div style={{ display: "grid", gap: 9, marginTop: 8 }}>
            <BarRow label="Engangs (setup i år)" frac={engangsYtd / splitMax} value={dkk(engangsYtd)} labelWidth={160} />
            <BarRow label="Recurring (ARR)" frac={arr / splitMax} value={dkk(arr)} labelWidth={160} />
          </div>
        </div>
      </section>

      {/* Vækst-drivere — the editorial decomposition */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={H2}>Vækst-drivere</h2>
            <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              Omsætnings-ændringen vs. forrige {p.label}, delt i volumen (flere/færre deals) og værdi (større/mindre deals). De to summer altid til totalen.
            </p>
          </div>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, color: dec.totalDelta >= 0 ? "var(--accent-ink)" : "var(--red)", fontVariantNumeric: "tabular-nums lining-nums" }}>
            {signed(dec.totalDelta)}
          </span>
        </div>
        <div style={{ display: "grid", gap: 14, paddingTop: 4 }}>
          <DecompBar label="Volumen-effekt" value={dec.volumeEffect} max={decMax} sub={`${dec.n0} → ${dec.n1} deals`} />
          <DecompBar label="Værdi-effekt" value={dec.valueEffect} max={decMax} sub={`${dkk(dec.v0)} → ${dkk(dec.v1)} / deal`} />
        </div>
        <div aria-hidden style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 10 }}>
          <span />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", color: DIM, textTransform: "uppercase" }}>
            <span>← negativ</span><span>positiv →</span>
          </div>
          <span style={{ minWidth: 92 }} />
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
// negative. The two bars share a scale so their relative weight reads honestly.
function DecompBar({ label, value, max, sub }: { label: string; value: number; max: number; sub: string }) {
  const frac = Math.min(Math.abs(value) / max, 1);
  const positive = value >= 0;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)" }}>{label}<span style={{ color: DIM, display: "block", fontSize: 10.5, fontWeight: 400 }}>{sub}</span></span>
      <div className="cc-tip" data-tip={`${label}: ${signed(value)}`} tabIndex={0} style={{ position: "relative", height: 16, background: "var(--bg-3)", borderRadius: 999, outline: "none" }}>
        <div aria-hidden style={{ position: "absolute", left: "50%", top: -3, bottom: -3, width: 2, background: "var(--border-strong)", borderRadius: 2, transform: "translateX(-1px)" }} />
        <div style={{ position: "absolute", top: 2, height: 12, borderRadius: 999,
          [positive ? "left" : "right"]: "50%",
          width: `${(frac * 50).toFixed(1)}%`,
          background: positive ? "var(--accent)" : "var(--red)",
          transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" } as React.CSSProperties} />
      </div>
      <span style={{ fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums", minWidth: 92, textAlign: "right", color: positive ? "var(--accent-ink)" : "var(--red)" }}>{signed(value)}</span>
    </div>
  );
}
