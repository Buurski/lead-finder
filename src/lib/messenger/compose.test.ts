import test from "node:test";
import assert from "node:assert/strict";
import { buildMessengerDraft, branchGroupFor, demoUrlFor, branchDisplayFor, validateMessengerDraft } from "./compose.ts";
import { DEMO_SITES } from "../demos.ts";

test("træningslead får ikke skønhedsklinikken eller frisørsalon-sætningen", () => {
  for (const [branch, name] of [["Fitnesscenter / wellness", "Pure Performance Fitness"], ["Træningscenter", "Test Spa"], ["Fitnesscenter", "Herning Fitness & Wellness"], ["Yoga", "Yoga Huset"]]) {
    const where = `${branch} | ${name}`;
    assert.notEqual(branchGroupFor(branch, name), "beauty", where);
    assert.notEqual(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.vidaCase, where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), "træningscenter", where);
    const d = buildMessengerDraft({ name, branch, city: "Herning", reviews: 80, pattern: "A" });
    assert.notEqual(d.group, "beauty", where);
    assert.notEqual(d.demoUrl, DEMO_SITES.vidaCase, where);
    assert.equal(d.branchDisp, "træningscenter", where);
    assert.ok(!/frisørsalon|case\/vida-klinik/.test(d.text), where);
    assert.ok(!d.text.includes("til en træningscenter"), where);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
});

test("fitness-værnet rører ikke skønhed, klinik eller frisør", () => {
  assert.equal(demoUrlFor("beauty", "skønhedsklinik", "Klinik Test"), DEMO_SITES.vidaCase);
  assert.equal(branchDisplayFor("beauty", "skønhedsklinik", "Klinik Test"), "hudklinik");
  assert.equal(branchGroupFor("skønhedsklinik & spa", "Test"), "beauty");
  assert.equal(demoUrlFor("beauty", "frisør", "Salon Test"), DEMO_SITES.salonArtec);
  assert.equal(branchDisplayFor("beauty", "frisør", "Salon Test"), "frisørsalon");
  const frisør = buildMessengerDraft({ name: "Salon Test", branch: "frisør", city: "Herning", reviews: 80, pattern: "A" });
  assert.ok(frisør.text.includes("et eksempel jeg selv har bygget til en frisørsalon"), frisør.text);
  assert.ok(frisør.demoUrl !== "https://kinly.dk/projekter/");
});
