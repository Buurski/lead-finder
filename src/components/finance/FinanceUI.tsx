// FinanceUI.tsx — small display primitives shared by the Forretning pages
// (Økonomi, Salg, Indsigter). Hook-free and stateless, so it's safe to import
// from both server components (Indsigter) and client components (Økonomi,
// Salg) without a "use client" boundary.

export const CARD: React.CSSProperties = { display: "grid", gap: 16 };
export const H2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-0.02em" };
export const DIM = "var(--text-dim)";

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: "13px 15px", display: "grid", gap: 3 }}>
      <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: DIM }}>{sub}</span>}
    </div>
  );
}

// Uppercase section kicker inside a card (groups related metrics).
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: DIM }}>{children}</div>;
}

// One horizontal bar: label · track+fill · right-aligned value. `frac` is
// 0..1 of the track. Used for pipeline stages, funnel, segments — anywhere a
// labelled magnitude reads better than a number alone. Muted variant (e.g. a
// zero/!weighted bar) uses --bg-3 instead of the green accent.
export function BarRow({
  label, value, frac, sub, muted, labelWidth = 130,
}: {
  label: React.ReactNode; value: string; frac: number; sub?: React.ReactNode; muted?: boolean; labelWidth?: number;
}) {
  const pct = Math.min(Math.max(frac, 0), 1) * 100;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `${labelWidth}px 1fr auto`, alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>{label}{sub != null && <span style={{ color: DIM }}> {sub}</span>}</span>
      <div style={{ height: 10, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: muted ? "var(--border-strong)" : "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
      </div>
      <span style={{ fontSize: 12.5, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 74, textAlign: "right" }}>{value}</span>
    </div>
  );
}

// Empty-history hint — quiet, never alarming. Charts show this when snapshots
// are too sparse to draw a real trend.
export function BuildingHistory({ what = "historik" }: { what?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "var(--bg-3)", borderRadius: 8, fontSize: 12, color: DIM }}>
      <span aria-hidden>⏳</span> Bygger {what} — grafen fyldes efterhånden som de daglige snapshots samler sig.
    </div>
  );
}

// ---- deltas / KPI ---------------------------------------------------------

export interface DeltaLike { abs: number; pct: number | null; }

// ▲/▼ change badge. `goodIsUp=false` flips the colour semantics (e.g. churn:
// a decrease is good). Neutral grey at zero. pct shown when available, else abs.
export function DeltaBadge({ delta, goodIsUp = true, format }: { delta: DeltaLike; goodIsUp?: boolean; format?: (n: number) => string }) {
  const up = delta.abs > 0, down = delta.abs < 0;
  const good = (up && goodIsUp) || (down && !goodIsUp);
  const color = delta.abs === 0 ? DIM : good ? "var(--accent-ink)" : "var(--red)";
  const arrow = up ? "▲" : down ? "▼" : "→";
  const mag = delta.pct != null ? `${Math.round(Math.abs(delta.pct) * 100)}%` : format ? format(Math.abs(delta.abs)) : String(Math.abs(delta.abs));
  return <span style={{ fontSize: 11.5, fontWeight: 600, color }}>{arrow} {mag}</span>;
}

// KPI tile: big value + optional delta badge + optional sparkline underneath.
export function KpiCard({
  label, value, delta, goodIsUp = true, deltaFormat, spark, sub,
}: {
  label: string; value: string; delta?: DeltaLike; goodIsUp?: boolean;
  deltaFormat?: (n: number) => string; spark?: number[]; sub?: string;
}) {
  return (
    <div style={{ background: "var(--bg-3)", borderRadius: 10, padding: "13px 15px", display: "grid", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{ fontSize: 11.5, color: DIM, fontWeight: 600 }}>{label}</span>
        {delta && <DeltaBadge delta={delta} goodIsUp={goodIsUp} format={deltaFormat} />}
      </div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{value}</span>
      {spark && spark.length >= 2 && <Sparkline values={spark} />}
      {sub && <span style={{ fontSize: 11, color: DIM }}>{sub}</span>}
    </div>
  );
}

// ---- hand-rolled SVG charts (themed to our tokens, no library) ------------

// Tiny inline trend line for a KPI tile.
export function Sparkline({ values, height = 22 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const W = 100, H = height;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / span) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Vertical bar chart. Bars use --bg-3 track feel via the accent fill; zero-value
// months read as faint stubs so gaps are visible without shouting.
export function BarChart({ data, format, height = 120 }: { data: { label: string; value: number }[]; format: (n: number) => string; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, alignItems: "end", gap: 8, height, marginTop: 6 }}>
      {data.map((d) => (
        <div key={d.label} style={{ display: "grid", justifyItems: "center", gap: 5, height: "100%", gridTemplateRows: "1fr auto auto" }}>
          <div title={format(d.value)} style={{ alignSelf: "end", width: "100%", maxWidth: 40, height: `${Math.max((d.value / max) * 100, d.value > 0 ? 5 : 0)}%`, background: d.value > 0 ? "var(--accent)" : "var(--bg-3)", borderRadius: "5px 5px 0 0", transition: "height 400ms cubic-bezier(0.22,1,0.36,1)" }} />
          <span style={{ fontSize: 10.5, color: DIM, fontVariantNumeric: "tabular-nums" }}>{d.value > 0 ? format(d.value) : "–"}</span>
          <span style={{ fontSize: 10.5, color: DIM }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Line chart with dots + a faint baseline. viewBox-scaled so it fills width.
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
  return (
    <div style={{ marginTop: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }} role="img" aria-label="trend">
        <line x1={0} y1={H - pad} x2={W} y2={H - pad} stroke="var(--border)" strokeWidth={0.5} vectorEffect="non-scaling-stroke" />
        <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {xy.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.6} fill="var(--accent)" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${data.length}, 1fr)`, gap: 8, marginTop: 4 }}>
        {data.map((d) => (
          <span key={d.label} style={{ textAlign: "center", fontSize: 10.5, color: DIM }}>
            <span style={{ display: "block", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{d.value > 0 ? format(d.value) : "–"}</span>
            {d.label}
          </span>
        ))}
      </div>
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
