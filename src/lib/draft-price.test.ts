import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDraft } from "./draft.ts";

const errs = (t: string) => validateDraft(t).errors.filter((e) => e.startsWith("pris/penge"));

test("pris-reglen: æøå-ord og anmeldelsestal er ikke penge; rigtige beløb fanges stadig", () => {
  assert.deepEqual(errs("Det kræver lidt overblik at finde rundt."), []);
  assert.deepEqual(errs("1.047 anmeldelser er imponerende."), []);
  assert.deepEqual(errs("Vi byggede den i 2026."), []);
  assert.ok(errs("Det koster 5.000 kr.").length > 0);
  assert.ok(errs("Prisen er 250 kr om måneden").length > 0);
  assert.ok(errs("ca. 4.997 for siden").length > 0);
  assert.ok(errs("kun 300 DKK").length > 0);
});
