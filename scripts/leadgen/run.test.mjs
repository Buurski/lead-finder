import { test } from "node:test";
import assert from "node:assert/strict";
import { hasContact } from "./run.mjs";

test("hasContact — hårdt kontaktfilter (Lucas 2026-08-19)", () => {
  assert.equal(hasContact({ name: "Uden kontakt", phone: "", email: "", emailOnSite: null }), false);
  assert.equal(hasContact({ name: "Kun telefon", phone: "+45 12 34 56 78", email: "", emailOnSite: null }), true);
  assert.equal(hasContact({ name: "Kun mail", phone: "", email: "hej@example.dk" }), true);
  assert.equal(hasContact({ name: "Kun mail på site", phone: "", emailOnSite: "hej@example.dk" }), true);
});
