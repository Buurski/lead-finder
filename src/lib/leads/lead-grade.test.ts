import { test } from "node:test";
import assert from "node:assert/strict";
import { grade, priority, businessLinks, factLine } from "./lead-grade.ts";

test("grade boundaries", () => {
  assert.equal(grade(70), "A");
  assert.equal(grade(69), "B");
  assert.equal(grade(50), "B");
  assert.equal(grade(49), "C");
  assert.equal(grade(null), "?");
});

test("priority: both null", () => {
  assert.equal(priority(null, null), null);
});

test("priority: one null falls back to the other for both slots", () => {
  // draftQuality null → uses leadAttr (80) for both slots: 80*0.6 + 80*0.4 = 80
  assert.equal(priority(80, null), 80);
  // leadAttr null → uses draftQuality (40) for both slots: 40*0.6 + 40*0.4 = 40
  assert.equal(priority(null, 40), 40);
});

test("priority: both present weights draft 0.6 / lead 0.4", () => {
  // 90*0.6 + 60*0.4 = 78
  assert.equal(priority(60, 90), 78);
});

test("businessLinks: empty website skips the web chip but keeps maps/facebook", () => {
  const links = businessLinks("Frisør Anna", "Herning", "", undefined);
  assert.ok(!links.some((l) => l.kind === "web"));
  assert.ok(links.some((l) => l.kind === "maps"));
  assert.ok(links.some((l) => l.kind === "facebook"));
  assert.ok(!links.some((l) => l.kind === "mail"));
});

test("businessLinks: bare-domain website gets https:// prepended", () => {
  const links = businessLinks("Frisør Anna", "Herning", "frisoeranna.dk", "anna@frisoeranna.dk");
  const web = links.find((l) => l.kind === "web");
  assert.equal(web?.href, "https://frisoeranna.dk");
  const mail = links.find((l) => l.kind === "mail");
  assert.equal(mail?.href, "mailto:anna@frisoeranna.dk");
});

test("businessLinks: never throws on empty input", () => {
  assert.doesNotThrow(() => businessLinks("", "", "", ""));
});

test("factLine skips missing values, never prints 'ukendt'", () => {
  const facts = factLine({ reviewsCount: 0, isChain: false, judgment: null });
  assert.deepEqual(facts, []);
  assert.ok(!facts.some((f) => f.includes("ukendt")));
});

test("factLine includes what's known", () => {
  const facts = factLine({
    reviewsCount: 42,
    isChain: true,
    sheetTier: "old",
    judgment: { virksomhedstype: "lokal_ejerledet", budget: "hoejt" },
  });
  assert.deepEqual(facts, [
    "42 Google-anmeldelser",
    "lokal, ejerledet",
    "budget-signal: høj",
    "forældet side",
    "kæde",
  ]);
});

test("factLine bruger det gemte ark-tier, ikke en udledt værdi", () => {
  // Regression: en side med redesign-behov 2,6 blev vist som "død side".
  // "død" betyder at siden ikke svarer — det står i arket, ikke i Jevs score.
  assert.deepEqual(factLine({ sheetTier: "dead" }), ["død side"]);
  assert.deepEqual(factLine({ sheetTier: "" }), []);
  assert.deepEqual(factLine({ sheetTier: "sludder" }), []);
});
