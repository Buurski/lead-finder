import test from "node:test";
import assert from "node:assert/strict";
import { classifyFeed, timestampOf, feedSentence, type FeedSpec } from "./feed-health.ts";

const spec: FeedSpec = {
  key: "leadgen",
  label: "Nye leads",
  feeds: "godkendelseskøen",
  path: "data/leadgen.json",
  expectEveryHours: 24,
};
const NOW = Date.parse("2026-07-31T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

test("frisk, forsinket og død skelnes på alder", () => {
  assert.equal(classifyFeed(spec, hoursAgo(6), NOW).status, "fresh");
  assert.equal(classifyFeed(spec, hoursAgo(47), NOW).status, "fresh");   // under 2x kadence
  assert.equal(classifyFeed(spec, hoursAgo(50), NOW).status, "stale");
  assert.equal(classifyFeed(spec, hoursAgo(24 * 8), NOW).status, "dead");
});

test("manglende eller ulæseligt tidsstempel bliver 'unknown', aldrig 'fresh'", () => {
  assert.equal(classifyFeed(spec, null, NOW).status, "unknown");
  assert.equal(classifyFeed(spec, "ikke en dato", NOW).status, "unknown");
  assert.equal(classifyFeed(spec, null, NOW).ageHours, null);
});

test("den virkelige sag: leadgen lå død i 25 dage", () => {
  // data/leadgen.json stod med at=2026-07-06 mens de andre feeds kørte videre.
  const f = classifyFeed(spec, "2026-07-06T20:10:37.630Z", NOW);
  assert.equal(f.status, "dead");
  assert.match(feedSentence(f), /24 dage/);
  assert.match(feedSentence(f), /godkendelseskøen/);
});

test("tidsstempel læses fra både 'at' og 'generatedAt'", () => {
  assert.equal(timestampOf({ at: "2026-07-31T00:00:00Z" }), "2026-07-31T00:00:00Z");
  assert.equal(timestampOf({ generatedAt: "2026-07-30T00:00:00Z" }), "2026-07-30T00:00:00Z");
  assert.equal(timestampOf({ items: [] }), null);
  assert.equal(timestampOf(null), null);
});

test("en fremtidig dato giver ikke negativ alder", () => {
  const f = classifyFeed(spec, hoursAgo(-5), NOW);
  assert.equal(f.ageHours, 0);
  assert.equal(f.status, "fresh");
});
