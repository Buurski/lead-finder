import test from "node:test";
import assert from "node:assert/strict";
import { nextFailStreak, shouldSave } from "./jev-run.ts";

test("nextFailStreak — Jev-svar uden dom tæller, god dom nulstiller, døde sider lader stå", () => {
  let s = 0;
  for (let n = 0; n < 5; n++) s = nextFailStreak(s, "no-judgment");
  assert.equal(s, 5, "5 i træk udløser breakeren (JEV_FAIL_TRIP)");
  assert.equal(nextFailStreak(4, "fetch"), 4, "døde sider skjuler ikke en Jev-storm");
  assert.equal(nextFailStreak(4, "thin-page"), 4);
  assert.equal(nextFailStreak(4, undefined), 0, "en god dom nulstiller");
});

test("shouldSave — fejlet genvurdering overskriver ikke en god dom", () => {
  assert.equal(shouldSave({ error: "no-judgment" }, { judgment: { lignerKunde: 0.7 } }), false);
  assert.equal(shouldSave({ error: "fetch" }, { judgment: null }), true, "ingen god dom at beskytte");
  assert.equal(shouldSave({ error: "thin-page" }, undefined), true, "første vurdering gemmes altid");
  assert.equal(shouldSave({}, { judgment: { lignerKunde: 0.2 } }), true, "ny god dom erstatter gammel");
});
