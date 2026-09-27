import test from "node:test";
import assert from "node:assert/strict";
import { expectedDay } from "./blog-utils.ts";

test("expectedDay: ét indlæg pr. hverdag, weekender springes over", () => {
  const sunday = Date.parse("2026-09-27T10:00:00Z");
  assert.equal(expectedDay({ pos: 1, running: 0 }, sunday), "i morgen");
  assert.equal(expectedDay({ pos: 2, running: 0 }, sunday), "tirsdag");
  const friday = Date.parse("2026-10-02T10:00:00Z");
  assert.equal(expectedDay({ pos: 1, running: 0 }, friday), "i dag");
  assert.equal(expectedDay({ pos: 1, running: 1 }, friday), "mandag");
  assert.equal(expectedDay({ pos: 5, running: 0 }, friday), "torsdag");
});
