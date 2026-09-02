import { test } from "node:test";
import assert from "node:assert/strict";
import { hasContact, toLeadgenItem } from "./run.mjs";

test("hasContact — hårdt kontaktfilter (Lucas 2026-08-19)", () => {
  assert.equal(hasContact({ name: "Uden kontakt", phone: "", email: "", emailOnSite: null }), false);
  assert.equal(hasContact({ name: "Kun telefon", phone: "+45 12 34 56 78", email: "", emailOnSite: null }), true);
  assert.equal(hasContact({ name: "Kun mail", phone: "", email: "hej@example.dk" }), true);
  assert.equal(hasContact({ name: "Kun mail på site", phone: "", emailOnSite: "hej@example.dk" }), true);
});

// council-fund 2026-09-02: leadgen.json manglede place_id, hvilket gjorde
// ingest-leadgen sin leadId-dedup svagere (falder tilbage til navn).
test("toLeadgenItem — place_id følger med til leadgen.json", () => {
  const c = { name: "Salon Vida", place_id: "ChIJ123", queryBranch: "skønhed", cat: "salon", city: "Aarhus",
    address: "Vej 1", phone: "+45 12 34 56 78", email: "hej@example.dk", website: "https://vida.dk",
    rating: 4.7, reviews: 120, fitScore: 88, hasViewport: true, bureau: false, copyrightYear: 2025, cph: false };
  const item = toLeadgenItem(c);
  assert.equal(item.place_id, "ChIJ123");
  // gap/site_issues findes ikke i denne pipeline — må ikke opfindes.
  assert.equal("gap" in item, false);
  assert.equal("site_issues" in item, false);
});
