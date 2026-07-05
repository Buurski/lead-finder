"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import type { Client, Target } from "@/lib/sheets";
import { computeFinance, suggestTarget, dkk, type PaceStatus } from "@/lib/finance";
import { CARD, H2, DIM, StatTile } from "@/components/finance/FinanceUI";

// ---- shared bits ----------------------------------------------------------

const PACE_BADGE: Record<PaceStatus, { label: string; bg: string; color: string }> = {
  "on-pace": { label: "På sporet", bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  "slightly-behind": { label: "Lidt bagud", bg: "var(--amber-dim)", color: "oklch(45% 0.12 70)" },
  "behind": { label: "Bagud", bg: "var(--red-dim)", color: "var(--red)" },
};

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

// ---- main -----------------------------------------------------------------

export default function OkonomiClient({
  clients, target: targetProp, targetIsDefault, nowISO,
}: {
  clients: Client[]; target: Target; targetIsDefault: boolean; nowISO: string;
}) {
  const router = useRouter();
  const now = useMemo(() => new Date(nowISO), [nowISO]);

  const [target, setTarget] = useState<Target>(targetProp);
  const [growth, setGrowth] = useState(1.15);

  // Reconcile local state when fresh server props arrive after a router.refresh()
  // (React-recommended render-phase sync — not an effect).
  const [seed, setSeed] = useState(targetProp);
  if (seed !== targetProp) {
    setSeed(targetProp);
    setTarget(targetProp);
  }

  const fin = useMemo(() => computeFinance(clients, target, now, growth), [clients, target, now, growth]);
  const suggestion = useMemo(() => suggestTarget(clients, now, growth), [clients, now, growth]);

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

  const paceBadge = PACE_BADGE[fin.pace.status];

  return (
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
  );
}
