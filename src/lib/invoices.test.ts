// invoices.test.ts — rene funktioner (ingen store-mock nødvendig).

import test from "node:test";
import assert from "node:assert/strict";
import { invoiceTotal, nextDueDate, addDays, subscriptionsDue, isOverdue, buildStatusNote, type Invoice } from "./invoices.ts";

test("invoiceTotal — vatRate 0", () => {
  const r = invoiceTotal({ lines: [{ description: "a", amount: 1000 }, { description: "b", amount: 500 }], vatRate: 0 });
  assert.equal(r.subtotal, 1500);
  assert.equal(r.vat, 0);
  assert.equal(r.total, 1500);
});

test("invoiceTotal — vatRate 25", () => {
  const r = invoiceTotal({ lines: [{ description: "a", amount: 1000 }], vatRate: 0.25 });
  assert.equal(r.subtotal, 1000);
  assert.equal(r.vat, 250);
  assert.equal(r.total, 1250);
});

test("addDays — over månedsgrænse", () => {
  assert.equal(addDays("2026-01-25", 14), "2026-02-08");
});

test("addDays — over årsgrænse", () => {
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
});

test("nextDueDate — dayOfMonth ikke nået endnu i denne måned", () => {
  const sub = { clientName: "x", lines: [], dayOfMonth: 20, active: true };
  assert.equal(nextDueDate(sub, "2026-07-16"), "2026-07-20");
});

test("nextDueDate — dayOfMonth allerede passeret, ruller til næste måned", () => {
  const sub = { clientName: "x", lines: [], dayOfMonth: 10, active: true };
  assert.equal(nextDueDate(sub, "2026-07-16"), "2026-08-10");
});

test("nextDueDate — dayOfMonth i dag rammes samme dag", () => {
  const sub = { clientName: "x", lines: [], dayOfMonth: 16, active: true };
  assert.equal(nextDueDate(sub, "2026-07-16"), "2026-07-16");
});

test("nextDueDate — månedsskift ved årsgrænse", () => {
  const sub = { clientName: "x", lines: [], dayOfMonth: 5, active: true };
  assert.equal(nextDueDate(sub, "2026-12-16"), "2027-01-05");
});

test("subscriptionsDue — due (dayOfMonth passeret, ingen faktura denne måned)", () => {
  const sub = { clientName: "VIDA", lines: [], dayOfMonth: 1, active: true };
  assert.deepEqual(subscriptionsDue([sub], [], "2026-07-16"), [sub]);
});

test("subscriptionsDue — allerede faktureret denne måned", () => {
  const sub = { clientName: "VIDA", lines: [], dayOfMonth: 1, active: true };
  const existing: Invoice[] = [
    {
      number: "001",
      clientName: "VIDA",
      recipient: { name: "VIDA" },
      issueDate: "2026-07-01",
      dueDate: "2026-07-15",
      lines: [],
      vatRate: 0,
      status: "sendt",
      payerType: "privat",
    },
  ];
  assert.deepEqual(subscriptionsDue([sub], existing, "2026-07-16"), []);
});

test("subscriptionsDue — inaktiv abonnement", () => {
  const sub = { clientName: "VIDA", lines: [], dayOfMonth: 1, active: false };
  assert.deepEqual(subscriptionsDue([sub], [], "2026-07-16"), []);
});

test("subscriptionsDue — dayOfMonth i fremtiden", () => {
  const sub = { clientName: "VIDA", lines: [], dayOfMonth: 20, active: true };
  assert.deepEqual(subscriptionsDue([sub], [], "2026-07-16"), []);
});

test("isOverdue — sendt + dueDate passeret", () => {
  assert.equal(isOverdue({ status: "sendt", dueDate: "2026-07-01" }, "2026-07-16"), true);
});

test("isOverdue — sendt men ikke passeret endnu", () => {
  assert.equal(isOverdue({ status: "sendt", dueDate: "2026-07-20" }, "2026-07-16"), false);
});

test("isOverdue — betalt uanset dato", () => {
  assert.equal(isOverdue({ status: "betalt", dueDate: "2026-07-01" }, "2026-07-16"), false);
});

// --- buildStatusNote (vault-note til morgen-briefen) ---

const inv = (over: Partial<Invoice>): Invoice => ({
  number: "001", clientName: "VIDA", recipient: { name: "VIDA" },
  issueDate: "2026-07-01", dueDate: "2026-07-15", lines: [{ description: "Hosting", amount: 250 }],
  vatRate: 0, status: "kladde", payerType: "privat", ...over,
});

test("buildStatusNote: forfalden faktura tælles med dage og beløb", () => {
  const note = buildStatusNote([inv({ status: "forfalden", dueDate: "2026-07-10" })], [], "2026-07-17");
  assert.match(note, /## Forfaldne \(1\)/);
  assert.match(note, /7 dage forfalden/);
  assert.match(note, /250 kr/);
});

test("buildStatusNote: kladde og sendt havner i hver sin sektion", () => {
  const note = buildStatusNote(
    [inv({ number: "002", status: "kladde" }), inv({ number: "003", status: "sendt", dueDate: "2026-07-30" })],
    [], "2026-07-17",
  );
  assert.match(note, /## Kladder klar til send \(1\)[\s\S]*\*\*002\*\*/);
  assert.match(note, /## Sendt, venter betaling \(1\)[\s\S]*\*\*003\*\*[\s\S]*om 13 dage/);
});

test("buildStatusNote: betalte fakturaer holdes ude af åbne lister, men tælles for måneden", () => {
  const note = buildStatusNote(
    [inv({ status: "betalt", paidAt: "2026-07-05T10:00:00Z", lines: [{ description: "Setup", amount: 5000 }] })],
    [], "2026-07-17",
  );
  assert.match(note, /## Forfaldne \(0\)/);
  assert.match(note, /## Betalt denne måned\n5\.000 kr/);
});

test("buildStatusNote: aktivt abonnement viser næste fakturadato", () => {
  const subs = [{ clientName: "VIDA", dayOfMonth: 1, active: true, lines: [{ description: "Hosting", amount: 250 }, { description: "CMS", amount: 500 }] }];
  const note = buildStatusNote([], subs, "2026-07-17");
  assert.match(note, /## Abonnementer \(1 aktive\)/);
  assert.match(note, /750 kr\/md · næste faktura \*\*2026-08-01\*\* \(om 15 dage\)/);
});

test("buildStatusNote: inaktivt abonnement udelades", () => {
  const subs = [{ clientName: "Gammel", dayOfMonth: 1, active: false, lines: [{ description: "x", amount: 1 }] }];
  assert.match(buildStatusNote([], subs, "2026-07-17"), /## Abonnementer \(0 aktive\)\n\nIngen\./);
});
