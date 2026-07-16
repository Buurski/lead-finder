// store.test.ts — FSStore.list must be recursive so keys written under
// subdirectories (e.g. invoice/2026-0001 via fsDocPath) are actually found.
// Regression for: readdirSync was non-recursive, so nested keys never
// showed up in list() even though put()/get() worked fine for them.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { store } from "./store.ts";

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
