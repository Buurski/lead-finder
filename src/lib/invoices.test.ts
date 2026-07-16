// invoices.test.ts — rene funktioner (ingen store-mock nødvendig).

import test from "node:test";
import assert from "node:assert/strict";
import { invoiceTotal, nextDueDate, addDays, subscriptionsDue, isOverdue } from "./invoices.ts";

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
  const existing = [{ clientName: "VIDA", issueDate: "2026-07-01" } as any];
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
