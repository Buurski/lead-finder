import { test } from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURES, LUCAS_ONLY, adaptToSender, mixForLead } from "./tone-mixer.ts";

test("Charlie får aldrig Lucas' salgselev-historie; skift frem og tilbage er tabsfrit", () => {
  for (const line of DISCLOSURES.charlie) assert.equal(LUCAS_ONLY.test(line), false);
  const lead = { name: "Salon Test", branch: "frisør", city: "Herning", reviewsCount: 40, websiteStatus: "none" };
  assert.equal(LUCAS_ONLY.test(mixForLead(lead, "charlie").disclosure), false);
  const lucasBody = `Hej\n\n${DISCLOSURES.lucas[1]}\n\nMvh`;
  const asCharlie = adaptToSender(lucasBody, "charlie");
  assert.equal(LUCAS_ONLY.test(asCharlie), false);
  assert.equal(adaptToSender(asCharlie, "lucas"), lucasBody);
  const wrapped = lucasBody.replace(". Jeg går", ".\nJeg går"); // brudt over to linjer
  assert.equal(LUCAS_ONLY.test(adaptToSender(wrapped, "charlie")), false);
});
