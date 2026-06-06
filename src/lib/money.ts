// money.ts — pure DKK input normalization for manual fee entry.
//
// Distinguishes three cases so a typo can't silently wipe a client's revenue:
//   • empty / whitespace-only input  → ""   (intentional clear — allowed)
//   • a parseable amount             → the rounded integer as a string
//   • non-empty but unparseable      → null (caller should reject, not blank it)
//
// Accepts Danish formatting: "5.000" (thousands dot), "1.234,56" (comma decimal),
// and stray "kr"/spaces. Mirrors deck.ts's revenue parser, but keeps the
// empty-vs-garbage distinction the write path needs.
export function normalizeFeeInput(v: unknown): string | null {
  const raw = String(v ?? "").trim();
  if (raw === "") return ""; // intentional clear
  const n = parseFloat(
    raw.replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")
  );
  if (!Number.isFinite(n)) return null; // unparseable — caller rejects
  return String(Math.round(n));
}
