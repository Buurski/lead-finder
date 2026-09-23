import assert from "node:assert/strict";
import test from "node:test";
import { isLeadgenBackfillSource } from "./leadgen-backfill.ts";

test("leadgen backfill accepts known ingest sources, including VPS drafts", () => {
  assert.equal(isLeadgenBackfillSource("places-direct"), true);
  assert.equal(isLeadgenBackfillSource("leadgen-ingest"), true);
  assert.equal(isLeadgenBackfillSource("cowork-leadgen"), true);
});

test("leadgen backfill ignores unrelated and missing sources", () => {
  assert.equal(isLeadgenBackfillSource("company-profile"), false);
  assert.equal(isLeadgenBackfillSource(undefined), false);
});
