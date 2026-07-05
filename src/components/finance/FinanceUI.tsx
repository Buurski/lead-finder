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
