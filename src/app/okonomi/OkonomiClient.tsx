"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import type { Client, Target, Snapshot } from "@/lib/sheets";
import {
  suggestTarget, dkk, mrrRunRate, annualised, setupBooked, periodRevenue,
  wonCount, monthPeriod, monthPeriodAt, quarterOf, pace, projectedEoqMrr,
  type PaceStatus,
} from "@/lib/finance";
import { periodStats, pipelineCoverage, arpa } from "@/lib/insights";
import { seriesOf, changeOverDays } from "@/lib/history";
import {
  CARD, H2, DIM, StatTile, HeroMetric, NumbersStrip, Meter, Pill, SectionLabel,
  type PillTone,
} from "@/components/finance/FinanceUI";

const PACE_PILL: Record<PaceStatus, { label: string; tone: PillTone }> = {
  "on-pace": { label: "På sporet", tone: "green" },
  "slightly-behind": { label: "Lidt bagud", tone: "amber" },
  "behind": { label: "Bagud", tone: "red" },
};

// ---- inline-editable integer (targets) ------------------------------------

function InlineNumber({
  value, suffix, onSave, ariaLabel,
}: {
  value: number; suffix?: string; onSave: (n: number) => Promise<void>; ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function open() { setDraft(String(value)); setErr(""); setEditing(true); }
  async function commit() {
    const n = Number(draft);
    if (!Number.isFinite(n) || n < 0) { setErr("ugyldigt tal"); return; }
    setSaving(true); setErr("");
    try { await onSave(Math.round(n)); setEditing(false); }
    catch { setErr("kunne ikke gemme"); }
    finally { setSaving(false); }
  }

  if (!editing) {
    return (
      <button onClick={open} aria-label={`Rediger ${ariaLabel}`} className="cc-editable cc-focus"
        style={{ display: "inline-flex", alignItems: "baseline", gap: 5, background: "none", border: "none", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums" }}>
          {value.toLocaleString("da-DK")}{suffix ? ` ${suffix}` : ""}
        </span>
        <Pencil size={11} className="cc-editable-pen" style={{ color: "var(--accent-ink)", flexShrink: 0 }} aria-hidden />
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <input autoFocus type="number" inputMode="numeric" value={draft} disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setErr(""); } }}
        style={{ width: 84, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: 13 }} />
      <button onClick={commit} disabled={saving} aria-label="Gem" style={iconBtn("var(--accent)")}><Check size={13} color="#fff" /></button>
      <button onClick={() => { setEditing(false); setErr(""); }} disabled={saving} aria-label="Annullér" style={iconBtn("var(--bg-3)")}><X size={13} /></button>
      {err && <span style={{ fontSize: 11, color: "var(--red)" }}>{err}</span>}
    </span>
  );
}
function iconBtn(bg: string): React.CSSProperties {
  return { display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: bg, cursor: "pointer" };
}

// Quarter progress with the "hvor du bør være i dag" pace tick.
function ProgressRow({
  label, actual, target, suffix, onSave, frac, markerFrac, behind,
}: {
  label: string; actual: string; target: number; suffix?: string; onSave: (n: number) => Promise<void>; frac: number; markerFrac: number; behind?: boolean;
}) {
  const pct = Math.min(Math.max(frac, 0), 1) * 100;
  const marker = Math.min(Math.max(markerFrac, 0), 1) * 100;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 7 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{label}</span>
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontSize: 13, color: DIM }}>
          <strong style={{ fontFamily: "var(--font-display)", fontSize: 16, color: "var(--text)", fontVariantNumeric: "tabular-nums lining-nums" }}>{actual}</strong>
          / <InlineNumber value={target} suffix={suffix} ariaLabel={`mål: ${label}`} onSave={onSave} />
        </span>
      </div>
      <div style={{ position: "relative", height: 12, borderRadius: 999, background: "var(--bg-3)", overflow: "visible" }}>
        <div className="cc-grow-x" style={{ width: `${pct}%`, height: "100%", background: behind ? "var(--amber)" : "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
        <div className="cc-tip" data-tip="Hvor du bør være i dag" tabIndex={0}
          style={{ position: "absolute", top: -4, left: `${marker}%`, width: 2, height: 20, background: "var(--text)", borderRadius: 2, transform: "translateX(-1px)", outline: "none" }}>
          <span aria-hidden style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em", color: DIM, textTransform: "uppercase", whiteSpace: "nowrap" }}>i dag</span>
        </div>
      </div>
    </div>
  );
}

// ---- main -----------------------------------------------------------------

