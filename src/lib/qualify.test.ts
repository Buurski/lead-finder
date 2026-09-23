import { test } from "node:test";
import assert from "node:assert/strict";
import { personalGreetingName } from "./qualify.ts";

// Bug fixed 2026-09-23: "Hej Gitte Gylvig Skin & Welness," and "Hej Skagen
// Sundhedsklinik.dk," went out as real drafts — the greeting used the whole
// business name. personalGreetingName only returns a name when a personal
// first name clearly leads the business name (same known-first-name list
// hardDrop uses), never the business name/.dk/city/parens.
test("personalGreetingName — Gitte Gylvig Skin & Welness -> Gitte", () => {
  assert.equal(personalGreetingName("Gitte Gylvig Skin & Welness"), "Gitte");
});

test("personalGreetingName — Skagen Sundhedsklinik.dk -> null (no personal name)", () => {
  assert.equal(personalGreetingName("Skagen Sundhedsklinik.dk"), null);
});

test("personalGreetingName — Hos Anne Marie -> Anne Marie", () => {
  assert.equal(personalGreetingName("Hos Anne Marie"), "Anne Marie");
});

test("personalGreetingName — Restaurant Klosterkroen -> null", () => {
  assert.equal(personalGreetingName("Restaurant Klosterkroen"), null);
});

test("personalGreetingName — empty/whitespace name -> null", () => {
  assert.equal(personalGreetingName(""), null);
  assert.equal(personalGreetingName("   "), null);
});
