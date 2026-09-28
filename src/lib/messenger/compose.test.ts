import test from "node:test";
import assert from "node:assert/strict";
import { branchGroupFor, demoUrlFor, branchDisplayFor, buildMessengerDraft, validateMessengerDraft } from "./compose.ts";
import { DEMO_SITES, referenceLinks } from "../demos.ts";

const PROJEKTER = "https://kinly.dk/projekter/";

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

test("frisør, barber og hudklinik er uændret", () => {
  assert.equal(branchGroupFor("frisør", "Salon Test"), "beauty");
  assert.equal(demoUrlFor("beauty", "barber", "Test Barbershop"), DEMO_SITES.streetcut);
  assert.equal(branchDisplayFor("beauty", "barber", "Test Barbershop"), "barbersalon");
  assert.equal(demoUrlFor("beauty", "skønhedsklinik", "Klinik Test"), DEMO_SITES.vidaCase);
  assert.equal(branchDisplayFor("beauty", "skønhedsklinik", "Klinik Test"), "hudklinik");
  assert.equal(branchDisplayFor("beauty", "negleklinik", "Negle Test"), "negleklinik");
  assert.equal(branchGroupFor("skønhedsklinik & spa", "Test"), "beauty");
  assert.deepEqual(validateMessengerDraft(buildMessengerDraft({ name: "Klinik Test", branch: "skønhedsklinik", city: "Herning", reviews: 80, pattern: "A" }).text), []);
});

test("mekaniker får ikke KT VVS-casen i DM'en", () => {
  // DM-vejen skal følge samme ord og samme case som AUTO-vejen i demos.ts.
  for (const [branch, name] of [["mekaniker", "Mekanikeren ApS"], ["automekaniker", "Bilerne"], ["autoværksted", "Ikast Autoværksted"]]) {
    const where = `${branch} | ${name}`;
    assert.notEqual(branchGroupFor(branch, name), "craftUtility", where);
    assert.notEqual(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.ktvvsCase, where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.ikastCase, where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), "mekaniker", where);
    const d = buildMessengerDraft({ name, branch, city: "Ikast", reviews: 40, pattern: "A" });
    assert.notEqual(d.demoUrl, DEMO_SITES.ktvvsCase, where);
    assert.equal(d.demoUrl, DEMO_SITES.ikastCase, where);
    assert.equal(d.branchDisp, "mekaniker", where);
    assert.ok(!d.text.includes("kt-vvs"), d.text);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
  for (const [branch, name, disp] of [["vvs", "VVS Test", "VVS-firma"], ["elektriker", "El Test", "elektriker"]]) {
    const where = `${branch} | ${name}`;
    assert.equal(branchGroupFor(branch, name), "craftUtility", where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.ktvvsCase, where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), disp, where);
  }
});

