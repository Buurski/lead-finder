import { test } from "node:test";
import assert from "node:assert/strict";
import { composeColdEmail, composeFollowupEmail } from "./compose.ts";
import { DEMO_SITES, referenceLines } from "./demos.ts";

// Bug fixed 2026-09-23: composeColdEmail (ingest-leadgen + VPS run.mjs path)
// greeted with the raw business name — "Hej Gitte Gylvig Skin & Welness,",
// "Hej Skagen Sundhedsklinik.dk,". Now: personal name only when one clearly
// leads the business name, else plain "Hej,".
test("composeColdEmail greeting — Gitte Gylvig Skin & Welness -> Hej Gitte,", () => {
  const c = composeColdEmail({ name: "Gitte Gylvig Skin & Welness", branch: "hudpleje", city: "Skagen", hooks: [] });
  assert.ok(c.text.startsWith("Hej Gitte,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Skagen Sundhedsklinik.dk -> Hej,", () => {
  const c = composeColdEmail({ name: "Skagen Sundhedsklinik.dk", branch: "sundhed", city: "Skagen", hooks: [] });
  assert.ok(c.text.startsWith("Hej,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Hos Anne Marie -> Hej Anne Marie,", () => {
  const c = composeColdEmail({ name: "Hos Anne Marie", branch: "frisør", city: "Herning", hooks: [] });
  assert.ok(c.text.startsWith("Hej Anne Marie,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Restaurant Klosterkroen -> Hej,", () => {
  const c = composeColdEmail({ name: "Restaurant Klosterkroen", branch: "restaurant", city: "Herning", hooks: [] });
  assert.ok(c.text.startsWith("Hej,\n"), c.text.split("\n")[0]);
});

// ---- Demo-løftet skal matche den genererede tekst (26/9) -------------------
// buildText satte altid mix.demoIntro + tailorLine på, også når pickDemos er
// tom (tømrer/vinduespudser). Så lovede mailen eksempler den ikke havde.
const PROMISE = /Jeg lavede et par demoer|Sådan kunne det fx se ud|Bedst hvis I selv kigger|Det er bare eksempler|Det er kun for at vise idéen/;
const linksIn = (text: string) => [...text.matchAll(/^→\s*(\S+)$/gm)].map((m) => m[1]);

test("composeColdEmail tømrer uden demo-par: ingen demo-løfte, kun forside", () => {
  const name = "Tømrer Hansen";
  const c = composeColdEmail({ name, branch: "tømrer", city: "Ikast", hooks: [] });
  assert.deepEqual(c.demoPair, []);
  assert.equal(PROMISE.test(c.text), false, c.text);
  assert.equal(PROMISE.test(c.html), false, c.html);
  assert.deepEqual(linksIn(c.text), referenceLines("tømrer", name).map((l) => l.slice(2)));
  assert.deepEqual(linksIn(c.text), ["https://kinly.dk/"]);
});

test("composeFollowupEmail vinduespudser uden demo-par: ingen demo-løfte", () => {
  const c = composeFollowupEmail({ name: "Polering Vest", branch: "vinduespudser", city: "Ikast", hooks: [] });
  assert.deepEqual(c.demoPair, []);
  assert.equal(PROMISE.test(c.text), false, c.text);
});

test("composeColdEmail og followup beholder demo-linjen for maler", () => {
  const name = "Maler Mikkelsen";
  for (const c of [
    composeColdEmail({ name, branch: "maler", city: "Herning", hooks: [] }),
    composeFollowupEmail({ name, branch: "maler", city: "Herning", hooks: [] }),
  ]) {
    assert.equal(PROMISE.test(c.text), true, c.text);
    assert.ok(linksIn(c.text).includes(DEMO_SITES.denlillemaler), c.text);
  }
});
