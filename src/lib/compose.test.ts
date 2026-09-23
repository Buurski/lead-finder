import { test } from "node:test";
import assert from "node:assert/strict";
import { composeColdEmail } from "./compose.ts";

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
