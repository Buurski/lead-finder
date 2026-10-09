import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptOut, isRejection } from "./rejections.ts";

test("eksplicit opt-out er både afvisning og afmelding (Opus S2#2)", () => {
  for (const body of ["Fjern mig fra jeres liste", "Afmeld venligst", "Please unsubscribe", "Stop med at sende mails"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), true, body);
  }
});

test("høfligt nej er afvisning, men ikke afmelding", () => {
  for (const body of ["Nej tak", "Vi er ikke interesseret", "Det er ikke aktuelt"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), false, body);
  }
});

test("accept vinder over afvisning (uændret adfærd)", () => {
  assert.equal(isRejection("Ja tak, ring til mig"), false);
  assert.equal(isOptOut("Ja tak, ring til mig"), false);
});
