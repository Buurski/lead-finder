"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Trophy } from "lucide-react";
import type { Client, Target } from "@/lib/sheets";
import {
  computeFinance, suggestTarget, dkk, stageOf, isOpen,
  STAGE_LABELS_DA, type PaceStatus,
} from "@/lib/finance";

// ---- shared bits ----------------------------------------------------------

const CARD: React.CSSProperties = { display: "grid", gap: 16 };
const H2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" };
const DIM = "var(--text-dim)";

const ALL_STAGES = [
  "lead", "contacted", "engaged", "concept", "offer", "negotiation",
  "won", "delivering", "live", "lost",
] as const;

const PACE_BADGE: Record<PaceStatus, { label: string; bg: string; color: string }> = {
  "on-pace": { label: "På sporet", bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  "slightly-behind": { label: "Lidt bagud", bg: "var(--amber-dim)", color: "oklch(45% 0.12 70)" },
  "behind": { label: "Bagud", bg: "var(--red-dim)", color: "var(--red)" },
};

function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: "13px 15px", display: "grid", gap: 3 }}>
      <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: DIM }}>{sub}</span>}
    </div>
  );
}

// Inline-editable integer. Click → input → gem/annuller. Optimistic: onSave
// throws to signal failure (caller reverts + surfaces the error).
function InlineNumber({
  value, suffix, onSave, ariaLabel, big,
}: {
  value: number; suffix?: string; onSave: (n: number) => Promise<void>; ariaLabel: string; big?: boolean;
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
      <button onClick={open} aria-label={`Rediger ${ariaLabel}`}
        style={{ display: "inline-flex", alignItems: "baseline", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", fontFamily: "inherit" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: big ? 30 : 15, fontWeight: 600 }}>
          {value.toLocaleString("da-DK")}{suffix ? ` ${suffix}` : ""}
        </span>
        <Pencil size={big ? 14 : 11} style={{ color: "var(--accent-ink)", flexShrink: 0 }} />
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
      <input
        autoFocus type="number" inputMode="numeric" value={draft} disabled={saving}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setEditing(false); setErr(""); } }}
        style={{ width: big ? 90 : 72, padding: "4px 7px", borderRadius: 6, border: "1px solid var(--border-strong)", background: "var(--surface)", color: "var(--text)", fontSize: big ? 18 : 13 }}
      />
      <button onClick={commit} disabled={saving} aria-label="Gem" style={iconBtn("var(--accent)")}><Check size={13} color="#fff" /></button>
      <button onClick={() => { setEditing(false); setErr(""); }} disabled={saving} aria-label="Annullér" style={iconBtn("var(--bg-3)")}><X size={13} /></button>
      {err && <span style={{ fontSize: 11, color: "var(--red)" }}>{err}</span>}
    </span>
  );
}

function iconBtn(bg: string): React.CSSProperties {
  return { display: "grid", placeItems: "center", width: 26, height: 26, borderRadius: 6, border: "1px solid var(--border)", background: bg, cursor: "pointer" };
}

// ---- main -----------------------------------------------------------------

