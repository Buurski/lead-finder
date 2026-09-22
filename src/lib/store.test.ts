// store.test.ts — FSStore.list must be recursive so keys written under
// subdirectories (e.g. invoice/2026-0001 via fsDocPath) are actually found.
// Regression for: readdirSync was non-recursive, so nested keys never
// showed up in list() even though put()/get() worked fine for them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { store, scanAll } from "./store.ts";

test("FSStore.list finds nested and flat keys", async () => {
  const nestedKey = "invoice/test-0001";
  const flatKey = "test-flat-0001";
  try {
    await store.put(nestedKey, { ok: true });
    await store.put(flatKey, { ok: true });

    const nestedResults = await store.list("invoice/");
    assert.ok(nestedResults.includes(nestedKey), `expected ${nestedKey} in ${JSON.stringify(nestedResults)}`);

    const flatResults = await store.list("test-flat-");
    assert.ok(flatResults.includes(flatKey), `expected ${flatKey} in ${JSON.stringify(flatResults)}`);
  } finally {
    await store.delete(nestedKey);
    await store.delete(flatKey);
    // fsDocPath puts nested keys under client-assets/<slug>/recon.json only for
    // "recon/" prefix; "invoice/" falls to the generic .send_queue/<key>.json
    // branch, so just clean up the empty subdir it created.
    const nestedDir = path.join(process.cwd(), ".send_queue", "invoice");
    try {
      fs.rmdirSync(nestedDir);
    } catch {
      /* not empty or missing — fine */
    }
  }
});

test("scanAll følger hele SCAN-pagineringen, også med u64-cursor som streng", async () => {
  // Regression (2026-09-22): `cursor = Number(next)` rundede cursoren
  // ("18017315560044062113" → 18017315560044062000 ≈ ugyldig), så næste kald
  // gav 0 nøgler og ALT efter første side (200) blev droppet lydløst. Fake-
  // scan'en her fejler, hvis cursoren ikke sendes videre UÆNDRET.
  const BIG = "18017315560044062113";
  const page1 = Array.from({ length: 200 }, (_, i) => `doc:jev-draft/a${i}`);
  const page2 = Array.from({ length: 18 }, (_, i) => `doc:jev-draft/b${i}`);
  const calls: (number | string)[] = [];
  const fakeScan = async (cursor: number | string) => {
    calls.push(cursor);
    if (calls.length === 1) return [BIG, page1];
    assert.equal(cursor, BIG, `cursor skal videresendes urørt, fik ${JSON.stringify(cursor)}`);
    return ["0", page2];
  };
  const keys = await scanAll(fakeScan, "doc:jev-draft/*");
  assert.equal(keys.length, 218, "alle nøgler fra begge sider skal med");
  assert.deepEqual(calls, [0, BIG]);
});
