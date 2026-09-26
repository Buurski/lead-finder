// expenses.ts — faktiske udgifter (kvitteringer), ikke skøn.
// Charlies gæld regnes herfra: ½ af fælles poster Lucas har lagt ud, minus ½ af
// fælles poster Charlie har lagt ud, minus hans overførsler. Alt før LEDGER_START
// er afregnet (overførslen 26/7, 726 kr). Append-only KV-log; sletning = tombstone.

export const EXPENSES_KEY = "okonomi_expenses";
export const LEDGER_START = "2026-07-26"; // poster/overførsler SKAL være efter denne dato

export type ExpenseShare = "selskab" | "lucas" | "charlie";
export type Person = "lucas" | "charlie";

export interface Expense {
  id: string;
  date: string; // YYYY-MM-DD (trækdato)
  vendor: string;
  amount: number; // DKK
  original?: string; // fx "50 USD"
  share: ExpenseShare;
  payer: Person;
  ref?: string; // mail message-id — dedupe-nøgle
  source: "manual" | "hermes";
  note?: string;
  deleted?: true;
}

export interface LedgerPayment {
  id: string;
  date: string;
  amount: number;
  from: Person;
  note?: string;
}

export class ExpenseError extends Error {}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function newExpenseId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Validerer indput fra UI/Hermes. Kaster ExpenseError med dansk besked. */
export function parseExpense(input: unknown, source: Expense["source"]): Expense {
  const b = (input ?? {}) as Record<string, unknown>;
  const date = typeof b.date === "string" && ISO.test(b.date) ? b.date : "";
  if (!date) throw new ExpenseError("dato skal være YYYY-MM-DD");
  if (date <= LEDGER_START) throw new ExpenseError(`dato skal være efter ${LEDGER_START} (alt før er afregnet)`);
  const vendor = typeof b.vendor === "string" ? b.vendor.trim().slice(0, 80) : "";
  if (!vendor) throw new ExpenseError("leverandør mangler");
  const amount = Math.round(Number(b.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 50_000) throw new ExpenseError("beløb skal være 0–50.000 kr");
  // Ukendte værdier afvises — et stille fallback ville vende fortegnet på hele beløbet.
  const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);
  const shareIn = norm(b.share) ?? "selskab";
  const payerIn = norm(b.payer) ?? "lucas";
  if (shareIn !== "selskab" && shareIn !== "lucas" && shareIn !== "charlie") throw new ExpenseError("share skal være selskab/lucas/charlie");
  if (payerIn !== "lucas" && payerIn !== "charlie") throw new ExpenseError("payer skal være lucas/charlie");
  const share = shareIn as ExpenseShare;
  const payer = payerIn as Person;
  const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  return { id: newExpenseId(), date, vendor, amount, original: str(b.original, 40), share, payer, ref: str(b.ref, 120), source, note: str(b.note, 200) };
}

/** Fjerner tombstones og dubletter på ref (første vinder — værn mod samtidige append). */
export function activeExpenses(all: unknown[]): Expense[] {
  const list = all as Expense[];
  const deleted = new Set(list.filter((e) => e.deleted).map((e) => e.id));
  const refs = new Set<string>();
  return list.filter((e) => {
    if (e.deleted || deleted.has(e.id) || !(e.amount > 0)) return false;
    if (e.ref) { if (refs.has(e.ref)) return false; refs.add(e.ref); }
    return true;
  });
}

/** Alle refs der nogensinde er set — også slettede, så en slettet kvittering ikke genimporteres. */
export function knownRefs(all: unknown[]): Set<string> {
  return new Set((all as Expense[]).filter((e) => !e.deleted && e.ref).map((e) => e.ref!));
}

/** Samme træk indtastet i hånden (uden ref)? ±3 dage og under 1 kr forskel. */
export function looksLikeManualDuplicate(e: Expense, existing: Expense[]): boolean {
  const day = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
  return existing.some((x) => !x.ref && Math.abs(x.amount - e.amount) < 1 && Math.abs(day(x.date) - day(e.date)) <= 3);
}

/** Hvad en post flytter Charlies gæld med (+ = han skylder mere). */
export function charlieDelta(e: Expense): number {
  if (e.share === "selskab") return e.payer === "lucas" ? e.amount / 2 : -e.amount / 2;
  if (e.share === "charlie" && e.payer === "lucas") return e.amount;
  if (e.share === "lucas" && e.payer === "charlie") return -e.amount;
  return 0;
}

export interface Balance {
  /** hvad Charlie skylder Lucas nu (negativ = Lucas skylder Charlie) */
  owed: number;
  expensesShare: number; // sum af charlieDelta
  paid: number; // Charlies overførsler minus Lucas' overførsler til Charlie
}

export function charlieBalance(expenses: Expense[], payments: LedgerPayment[], start = LEDGER_START): Balance {
  const expensesShare = expenses.filter((e) => e.date > start).reduce((s, e) => s + charlieDelta(e), 0);
  const paid = payments
    .filter((p) => p.date > start && p.amount > 0)
    .reduce((s, p) => s + (p.from === "charlie" ? p.amount : -p.amount), 0);
  const round = (n: number) => Math.round(n * 100) / 100;
  return { owed: round(expensesShare - paid), expensesShare: round(expensesShare), paid: round(paid) };
}

export const PAYMENTS_KEY = "okonomi_payments"; // ejes af /api/udgifter/payments

/** Aktive overførsler (payments-loggen bruger note "__deleted__" som tombstone). */
export function activePayments(all: unknown[]): LedgerPayment[] {
  const list = all as LedgerPayment[];
  const deleted = new Set(list.filter((p) => p.note === "__deleted__").map((p) => p.id));
  return list.filter((p) => p.amount > 0 && !deleted.has(p.id));
}
