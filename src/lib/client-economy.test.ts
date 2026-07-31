import test from "node:test";
import assert from "node:assert/strict";
import { clientEconomy, type Invoice, type Subscription } from "./invoices.ts";

const TODAY = "2026-07-31";
const inv = (over: Partial<Invoice>): Invoice => ({
  number: "001", clientName: "KT VVS", recipient: { name: "KT VVS" },
  issueDate: "2026-07-01", dueDate: "2026-07-15", lines: [], vatRate: 0,
  status: "sendt", payerType: "cvr", ...over,
});
const sub = (over: Partial<Subscription> = {}): Subscription => ({
  clientName: "KT VVS", lines: [], dayOfMonth: 1, active: true, ...over,
});

test("forfalden slår alt andet", () => {
  const e = clientEconomy([inv({ status: "kladde", number: "002" }), inv({ status: "forfalden" })], sub(), TODAY);
  assert.equal(e.tone, "red");
  assert.match(e.text, /001/);
});

test("sendt faktura hvis forfaldsdato er passeret tælles som forfalden", () => {
  const e = clientEconomy([inv({ status: "sendt", dueDate: "2026-07-15" })], undefined, TODAY);
  assert.equal(e.tone, "red");
});

test("sendt og ikke forfalden er neutral med dansk dato", () => {
  const e = clientEconomy([inv({ status: "sendt", dueDate: "2026-08-14" })], undefined, TODAY);
  assert.equal(e.tone, "neutral");
  assert.match(e.text, /14\. august/);
});

test("kladde er gul — den er ikke sendt endnu", () => {
  const e = clientEconomy([inv({ status: "kladde" })], undefined, TODAY);
  assert.equal(e.tone, "amber");
  assert.match(e.text, /ikke sendt/);
});

test("betalte fakturaer tæller ikke med", () => {
  const e = clientEconomy([inv({ status: "betalt", dueDate: "2026-01-01" })], sub(), TODAY);
  assert.equal(e.tone, "green");
  assert.match(e.text, /næste faktura d\. 1\./);
});

test("hverken faktura eller abonnement siges højt, ikke som 0 kr", () => {
  const e = clientEconomy([], undefined, TODAY);
  assert.match(e.text, /Ingen faktura eller abonnement/);
  assert.doesNotMatch(e.text, /0 kr/);
});

test("pauset abonnement er ikke det samme som intet abonnement", () => {
  const e = clientEconomy([], sub({ active: false }), TODAY);
  assert.equal(e.tone, "amber");
  assert.match(e.text, /pause/);
});
