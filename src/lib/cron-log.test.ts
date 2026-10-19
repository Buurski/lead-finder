import assert from "node:assert/strict";
import test from "node:test";
import { isStale } from "./cron-log.ts";

test("isStale: daglige/timelige 26 t, ugentlige 8 døgn", () => {
  assert.equal(isStale("31 4 * * *", 25 * 60), false);
  assert.equal(isStale("31 4 * * *", 27 * 60), true);
  assert.equal(isStale("15 5-19 * * *", 27 * 60), true);
  assert.equal(isStale("35 4 * * 1", 7 * 24 * 60), false);
  assert.equal(isStale("35 4 * * 1", 9 * 24 * 60), true);
});
