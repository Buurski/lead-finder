// FinanceUI.tsx — presentational primitives shared by the Forretning pages
// (Økonomi, Salg, Indsigter). Hook-free and stateless, so it's safe to import
// from both server components and client components without a "use client"
// boundary. Tooltips are CSS-only (.cc-tip) and charts are hand-rolled SVG/divs
// themed strictly to the app tokens — no chart library.
//
// Hierarchy system (the fix for "every number in an identical beige tile"):
//   HeroMetric   — THE number of a section: big Fraunces numeral, delta chip,
//                  optional area sparkline. One or two per page, never more.
//   StatTile     — standard supporting stat (also `compact` for tertiary).
//   NumbersStrip — hairline-divided row for grouped secondary stats (the calm
//                  alternative to a grid of equal tiles; echoes .cc-numbers).
//   KpiCard      — delta card for Indsigter's comparison row.

import { STAGE_LABELS_DA } from "@/lib/finance";

export const CARD: React.CSSProperties = { display: "grid", gap: 16 };
export const H2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" };
export const DIM = "var(--text-dim)";

// One tone system for every pill/badge on the finance pages.
export type PillTone = "neutral" | "green" | "amber" | "red" | "blue";
const PILL_STYLE: Record<PillTone, { bg: string; color: string }> = {
  neutral: { bg: "var(--bg-3)", color: "var(--text-muted)" },
  green: { bg: "var(--accent-soft)", color: "var(--accent-ink)" },
  amber: { bg: "var(--amber-dim)", color: "oklch(45% 0.12 70)" },
  red: { bg: "var(--red-dim)", color: "var(--red)" },
  blue: { bg: "var(--blue-dim)", color: "var(--blue)" },
};

export function Pill({ tone = "neutral", title, children }: { tone?: PillTone; title?: string; children: React.ReactNode }) {
  const s = PILL_STYLE[tone];
  return (
    <span title={title} style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 21, padding: "0 9px", borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", background: s.bg, color: s.color }}>
      {children}
    </span>
  );
}

// Semantic stage pill — one mapping for the whole suite.
const STAGE_TONE: Record<string, PillTone> = {
  lead: "neutral", contacted: "neutral", engaged: "neutral", concept: "neutral",
  offer: "blue", negotiation: "amber",
  won: "green", delivering: "green", live: "green",
  lost: "red",
};
export function StagePill({ stage }: { stage: string }) {
  return <Pill tone={STAGE_TONE[stage] ?? "neutral"}>{STAGE_LABELS_DA[stage] ?? stage}</Pill>;
}

// ---- deltas ----------------------------------------------------------------

export interface DeltaLike { abs: number; pct: number | null; }

// ▲/▼ change pill. `goodIsUp=false` flips semantics (churn: down is good).
// `basis` adds the comparison caption ("vs. forrige måned") after the pill.
export function DeltaChip({ delta, goodIsUp = true, format, basis }: { delta: DeltaLike; goodIsUp?: boolean; format?: (n: number) => string; basis?: string }) {
  const up = delta.abs > 0, down = delta.abs < 0;
  const good = (up && goodIsUp) || (down && !goodIsUp);
  const tone: PillTone = delta.abs === 0 ? "neutral" : good ? "green" : "red";
  const arrow = up ? "▲" : down ? "▼" : "→";
  const mag = delta.pct != null ? `${Math.round(Math.abs(delta.pct) * 100)}%` : format ? format(Math.abs(delta.abs)) : String(Math.abs(delta.abs));
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
      <Pill tone={tone}><span aria-hidden style={{ fontSize: 9 }}>{arrow}</span> {mag}</Pill>
      {basis && <span style={{ fontSize: 11, color: DIM }}>{basis}</span>}
    </span>
  );
}

// Back-compat alias (older call sites) — same look, new plumbing.
export function DeltaBadge({ delta, goodIsUp = true, format }: { delta: DeltaLike; goodIsUp?: boolean; format?: (n: number) => string }) {
  return <DeltaChip delta={delta} goodIsUp={goodIsUp} format={format} />;
}

// ---- metric cards -----------------------------------------------------------

// THE number of a section. Large Fraunces numeral (the .cc-stat-n scale, one
// step up), delta chip with basis, optional area sparkline underneath.
export function HeroMetric({
  kicker, value, delta, goodIsUp = true, deltaFormat, basis, spark, sub,
}: {
  kicker: string; value: string; delta?: DeltaLike; goodIsUp?: boolean;
  deltaFormat?: (n: number) => string; basis?: string; spark?: number[]; sub?: string;
}) {
  return (
    <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
      <span className="cc-kicker">{kicker}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums lining-nums" }}>
          {value}
        </span>
        {delta && <DeltaChip delta={delta} goodIsUp={goodIsUp} format={deltaFormat} basis={basis} />}
      </div>
      {spark && spark.length >= 2 && <Sparkline values={spark} height={34} />}
      {sub && <span style={{ fontSize: 11.5, color: DIM }}>{sub}</span>}
    </div>
  );
}