test("VVS & Mekanik er også VVS i DM'en — begge veje bruger isAutoBranch fra demos.ts", () => {
  for (const [branch, name] of [
    ["VVS & Mekanik", "Testfirma"],
    ["vvs", "VVS & Mekanik"],
    ["mekanik", "VVS & Mekanik"],
  ] as [string, string][]) {
    const where = `${branch} | ${name}`;
    assert.equal(branchGroupFor(branch, name), "craftUtility", where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.ktvvsCase, where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), "VVS-firma", where);
    const d = buildMessengerDraft({ name, branch, city: "Herning", reviews: 40, pattern: "A" });
    assert.equal(d.demoUrl, DEMO_SITES.ktvvsCase, where);
    assert.notEqual(d.demoUrl, DEMO_SITES.ikastCase, where);
    assert.equal(d.branchDisp, "VVS-firma", where);
    assert.ok(!d.text.includes("ikast-autoservice"), where);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
  // Den rene mekaniker skal fortsat i service-gruppen (Ikast-casen + "mekaniker").
  // Også når firmanavnet bærer et håndværksord: "Smedegaard Autoservice" rammer
  // CRAFT_UTIL, men AUTO_STRONG ("autoservice") vinder og holder den i auto-sporet.
  for (const [branch, name] of [
    ["autoservice", "Smedegaard Autoservice"],
    ["autoservice", "El-Biler Autoservice"],
    ["mekaniker", "Mekanikeren ApS"],
    ["bilmekaniker", "Bilerne"],
    ["mekanik", "Mekanikeren"],
    ["mekanikeren", "Mekanikeren"],
    ["mekanikerne", "Mekanikerne"],
    ["mekanikerværksted", "Bilerne"],
    ["mekanikken", "Mekanikken"],
  ] as [string, string][]) {
    const where = `${branch} | ${name}`;
    assert.equal(branchGroupFor(branch, name), "service", where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), DEMO_SITES.ikastCase, where);
    assert.equal(branchDisplayFor(branchGroupFor(branch, name), branch, name), "mekaniker", where);
  }
  // Et mekanik-ord som AUTO ikke fanger ("mekanisk" er ikke "mekaniker") er
  // hverken auto eller VVS: branchKind siger "other" i begge veje, og DM'en må
  // derfor hverken vise KT VVS-casen (fremmed håndværk) eller Ikast-casen
  // (auto-sporet) — kun projektoversigten, som er vores eget arbejde. Den gamle
  // egen regex på "mekan" gav et maskinværksted KT VVS-casen (27/9).
  for (const [branch, name] of [
    ["mekanisk værksted", "Mekanisk Værksted ApS"],
    ["mekanisk", "KB Mekanisk"],
    ["ukendt branche", "Testforening"],
  ] as [string, string][]) {
    const where = `${branch} | ${name}`;
    assert.notEqual(branchGroupFor(branch, name), "craftUtility", where);
    assert.equal(demoUrlFor(branchGroupFor(branch, name), branch, name), PROJEKTER, where);
    assert.notEqual(branchDisplayFor(branchGroupFor(branch, name), branch, name), "mekaniker", where);
    const d = buildMessengerDraft({ name, branch, city: "Ikast", reviews: 20, pattern: "A" });
    assert.equal(d.demoUrl, PROJEKTER, where);
    assert.ok(!/kt-vvs|ikast-autoservice/.test(d.text), where);
    assert.ok(d.text.includes(`her er noget af det jeg selv har bygget: ${PROJEKTER}`), d.text);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
});

test("uklassificeret og klinik-branche får aldrig autoværkstedets case i DM'en", () => {
  // DM-vejen skal vælge samme case som mail-vejen (referenceLinks.caseUrl) og
  // ellers fejle lukket til projektoversigten. Et autoværksted er ikke en
  // reference for en advokat, en rengøringsvirksomhed eller en tandlæge (28/9).
  for (const [branch, name] of [
    ["advokat", "Advokathuset Midt"],
    ["rengøring", "Rent Hjem ApS"],
    ["tandlæge", "Tandlægeklinikken Ikast"],
  ] as [string, string][]) {
    const where = `${branch} | ${name}`;
    const forventet = referenceLinks(branch, name).caseUrl ?? PROJEKTER;
    const url = demoUrlFor(branchGroupFor(branch, name), branch, name);
    assert.equal(url, forventet, where);
    assert.notEqual(url, DEMO_SITES.ikastCase, `${where}: Ikast AutoService-casen i DM'en`);
    const d = buildMessengerDraft({ name, branch, city: "Ikast", reviews: 30, pattern: "A" });
    assert.equal(d.demoUrl, forventet, where);
    assert.ok(!/ikast-autoservice/.test(d.text), `${where}: autoværksted-casen står i DM-teksten`);
    assert.deepEqual(validateMessengerDraft(d.text), [], where);
  }
  // Auto-branchen beholder Ikast-casen: det er branchens egen case, ikke en
  // fremmed reference.
  assert.equal(demoUrlFor("service", "autoværksted", "Ikast Autoværksted"), DEMO_SITES.ikastCase);
  assert.equal(demoUrlFor("service", "mekaniker", "Mekanikeren ApS"), DEMO_SITES.ikastCase);
});
