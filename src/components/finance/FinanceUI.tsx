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
