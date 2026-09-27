import test from "node:test";
import assert from "node:assert/strict";
import { branchGroupFor, demoUrlFor, branchDisplayFor, buildMessengerDraft, validateMessengerDraft } from "./compose.ts";
import { DEMO_SITES } from "../demos.ts";

test("massagelead får hverken frisørsalon-ordet eller Salon Artec", () => {
  for (const [branch, name] of [["Massage", "Herning Massage & Kropsterapi"], ["Massageklinik", "Klinik for Kropsterapi"], ["Massage & kropsterapi", "Test Kropsterapi"]]) {
    const where = `${branch} | ${name}`;
    assert.notEqual(branchGroupFor(branch, name), "beauty", where);
    assert.notEqual(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.salonArtec, where);
    assert.notEqual(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.vidaCase, where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), "https://kinly.dk/projekter/", where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), "massageklinik", where);
    const d = buildMessengerDraft({ name, branch, city: "Herning", reviews: 90, pattern: "A" });
    assert.notEqual(d.group, "beauty", where);
    assert.equal(d.demoUrl, "https://kinly.dk/projekter/", where);
    assert.equal(d.branchDisp, "massageklinik", where);
    assert.ok(!/frisørsalon|salon-artec/i.test(d.text), d.text);
    assert.ok(d.text.includes("her er noget af det jeg selv har bygget: https://kinly.dk/projekter/"), d.text);
    assert.ok(!d.text.includes("til en massageklinik"), d.text);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
  const b = buildMessengerDraft({ name: "Herning Massage & Kropsterapi", branch: "Massage", city: "Herning", reviews: 90, pattern: "B" });
  assert.ok(b.text.includes("faldt over jeres massageklinik"), b.text);
});

test("frisør, barber og hudklinik er uændret", () => {
  assert.equal(branchGroupFor("frisør", "Salon Test"), "beauty");
  assert.equal(demoUrlFor("beauty", "frisør", "Salon Test"), DEMO_SITES.salonArtec);
  assert.equal(branchDisplayFor("beauty", "frisør", "Salon Test"), "frisørsalon");
  const frisør = buildMessengerDraft({ name: "Salon Test", branch: "frisør", city: "Herning", reviews: 80, pattern: "A" });
  assert.ok(frisør.text.includes("et eksempel jeg selv har bygget til en frisørsalon"), frisør.text);
  assert.equal(demoUrlFor("beauty", "barber", "Test Barbershop"), DEMO_SITES.streetcut);
  assert.equal(branchDisplayFor("beauty", "barber", "Test Barbershop"), "barbersalon");
  assert.equal(demoUrlFor("beauty", "skønhedsklinik", "Klinik Test"), DEMO_SITES.vidaCase);
  assert.equal(branchDisplayFor("beauty", "skønhedsklinik", "Klinik Test"), "hudklinik");
  assert.equal(branchDisplayFor("beauty", "negleklinik", "Negle Test"), "negleklinik");
  assert.equal(branchGroupFor("skønhedsklinik & spa", "Test"), "beauty");
  assert.deepEqual(validateMessengerDraft(buildMessengerDraft({ name: "Klinik Test", branch: "skønhedsklinik", city: "Herning", reviews: 80, pattern: "A" }).text), []);
});
