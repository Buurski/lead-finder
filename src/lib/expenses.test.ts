import { test } from "node:test";
import assert from "node:assert/strict";
import { activeExpenses, charlieBalance, parseExpense, ExpenseError, type Expense, type LedgerPayment } from "./expenses.ts";

const e = (date: string, amount: number, share: Expense["share"] = "selskab", payer: Expense["payer"] = "lucas"): Expense =>
  ({ id: `${date}-${amount}`, date, vendor: "x", amount, share, payer, source: "manual" });

test("afregning 26/9: kvitteringer siden 26/7 minus ChatGPT sep minus 880 = ~0", () => {
  const exp = [
    e("2026-08-01", 137.29), e("2026-08-03", 345), e("2026-08-10", 51.32), e("2026-08-13", 163.48),
    e("2026-08-31", 76.02), e("2026-09-03", 220.73), e("2026-09-25", 200), e("2026-09-26", 746),
    e("2026-09-01", 179, "selskab", "charlie"), // ChatGPT — Charlie lagde ud
    e("2026-07-10", 999), // før LEDGER_START — allerede afregnet
  ];
  const pay: LedgerPayment[] = [
    { id: "a", date: "2026-07-26", amount: 726, from: "charlie" }, // selve start-overførslen tæller ikke
    { id: "b", date: "2026-09-26", amount: 880, from: "charlie" },
  ];
  const b = charlieBalance(exp, pay);
  assert.equal(b.expensesShare, 880.42);
  assert.equal(b.paid, 880);
  assert.equal(b.owed, 0.42);
});

test("egne poster: Lucas betaler Charlies ting = fuld gæld; Charlie betaler Lucas' = fuld modregning", () => {
  const b = charlieBalance([e("2026-08-01", 100, "charlie", "lucas"), e("2026-08-02", 30, "lucas", "charlie"), e("2026-08-03", 50, "lucas", "lucas")], []);
  assert.equal(b.owed, 70);
});

test("tombstone fjerner posten", () => {
  const all = [e("2026-08-01", 100), { ...e("2026-08-01", 100), deleted: true as const }, e("2026-08-02", 40)];
  assert.equal(activeExpenses(all).length, 1);
});

test("parseExpense afviser skrald og runder til øre", () => {
  assert.throws(() => parseExpense({ date: "1/8", vendor: "V", amount: 1 }, "manual"), ExpenseError);
  assert.throws(() => parseExpense({ date: "2026-08-01", vendor: " ", amount: 1 }, "manual"), ExpenseError);
  assert.throws(() => parseExpense({ date: "2026-08-01", vendor: "V", amount: -5 }, "manual"), ExpenseError);
  const x = parseExpense({ date: "2026-08-01", vendor: "Vercel", amount: "220.734", share: "hack", payer: "hack" }, "hermes");
  assert.equal(x.amount, 220.73);
  assert.equal(x.share, "selskab");
  assert.equal(x.payer, "lucas");
  assert.equal(x.source, "hermes");
});
