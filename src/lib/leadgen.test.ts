import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIngest } from "./leadgen.ts";

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
