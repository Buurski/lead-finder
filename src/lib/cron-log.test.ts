import assert from "node:assert/strict";
import test from "node:test";
import { isStale, readCronLog, withCronLog } from "./cron-log.ts";
import { __setStore, InMemoryStore, store } from "./store.ts";

test("isStale: daglige/timelige 26 t, ugentlige 8 døgn", () => {
  assert.equal(isStale("31 4 * * *", 25 * 60), false);
  assert.equal(isStale("31 4 * * *", 27 * 60), true);
  assert.equal(isStale("15 5-19 * * *", 27 * 60), true);
  assert.equal(isStale("35 4 * * 1", 7 * 24 * 60), false);
  assert.equal(isStale("35 4 * * 1", 9 * 24 * 60), true);
});

test("withCronLog: blød fejl (ok:false) logges rødt uden at kaste", async () => {
  __setStore(new InMemoryStore());
  const r = await withCronLog("kunde-rapport", async () => ({ result: 7, ok: false, error: "1 rapport(er) fejlede" }));
  assert.equal(r, 7);
  const [e] = await readCronLog();
  assert.equal(e.ok, false);
  assert.equal(e.error, "1 rapport(er) fejlede");
  __setStore(null);
});

test("store.append med maxLen beholder kun de seneste poster", async () => {
  __setStore(new InMemoryStore());
  for (let i = 0; i < 5; i++) await store.append("x", i, 3);
  assert.deepEqual(await store.readAll("x"), [2, 3, 4]);
  __setStore(null);
});
