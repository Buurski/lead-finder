import { test } from "node:test";
import assert from "node:assert/strict";
import { followerBucket, socialEnabled } from "./social-stats.ts";

test("followerBucket boundaries", () => {
  assert.equal(followerBucket(null), null);
  assert.equal(followerBucket(undefined), null);
  assert.equal(followerBucket(0), "under 200 følgere");
  assert.equal(followerBucket(199), "under 200 følgere");
  assert.equal(followerBucket(822), "~800 følgere");
  assert.equal(followerBucket(4200), "4.000 følgere");
  assert.equal(followerBucket(12000), "12.000 følgere");
  assert.equal(followerBucket(45000), "20.000+ følgere");
});

test("socialEnabled is false without env", () => {
  const prevToken = process.env.APIFY_TOKEN;
  const prevFlag = process.env.ENABLE_SOCIAL_STATS;
  delete process.env.APIFY_TOKEN;
  delete process.env.ENABLE_SOCIAL_STATS;
  try {
    assert.equal(socialEnabled(), false);
  } finally {
    if (prevToken !== undefined) process.env.APIFY_TOKEN = prevToken;
    if (prevFlag !== undefined) process.env.ENABLE_SOCIAL_STATS = prevFlag;
  }
});
