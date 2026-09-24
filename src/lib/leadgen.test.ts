import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIngest, isStaleLeadgen, orderForIngest, ingestAllowance } from "./leadgen.ts";

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

test("ingestAllowance — loftet gælder pr. leadgen-fil, ikke pr. kørsel", () => {
  const at = "2026-09-25T04:01:20Z";
  const mk = (n: number, createdAt: string, source = "leadgen-ingest") => Array.from({ length: n }, () => ({ source, createdAt }));
  assert.equal(ingestAllowance([], at), 20);
  assert.equal(ingestAllowance(mk(12, "2026-09-25T06:30:05Z"), at), 8, "anden kørsel samme fil");
  assert.equal(ingestAllowance(mk(25, "2026-09-25T06:30:05Z"), at), 0);
  assert.equal(ingestAllowance(mk(20, "2026-09-24T06:30:05Z"), at), 20, "gårsdagens tæller ikke");
  assert.equal(ingestAllowance(mk(20, "2026-09-25T06:30:05Z", "daily-engine"), at), 20, "andre kilder tæller ikke");
});