export default function OkonomiClient({
  clients, target: targetProp, targetIsDefault, nowISO,
}: {
  clients: Client[]; target: Target; targetIsDefault: boolean; nowISO: string;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowISO), [nowISO]);

  // Local, optimistic copies of the server data.
  const [deals, setDeals] = useState<Client[]>(clients);
  const [target, setTarget] = useState<Target>(targetProp);
  const [growth, setGrowth] = useState(1.15);
  const [banner, setBanner] = useState<string>("");

  // Reconcile local state when fresh server props arrive after a router.refresh()
  // (React-recommended render-phase sync — not an effect). Between an optimistic
  // edit and its refresh the props are unchanged, so this never clobbers a
  // pending edit.
  const [seed, setSeed] = useState({ clients, targetProp });
  if (seed.clients !== clients || seed.targetProp !== targetProp) {
    setSeed({ clients, targetProp });
    setDeals(clients);
    setTarget(targetProp);
  }

  const fin = useMemo(() => computeFinance(deals, target, now, growth), [deals, target, now, growth]);
  const suggestion = useMemo(() => suggestTarget(deals, now, growth), [deals, now, growth]);

  // --- write helpers (one path each; optimistic then reconcile) ---
  async function saveTarget(patch: Partial<Target>) {
    const prev = target;
    const next = { ...target, ...patch };
    setTarget(next); // optimistic
    const res = await fetch("/api/finance/targets", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quarter: target.quarter, ...patch }),
    });
    if (!res.ok) { setTarget(prev); throw new Error("target save failed"); }
    router.refresh();
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

  const openDeals = deals.filter(isOpen);
  const paceBadge = PACE_BADGE[fin.pace.status];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {banner && (
        <div className="cc-card cc-card-pad" role="alert" style={{ borderColor: "var(--red)", color: "var(--red)", fontSize: 13 }}>
          {banner}
        </div>
      )}

      {/* ============ 1. FORECAST & TRAJEKTORIE ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <h2 style={H2}>Forecast &amp; trajektorie</h2>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
            {targetIsDefault && <span className="cc-chip" title="Ingen mål gemt for kvartalet endnu — viser standard">standard</span>}
            <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: paceBadge.bg, color: paceBadge.color }}>
              {paceBadge.label}
            </span>
          </span>
        </div>

        {/* Nye kunder — target + progress + pace marker */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Nye kunder ({target.quarter})</span>
            <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6, fontSize: 13, color: DIM }}>
              <strong style={{ fontFamily: "var(--font-display)", fontSize: 18, color: "var(--text)" }}>{fin.newClientsThisQuarter}</strong>
              / <InlineNumber value={target.target_new_clients} ariaLabel="mål for nye kunder"
                onSave={(n) => saveTarget({ target_new_clients: n })} />
            </span>
          </div>
          <ProgressWithMarker
            pct={target.target_new_clients > 0 ? (fin.newClientsThisQuarter / target.target_new_clients) * 100 : 0}
            markerPct={fin.pace.frac * 100}
          />
          <div style={{ fontSize: 11.5, color: DIM, marginTop: 6 }}>
            Markøren viser hvor du bør være i dag ({Math.round(fin.pace.frac * 100)}% inde i kvartalet).
          </div>
        </div>

        {/* Foreslået mål */}
        <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: "12px 14px", display: "grid", gap: 8 }}>
          {suggestion.enoughHistory ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
                Foreslået: <strong style={{ color: "var(--text)" }}>{suggestion.suggestedClients} kunder</strong>
                {" "}· {dkk(suggestion.suggestedMrrAdded)}/md MRR · baseret på sidste 3 mdr. +{Math.round((growth - 1) * 100)}%
              </span>
              <button className="cc-btn" style={{ height: 30, marginLeft: "auto" }}
                onClick={() => saveTarget({ target_new_clients: suggestion.suggestedClients, target_mrr_added: suggestion.suggestedMrrAdded }).catch(() => {})}>
                Brug forslag
              </button>
            </div>
          ) : (
            <span style={{ fontSize: 12.5, color: DIM }}>
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

        {/* Run-rate tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="MRR run-rate" value={dkk(fin.runRate)} sub="live-kunder" />
          <StatTile label="Projiceret MRR" value={dkk(fin.projectedEoqMrr)} sub="ved kvartalets slut" />
          <StatTile label="Annualiseret run-rate" value={dkk(fin.annualised)} sub="MRR × 12" />
        </div>

        {/* Øvrige kvartalsmål — alle inline-redigerbare */}
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 12, fontSize: 12.5, color: "var(--text-muted)" }}>
          <TargetField label="Setup-mål" value={target.target_setup_revenue} suffix="kr" onSave={(n) => saveTarget({ target_setup_revenue: n })} />
          <TargetField label="MRR-mål (tilføjet)" value={target.target_mrr_added} suffix="kr" onSave={(n) => saveTarget({ target_mrr_added: n })} />
          <TargetField label="Outreach/uge" value={target.weekly_outreach_floor} onSave={(n) => saveTarget({ weekly_outreach_floor: n })} />
          <TargetField label="Årligt MRR-mål" value={target.annual_mrr_goal} suffix="kr" onSave={(n) => saveTarget({ annual_mrr_goal: n })} />
        </div>
      </section>

      {/* ============ 2. PIPELINE-VÆRDI (VÆGTET) ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
          <h2 style={H2}>Pipeline-værdi (vægtet)</h2>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{dkk(fin.pipeline.total)}</span>
        </div>

        <div style={{ display: "grid", gap: 9 }}>
          {fin.pipeline.byStage.filter((s) => s.count > 0 || s.value > 0).length === 0 ? (
            <p style={{ fontSize: 13, color: DIM }}>Ingen åbne deals i pipelinen endnu.</p>
          ) : fin.pipeline.byStage.map((s) => {
            const max = Math.max(...fin.pipeline.byStage.map((x) => x.value), 1);
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

        {/* Redigér åbne deals */}
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

      {/* ============ 3. INDTJENING ============ */}
      <section className="cc-card cc-card-pad" style={CARD}>
        <h2 style={H2}>Indtjening</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <StatTile label="Denne uge" value={dkk(fin.revenue.week)} sub="setup + recurring" />
          <StatTile label="Denne måned" value={dkk(fin.revenue.month)} sub="setup + recurring" />
          <StatTile label="I år" value={dkk(fin.revenue.year)} sub="setup + recurring" />
        </div>
        <div>
          <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>Booket setup pr. måned</span>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${fin.booked.length}, 1fr)`, alignItems: "end", gap: 8, height: 96, marginTop: 10 }}>
            {(() => {
              const max = Math.max(...fin.booked.map((b) => b.value), 1);
              return fin.booked.map((b) => (
                <div key={b.key} style={{ display: "grid", justifyItems: "center", gap: 5, height: "100%", gridTemplateRows: "1fr auto auto" }}>
                  <div style={{ alignSelf: "end", width: "100%", maxWidth: 34, height: `${Math.max((b.value / max) * 100, b.value > 0 ? 6 : 0)}%`, background: b.value > 0 ? "var(--accent)" : "var(--bg-3)", borderRadius: "5px 5px 0 0", transition: "height 400ms cubic-bezier(0.22,1,0.36,1)" }} title={dkk(b.value)} />
                  <span style={{ fontSize: 10.5, color: DIM }}>{b.value > 0 ? Math.round(b.value / 1000) + "k" : "–"}</span>
                  <span style={{ fontSize: 10.5, color: DIM }}>{b.label}</span>
                </div>
              ));
            })()}
          </div>
        </div>
      </section>
    </div>
  );
}

// ---- sub-components --------------------------------------------------------

function ProgressWithMarker({ pct, markerPct }: { pct: number; markerPct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const marker = Math.min(Math.max(markerPct, 0), 100);
  return (
    <div style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--bg-3)", overflow: "visible" }}>
      <div style={{ width: `${clamped}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
      <div title="Hvor du bør være i dag" style={{ position: "absolute", top: -3, left: `${marker}%`, width: 2, height: 16, background: "var(--text)", borderRadius: 2, transform: "translateX(-1px)" }} />
    </div>
  );
}

function TargetField({ label, value, suffix, onSave }: { label: string; value: number; suffix?: string; onSave: (n: number) => Promise<void> }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{label}</span>
      <InlineNumber value={value} suffix={suffix} ariaLabel={label} onSave={onSave} />
    </span>
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