export default function OkonomiClient({
  clients, target: targetProp, targetIsDefault, snapshots, nowISO,
}: {
  clients: Client[]; target: Target; targetIsDefault: boolean; snapshots: Snapshot[]; nowISO: string;
}) {
  const router = useRouter();
  const now = new Date(nowISO);

  const [target, setTarget] = useState<Target>(targetProp);
  const [growth, setGrowth] = useState(1.15);
  // Reconcile local (optimistic) target when fresh server props arrive.
  const [seed, setSeed] = useState(targetProp);
  if (seed !== targetProp) { setSeed(targetProp); setTarget(targetProp); }

  async function saveTarget(patch: Partial<Target>) {
    const prev = target;
    setTarget({ ...target, ...patch }); // optimistic
    const res = await fetch("/api/finance/targets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter: target.quarter, ...patch }),
    });
    if (!res.ok) { setTarget(prev); throw new Error("target save failed"); }
    router.refresh();
  }

  // --- derived (React Compiler auto-memoizes) ---
  const runRate = mrrRunRate(clients);
  const arr = annualised(runRate);
  const arpaNow = arpa(clients);
  const month = monthPeriod(now);
  const quarter = quarterOf(now);
  const mStats = periodStats(clients, month);
  const qStats = periodStats(clients, quarter);

  const mrrGrowth = changeOverDays(snapshots, "mrr_runrate", 30);
  const mrrSpark = seriesOf(snapshots, "mrr_runrate").map((p) => p.value);
  const mrrDelta = mrrGrowth ? { abs: mrrGrowth.abs, pct: mrrGrowth.pct } : undefined;

  const setupMonth = setupBooked(clients, month);
  const setupQuarter = setupBooked(clients, quarter);
  const setupYear = setupBooked(clients, { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31, 23, 59, 59) });
  const totalMonth = periodRevenue(clients, month);
  const prev3 = [1, 2, 3].map((i) => setupBooked(clients, monthPeriodAt(now.getFullYear(), now.getMonth() - i)));
  const avgMonthly = prev3.reduce((a, b) => a + b, 0) / 3 + runRate;
  const revSpark = [3, 2, 1, 0].map((i) => setupBooked(clients, monthPeriodAt(now.getFullYear(), now.getMonth() - i)));

  const newClientsQ = wonCount(clients, quarter);
  const pNew = pace(newClientsQ, target.target_new_clients, now, quarter);
  const projEoq = projectedEoqMrr(clients, quarter.end);
  const coverage = pipelineCoverage(clients, target, now);
  const suggestion = suggestTarget(clients, now, growth);
  const pacePill = PACE_PILL[pNew.status];
  const behind = pNew.status !== "on-pace";

  return (
    <div style={{ display: "grid", gap: 18 }}>

      {/* ============ 1. RECURRING (MRR) — hero band ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Recurring (MRR)</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Den månedlige, tilbagevendende base — det tal der skal vokse.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.6fr) repeat(2, minmax(130px, 1fr))", gap: 14, alignItems: "start" }}>
          <HeroMetric
            kicker="MRR run-rate"
            value={dkk(runRate)}
            delta={mrrDelta}
            deltaFormat={dkk}
            basis="vs. 30 dage"
            spark={mrrSpark.length >= 2 ? mrrSpark : undefined}
            sub={mrrSpark.length >= 2 ? "live-kunder · daglige snapshots" : "live-kunder · sparkline bygges af daglige snapshots"}
          />
          <StatTile label="Annualiseret (ARR)" value={dkk(arr)} sub="MRR × 12" />
          <StatTile label="ARPA" value={dkk(arpaNow)} sub="MRR ÷ aktive kunder" />
        </div>
        <NumbersStrip items={[
          { label: "Ny MRR · md", value: dkk(mStats.mrrAdded), sub: "vundet denne måned" },
          { label: "Churned MRR · md", value: dkk(mStats.churnedMrr), sub: "tabt denne måned" },
          { label: "Netto ny MRR · md", value: dkk(mStats.netNewMrr), sub: "ny − churned" },
        ]} />
      </section>

      {/* ============ 2. ENGANGS & SAMLET OMSÆTNING ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div>
          <h2 style={H2}>Engangs &amp; samlet omsætning</h2>
          <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Setup-honorarer booket ved vundne deals, plus den samlede indtjening.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1.6fr) minmax(150px, 1fr)", gap: 14, alignItems: "start" }}>
          <HeroMetric
            kicker="Samlet omsætning · md"
            value={dkk(totalMonth)}
            spark={revSpark.some((v) => v > 0) ? revSpark : undefined}
            sub="setup + recurring · sidste 4 mdr."
          />
          <StatTile label="Gns. md omsætning" value={dkk(avgMonthly)} sub="trailing 3 mdr. + recurring" />
        </div>
        <div>
          <SectionLabel>Setup booket</SectionLabel>
          <div style={{ marginTop: 8 }}>
            <NumbersStrip items={[
              { label: "Denne måned", value: dkk(setupMonth) },
              { label: quarter.key, value: dkk(setupQuarter) },
              { label: "I år", value: dkk(setupYear) },
            ]} />
          </div>
        </div>
      </section>

      {/* ============ 3. MÅL & TRAJEKTORIE — the centrepiece ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={H2}>Mål &amp; trajektorie</h2>
            <p style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {quarter.key} · mærket viser hvor du bør være i dag ({Math.round(pNew.frac * 100)}% inde i kvartalet). Klik på et mål for at redigere.
            </p>
          </div>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {targetIsDefault && <Pill tone="neutral" title="Ingen mål gemt for kvartalet endnu — viser standard">standard</Pill>}
            <Pill tone={pacePill.tone}>{pacePill.label}</Pill>
          </span>
        </div>

        <div style={{ display: "grid", gap: 20, paddingTop: 6 }}>
          <ProgressRow label="Nye kunder" actual={String(newClientsQ)} target={target.target_new_clients}
            frac={target.target_new_clients > 0 ? newClientsQ / target.target_new_clients : 0} markerFrac={pNew.frac} behind={behind}
            onSave={(n) => saveTarget({ target_new_clients: n })} />
          <ProgressRow label="Setup-omsætning" actual={dkk(setupQuarter)} target={target.target_setup_revenue} suffix="kr"
            frac={target.target_setup_revenue > 0 ? setupQuarter / target.target_setup_revenue : 0} markerFrac={pNew.frac} behind={behind}
            onSave={(n) => saveTarget({ target_setup_revenue: n })} />
          <ProgressRow label="Ny MRR (kvartal)" actual={dkk(qStats.mrrAdded)} target={target.target_mrr_added} suffix="kr"
            frac={target.target_mrr_added > 0 ? qStats.mrrAdded / target.target_mrr_added : 0} markerFrac={pNew.frac} behind={behind}
            onSave={(n) => saveTarget({ target_mrr_added: n })} />
        </div>

        {/* Foreslået mål */}
        <div style={{ background: "var(--accent-soft)", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 8 }}>
          {suggestion.enoughHistory ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Foreslået: <strong style={{ color: "var(--accent-ink)" }}>{suggestion.suggestedClients} kunder</strong>
                {" "}· {dkk(suggestion.suggestedMrrAdded)}/md MRR · sidste 3 mdr. +{Math.round((growth - 1) * 100)}%
              </span>
              <button className="cc-btn" style={{ height: 30, marginLeft: "auto" }}
                onClick={() => saveTarget({ target_new_clients: suggestion.suggestedClients, target_mrr_added: suggestion.suggestedMrrAdded }).catch(() => {})}>
                Brug forslag
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              Ikke nok historik endnu til et forslag — der skal vundne kunder i mindst 2 af de sidste 3 måneder
              (lige nu {suggestion.monthsOfData}). Sæt målet manuelt indtil videre.
            </span>
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: DIM }}>
            Vækstfaktor: <strong style={{ color: "var(--text-muted)" }}>+{Math.round((growth - 1) * 100)}%</strong>
            <input type="range" min={1} max={1.5} step={0.05} value={growth}
              onChange={(e) => setGrowth(Number(e.target.value))}
              style={{ accentColor: "var(--accent)", flex: 1, maxWidth: 220 }} />
            <span>konservativ ↔ ambitiøs</span>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <StatTile label="Projiceret MRR (EOQ)" value={dkk(projEoq)} sub="run-rate + vægtet luk" />
          <Meter value={coverage} label="Pipeline-dækning" sub="vægtet pipeline ÷ rest af kvartalsmål" />
        </div>

        {/* Øvrige mål */}
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 12.5, color: "var(--text-muted)" }}>
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: DIM }}>Outreach/uge</span>
            <InlineNumber value={target.weekly_outreach_floor} ariaLabel="Outreach/uge" onSave={(n) => saveTarget({ weekly_outreach_floor: n })} />
          </span>
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontSize: 11, color: DIM }}>Årligt MRR-mål</span>
            <InlineNumber value={target.annual_mrr_goal} suffix="kr" ariaLabel="Årligt MRR-mål" onSave={(n) => saveTarget({ annual_mrr_goal: n })} />
          </span>
        </div>
      </section>
    </div>
  );
}
