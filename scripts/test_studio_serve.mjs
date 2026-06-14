#!/usr/bin/env node
/*
 * test_studio_serve.mjs — offline test that built Studio demos can be listed
 * and located via the store. Guards the regression where putAsset returned a
 * dead `/_assets/...` URL with no route + no way to enumerate built demos.
 * Pure FS driver: no network, no key.
 *
 *   node scripts/test_studio_serve.mjs
 */
process.env.STORE_DRIVER = "fs"; // MUST be set before the store is imported
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { store } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "store.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const KEY = "demos/__test_x/index.html";

try {
  await store.putAsset(KEY, "<h1>hi</h1>", "text/html; charset=utf-8");

  const keys = await store.listAssets("demos/");
  check("listAssets includes the built key", Array.isArray(keys) && keys.includes(KEY));

  const url = await store.getAssetUrl(KEY);
  check("getAssetUrl returns a truthy locator", Boolean(url));
} finally {
  await store.deleteAsset(KEY);
}

console.log(`test_studio_serve — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("FAIL: " + failures.join(", "));
  process.exit(1);
}
console.log("PASS");
