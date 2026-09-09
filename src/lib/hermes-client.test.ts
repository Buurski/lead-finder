import test from "node:test";
import assert from "node:assert/strict";
import { businessLoopState, describeUsageChange, formatTokenCount } from "./hermes-client.ts";

test("fald i forbrug bliver forklaret som en besparelse", () => {
  assert.deepEqual(describeUsageChange(-62.5), {
    label: "63% lavere end forrige døgn",
    state: "saving",
  });
});

test("stigning og manglende sammenligningsgrundlag lover ikke en besparelse", () => {
  assert.deepEqual(describeUsageChange(12.4), {
    label: "12% højere end forrige døgn",
    state: "rising",
  });
  assert.deepEqual(describeUsageChange(null), {
    label: "sammenligning kommer efter 48 timer",
    state: "neutral",
  });
});

test("store token-tal vises kompakt uden at skjule størrelsesordenen", () => {
  assert.equal(formatTokenCount(97_864), "98.000");
  assert.equal(formatTokenCount(1_340_000), "1,3 mio.");
});

test("forretningsloop skelner fejl, ventende og forsinket fra sundt", () => {
  const now = Date.parse("2026-09-09T10:00:00+02:00");
  const base = {
    id: "weekly",
    name: "uge-marketing",
    profile: "marketing",
    schedule: "0 9 * * 3",
    lastRunAt: "2026-09-09T09:00:00+02:00",
    lastStatus: "ok",
    lastError: null,
    nextRunAt: "2026-09-16T09:00:00+02:00",
  };
  assert.equal(businessLoopState(base, now), "ok");
  assert.equal(businessLoopState({ ...base, lastStatus: "error" }, now), "error");
  assert.equal(businessLoopState({ ...base, lastRunAt: null, lastStatus: null }, now), "waiting");
  assert.equal(businessLoopState({ ...base, nextRunAt: "2026-09-09T07:00:00+02:00" }, now), "late");
});
