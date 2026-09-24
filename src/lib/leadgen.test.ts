import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIngest, isStaleLeadgen, orderForIngest } from "./leadgen.ts";

test("normalizeIngest bevarer bureau og hasViewport", () => {
  const [lead] = normalizeIngest([{ name: "KT VVS", bureau: true, hasViewport: false }]);
  assert.equal(lead.bureau, true);
  assert.equal(lead.hasViewport, false);
});

test("normalizeIngest defaulter manglende signaler til null", () => {
  const [lead] = normalizeIngest([{ name: "Uden Signaler" }]);
  assert.equal(lead.hasViewport, null);
  assert.equal(lead.copyrightYear, null);
  assert.equal(lead.bureau, undefined);
});

test("isStaleLeadgen — gårsdagens eller manglende fil er ikke frisk", () => {
  const now = Date.parse("2026-09-25T06:30:00Z");
  assert.equal(isStaleLeadgen("2026-09-25T04:01:20Z", now), false);
  assert.equal(isStaleLeadgen("2026-09-24T04:01:20Z", now), true);
  assert.equal(isStaleLeadgen(undefined, now), true);
  assert.equal(isStaleLeadgen("ikke en dato", now), true);
});

test("orderForIngest — mail først, så højeste fitScore", () => {
  const out = orderForIngest([
    { name: "a", email: null, fitScore: 99 },
    { name: "b", email: "hej@b.dk", fitScore: 70 },
    { name: "c", email: "hej@c.dk", fitScore: 90 },
  ]);
  assert.deepEqual(out.map((x) => x.name), ["c", "b", "a"]);
});
