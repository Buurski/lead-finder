import { test } from "node:test";
import assert from "node:assert/strict";
import { BANK_START, activeExpenses, bankExpenseError, charlieBalance, knownRefs, looksLikeManualDuplicate, lucasOsProjection, parseExpense, ExpenseError, type Expense, type LedgerPayment } from "./expenses.ts";

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
  assert.throws(() => parseExpense({ date: "2026-07-26", vendor: "V", amount: 1 }, "manual"), ExpenseError); // afregnet
  assert.throws(() => parseExpense({ date: "2026-08-01", vendor: "V", amount: 1, payer: "hack" }, "hermes"), ExpenseError);
  assert.throws(() => parseExpense({ date: "2026-08-01", vendor: "V", amount: 1, share: "hack" }, "hermes"), ExpenseError);
  const x = parseExpense({ date: "2026-08-01", vendor: "Vercel", amount: "220.734", payer: " Charlie " }, "hermes");
  assert.equal(x.amount, 220.73);
  assert.equal(x.share, "selskab");
  assert.equal(x.payer, "charlie");
  assert.equal(x.source, "hermes");
});

test("samme ref to gange tælles kun én gang; slettet ref forbliver kendt", () => {
  const a = { ...e("2026-08-01", 100), id: "a", ref: "m1" };
  const b = { ...e("2026-08-01", 100), id: "b", ref: "m1" }; // samtidig dobbelt-append
  assert.equal(activeExpenses([a, b]).length, 1);
  assert.ok(knownRefs([a, { id: "a", deleted: true }]).has("m1"));
});

test("manuel post ±3 dage og <1 kr fanges som mulig dublet", () => {
  const manual = e("2026-09-03", 222);
  assert.ok(looksLikeManualDuplicate({ ...e("2026-09-05", 221.5), ref: "m" }, [manual]));
  assert.ok(!looksLikeManualDuplicate({ ...e("2026-09-10", 222), ref: "m" }, [manual]));
  assert.ok(!looksLikeManualDuplicate({ ...e("2026-09-03", 222), ref: "m" }, [{ ...manual, ref: "x" }]));
});

test("dubletmistanke kræver samme leverandør, betaler og fordeling; bankpost fanges mod mail-post ±5 %", () => {
  const netto = { ...e("2026-10-02", 100), vendor: "Netto" };
  const vercelBank = { ...e("2026-10-02", 100), vendor: "Vercel", ref: "bank:abc", source: "bank" as const };
  assert.ok(!looksLikeManualDuplicate(vercelBank, [netto]), "manuel Netto blokerer ikke Vercel");
  assert.ok(!looksLikeManualDuplicate(vercelBank, [{ ...netto, vendor: "Vercel", payer: "charlie" }]), "anden betaler");
  const mail = { ...e("2026-10-01", 345), vendor: "Vercel Inc.", ref: "Vercel:inv-1", source: "hermes" as const };
  assert.ok(looksLikeManualDuplicate({ ...vercelBank, amount: 331.19 }, [mail]), "mail-post samme regning");
  assert.ok(!looksLikeManualDuplicate({ ...vercelBank, amount: 200 }, [mail]), "andet beløb");
  assert.ok(!looksLikeManualDuplicate({ ...vercelBank, amount: 331.19, source: "hermes", ref: "Vercel:inv-2" }, [mail]), "mail mod mail = ref-dedupe");
  assert.ok(!looksLikeManualDuplicate({ ...vercelBank, amount: 331.19 }, [{ ...mail, ref: "bank:old" }]), "bank mod bank = ref-dedupe");
  assert.ok(looksLikeManualDuplicate({ ...mail, ref: "Vercel:inv-9" }, [{ ...vercelBank, amount: 331.19 }]), "mail efter bank (Sol 9/10)");
});

test("Lucas OS-projektion: kun aktive, øre uden float-fejl, ingen note/ref, tombstone beholder ref i knownRefs", () => {
  const all: unknown[] = [
    { ...e("2026-09-02", 50.1), id: "a", ref: "<msg-1@vercel.com>", note: "Kunde: Ikast Autoservice", vendor: "Vercel" },
    { ...e("2026-09-03", 0.3, "charlie", "lucas"), id: "b" },
    { ...e("2026-09-04", 99), id: "c", ref: "<msg-2@x>" },
    { id: "c", deleted: true },
  ];
  const p = lucasOsProjection(all);
  assert.equal(p.count, 2);
  assert.deepEqual(p.expenses.map((x) => [x.id, x.amountOre, x.share, x.payer]), [["a", 5010, "selskab", "lucas"], ["b", 30, "charlie", "lucas"]]);
  const json = JSON.stringify(p);
  assert.ok(!json.includes("Ikast") && !json.includes("msg-1") && !json.includes("note"), json);
  assert.match(p.expenses[0].refHash!, /^[0-9a-f]{32}$/);
  assert.equal(p.expenses[1].refHash, null);
  assert.match(p.checksum, /^[0-9a-f]{64}$/);
  assert.equal(lucasOsProjection([...all].reverse()).checksum, p.checksum, "checksum uafhængig af rækkefølge");
  assert.ok(knownRefs(all).has("<msg-2@x>"), "slettet post (tombstone uden ref) beholder sin ref → genimporteres ikke");
});

test("bank-nøglen: kun ref bank:…, fælles + Lucas betaler, fra BANK_START", () => {
  const b = (o: Partial<Expense>): Expense => ({ ...e(BANK_START, 100), ref: "bank:abc", ...o });
  assert.equal(bankExpenseError(b({})), null);
  assert.equal(bankExpenseError(b({ ref: "bank:abc#12", date: "2026-10-30" })), null);
  assert.match(bankExpenseError(b({ ref: undefined })) ?? "", /ref bank/);
  assert.match(bankExpenseError(b({ ref: "Vercel:123" })) ?? "", /ref bank/);
  assert.match(bankExpenseError(b({ share: "charlie" })) ?? "", /fælles/);
  assert.match(bankExpenseError(b({ share: "lucas" })) ?? "", /fælles/);
  assert.match(bankExpenseError(b({ payer: "charlie" })) ?? "", /fælles/);
  assert.match(bankExpenseError(b({ date: "2026-09-26" })) ?? "", /afregnet/);
});