// Standard supporting stat. `compact` shrinks it for tertiary detail.
export function StatTile({ label, value, sub, compact }: { label: string; value: string; sub?: string; compact?: boolean }) {
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: compact ? "10px 13px" : "13px 15px", display: "grid", gap: 3, alignContent: "start", transition: "background 150ms ease" }}>
      <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: compact ? 16 : 21, fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums" }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: DIM }}>{sub}</span>}
    </div>
  );
}

// Hairline-divided strip for grouped secondary stats — the calm alternative to
// N equal tiles. Same visual idea as Mission Control's .cc-numbers.
export interface StripItem { label: string; value: string; sub?: string; delta?: DeltaLike; goodIsUp?: boolean; }
export function NumbersStrip({ items }: { items: StripItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`, gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
      {items.map((it) => (
        <div key={it.label} style={{ background: "var(--surface)", padding: "12px 16px", display: "grid", gap: 3, alignContent: "start" }}>
          <span style={{ fontSize: 11, color: DIM, fontWeight: 600 }}>{it.label}</span>
          <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, fontVariantNumeric: "tabular-nums lining-nums" }}>{it.value}</span>
          {it.delta ? <DeltaChip delta={it.delta} goodIsUp={it.goodIsUp} /> : it.sub ? <span style={{ fontSize: 10.5, color: DIM }}>{it.sub}</span> : null}
        </div>
      ))}
    </div>
  );
}

// KPI delta card for the Indsigter comparison row. `primary` = the top rank
// (bigger numeral, room for a sparkline); default = compact secondary.
export function KpiCard({
  label, value, delta, goodIsUp = true, deltaFormat, spark, sub, primary,
}: {
  label: string; value: string; delta?: DeltaLike; goodIsUp?: boolean;
  deltaFormat?: (n: number) => string; spark?: number[]; sub?: string; primary?: boolean;
}) {
  return (
    <div style={{ background: primary ? "var(--surface)" : "var(--bg-3)", border: primary ? "1px solid var(--border)" : "1px solid transparent", boxShadow: primary ? "var(--shadow-card)" : "none", borderRadius: 12, padding: primary ? "15px 17px" : "11px 14px", display: "grid", gap: 5, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
        {delta && <DeltaChip delta={delta} goodIsUp={goodIsUp} format={deltaFormat} />}
      </div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: primary ? 27 : 18, fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums lining-nums" }}>{value}</span>
      {spark && spark.length >= 2 && <Sparkline values={spark} height={26} />}
      {sub && <span style={{ fontSize: 11, color: DIM }}>{sub}</span>}
    </div>
  );
}

// ---- layout helpers ---------------------------------------------------------

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DIM }}>{children}</div>;
}

// One horizontal bar: label · track+fill · right-aligned value. Now with a
// CSS tooltip and grow-in.
export function BarRow({
  label, value, frac, sub, muted, labelWidth = 130, tip,
}: {
  label: React.ReactNode; value: string; frac: number; sub?: React.ReactNode; muted?: boolean; labelWidth?: number; tip?: string;
}) {
  const pct = Math.min(Math.max(frac, 0), 1) * 100;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${labelWidth}px 1fr auto`, alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}{sub != null && <span style={{ color: DIM }}> {sub}</span>}</span>
      <div className={tip ? "cc-tip" : undefined} data-tip={tip} style={{ height: 10, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
        <div className="cc-grow-x" style={{ width: `${pct}%`, height: "100%", background: muted ? "var(--border-strong)" : "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums lining-nums", minWidth: 74, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Coverage/ratio gauge with a target tick. Values render against `cap` (default
// 2×) so "well covered" doesn't blow out the scale. `value === null` = target
// already met — a designed positive state, not an empty one.
export function Meter({ value, label, cap = 2, tickAt = 1, sub }: { value: number | null; label: string; cap?: number; tickAt?: number; sub?: string }) {
  const met = value == null;
  const frac = met ? 1 : Math.min(value / cap, 1);
  const tickPct = (tickAt / cap) * 100;
  const short = !met && value < tickAt;
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: "13px 15px", display: "grid", gap: 8, alignContent: "start" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, color: met ? "var(--accent-ink)" : short ? "oklch(45% 0.12 70)" : "var(--accent-ink)" }}>
          {met ? "mål nået ✓" : `${value.toFixed(1)}×`}
        </span>
      </div>
      <div style={{ position: "relative", height: 10, borderRadius: 999, background: "var(--surface)", border: "1px solid var(--border)", overflow: "visible" }}>
        <div className="cc-grow-x" style={{ width: `${frac * 100}%`, height: "100%", borderRadius: 999, background: met ? "var(--accent)" : short ? "var(--amber)" : "var(--accent)" }} />
        {!met && (
          <div className="cc-tip" data-tip={`${tickAt}× = dækket`} style={{ position: "absolute", top: -4, bottom: -4, left: `${tickPct}%`, width: 2, background: "var(--text)", borderRadius: 2, transform: "translateX(-1px)" }} />
        )}
      </div>
      <span style={{ fontSize: 10.5, color: DIM }}>{met ? "kvartalets mål er allerede dækket" : sub ?? `${tickAt}×-mærket = resten af målet dækket`}</span>
    </div>
  );
}

// ---- charts (hand-rolled, token-themed) --------------------------------------

// Tiny inline area trend for hero/KPI tiles — matches Mission Control's
// area-fill chart voice.
export function Sparkline({ values, height = 22 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const W = 100, H = height;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const xy = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / span) * (H - 6) - 3,
  }));
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${line.replace(/ /g, " L ")} L ${W},${H} L 0,${H} Z`;
  const last = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden>
      <path d={area} fill="var(--accent)" fillOpacity={0.14} />
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last.x} cy={last.y} r={2.2} fill="var(--accent-ink)" stroke="var(--surface)" strokeWidth={1} />
    </svg>
  );
}

// Vertical bar chart: light gridlines, rounded tops, draw-in, CSS tooltip with
// the exact value. Zero months read as faint stubs, not holes.
export function BarChart({ data, format, tipFormat, height = 120 }: { data: { label: string; value: number }[]; format: (n: number) => string; tipFormat?: (n: number) => string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ position: "relative", height }}>
        {/* gridlines */}
        {[0.33, 0.66, 1].map((g) => (
          <div key={g} aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: `${g * 100}%`, height: 1, background: "var(--border)", opacity: 0.6 }} />
        ))}
        <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, alignItems: "end", gap: 8 }}>
          {data.map((d, i) => (
            <div key={d.label} style={{ display: "grid", justifyItems: "center", alignItems: "end", height: "100%" }}>
              <div
                className="cc-tip cc-grow-y"
                data-tip={`${d.label}: ${(tipFormat ?? format)(d.value)}`}
                tabIndex={0}
                style={{ width: "100%", maxWidth: 40, height: `${Math.max((d.value / max) * 100, d.value > 0 ? 5 : 2.5)}%`, background: d.value > 0 ? "var(--accent)" : "var(--bg-3)", borderRadius: "5px 5px 0 0", animationDelay: `${i * 45}ms`, outline: "none" }}
              />
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 8, marginTop: 6 }}>
        {data.map((d) => (
          <span key={d.label} style={{ textAlign: "center", fontSize: 10.5, color: DIM }}>
            <span style={{ display: "block", color: d.value > 0 ? "var(--text-muted)" : DIM, fontVariantNumeric: "tabular-nums lining-nums", fontWeight: d.value > 0 ? 600 : 400 }}>{d.value > 0 ? format(d.value) : "–"}</span>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Line chart with area fill, dots (native <title> tooltips) and a baseline.
export function LineChart({ data, format, height = 120 }: { data: { label: string; value: number }[]; format: (n: number) => string; height?: number }) {
  const W = 100, H = 40, pad = 3;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const span = max - min || 1;
  const xy = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : pad + (i / (data.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((d.value - min) / span) * (H - 2 * pad);
    return { x, y };
  });
  const line = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `M ${line.replace(/ /g, " L ")} L ${W - pad},${H - pad} L ${pad},${H - pad} Z`;
  return (
    <div style={{ marginTop: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} role="img" aria-label="trend">
        <line x1={0} y1={H - pad} x2={W} y2={H - pad} stroke="var(--border)" strokeWidth={0.6} vectorEffect="non-scaling-stroke" />
        <line x1={0} y1={(H - pad) / 2 + pad / 2} x2={W} y2={(H - pad) / 2 + pad / 2} stroke="var(--border)" strokeWidth={0.4} vectorEffect="non-scaling-stroke" opacity={0.6} />
        <path d={area} fill="var(--accent)" fillOpacity={0.12} />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.7} fill="var(--accent-ink)" stroke="var(--surface)" strokeWidth={0.8}>
            <title>{`${data[i].label}: ${format(data[i].value)}`}</title>
          </circle>
        ))}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 8, marginTop: 4 }}>
        {data.map((d) => (
          <span key={d.label} style={{ textAlign: "center", fontSize: 10.5, color: DIM }}>
            <span style={{ display: "block", color: d.value > 0 ? "var(--text-muted)" : DIM, fontVariantNumeric: "tabular-nums lining-nums" }}>{d.value > 0 ? format(d.value) : "–"}</span>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Centered funnel: symmetric bands whose width tracks count, with conversion
// chips between stages. Zero-count stages render as faint slim bands so the
// shape stays legible while the pipeline is thin.
export interface FunnelStepView { label: string; count: number; value: string; rate?: number | null; }
export function Funnel({ steps }: { steps: FunnelStepView[] }) {
  const max = Math.max(...steps.map((s) => s.count), 1);
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {steps.map((s, i) => {
        const frac = s.count > 0 ? Math.max(s.count / max, 0.16) : 0.1;
        // Conversion chip only once there's actual flow: hidden while BOTH
        // adjacent stages are empty, so a fresh pipeline isn't littered with
        // "↓ 0%" noise between blank bands.
        const showRate = i > 0 && (steps[i - 1].count > 0 || s.count > 0);
        return (
          <div key={s.label}>
            {showRate && (
              <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 110px", alignItems: "center" }} aria-hidden>
                <span />
                <span style={{ justifySelf: "center", fontSize: 10, fontWeight: 700, color: DIM, padding: "1px 0" }}>
                  {s.rate == null ? "↓" : `↓ ${Math.round(s.rate * 100)}%`}
                </span>
                <span />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "110px 1fr 110px", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "right" }}>{s.label}</span>
              <div style={{ display: "grid", justifyItems: "center" }}>
                <div
                  className="cc-tip"
                  data-tip={`${s.label}: ${s.count} · ${s.value}`}
                  tabIndex={0}
                  style={{ width: `${frac * 100}%`, height: 26, borderRadius: 7, background: s.count > 0 ? "var(--accent)" : "var(--bg-3)", opacity: s.count > 0 ? 0.35 + 0.65 * (i / Math.max(steps.length - 1, 1)) : 1, display: "grid", placeItems: "center", transition: "width 400ms cubic-bezier(0.22,1,0.36,1)", outline: "none" }}
                >
                  {s.count > 0 && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#fff" }}>{s.count}</span>}
                </div>
              </div>
              <span style={{ fontSize: 11.5, color: DIM, fontVariantNumeric: "tabular-nums lining-nums" }}>{s.value}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- empty / fallback states --------------------------------------------------

// Designed chart empty state: a faint deterministic "ghost" of the eventual
// chart + a forward-looking one-liner. Deliberately quiet — a promise, not an
// apology. Heights are fixed (no randomness → no hydration mismatch).
const GHOST_HEIGHTS = [38, 62, 30, 78, 52, 68];
export function GhostChart({ note, height = 96 }: { note: string; height?: number }) {
  return (
    <div>
      <div aria-hidden style={{ display: "grid", gridTemplateColumns: `repeat(${GHOST_HEIGHTS.length}, 1fr)`, alignItems: "end", gap: 8, height, opacity: 0.55 }}>
        {GHOST_HEIGHTS.map((h, i) => (
          <div key={i} style={{ height: `${h}%`, maxWidth: 40, width: "100%", justifySelf: "center", borderRadius: "5px 5px 0 0", background: "var(--bg-3)", border: "1px dashed var(--border-strong)", borderBottom: "none" }} />
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12, color: DIM }}>
        <span aria-hidden>⏳</span> {note}
      </div>
    </div>
  );
}

// Quiet inline history hint (non-chart contexts).
export function BuildingHistory({ what = "historik" }: { what?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--bg-3)", borderRadius: 8, fontSize: 12, color: DIM }}>
      <span aria-hidden>⏳</span> Bygger {what} — grafen fyldes efterhånden som de daglige snapshots samler sig.
    </div>
  );
}

export function SheetsFallback() {
  return (
    <div className="cc-card cc-card-pad" role="status" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}>
      <span style={{ fontSize: 16 }} aria-hidden>⚠️</span>
      <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
        Kunne ikke hente klient-data lige nu. Tallene her er afledt af Sheets — genindlæs om et øjeblik.
      </span>
    </div>
  );
}
