#!/usr/bin/env node
/*
 * test_lighthouse.mjs — contract test for runLighthouse (src/lib/seo.ts). We do
 * NOT launch real Chrome here (slow/flaky in CI); we assert the function exists,
 * never throws, and returns a well-formed LighthouseResult for the early-exit
 * (invalid URL) path. A real run is exercised manually from /seo.
 *
 *   node scripts/test_lighthouse.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const seo = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "seo.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

check("runLighthouse is a function", typeof seo.runLighthouse === "function");

// Invalid URL -> deterministic early exit (no Chrome launch).
{
  const r = await seo.runLighthouse("");
  check("empty url -> available:false", r.available === false);
  check("empty url -> scores null", r.scores === null);
  check("empty url -> has a note", typeof r.note === "string" && r.note.length > 0);
}
{
  const r = await seo.runLighthouse("not-a-url");
  check("garbage url -> available:false", r.available === false);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all lighthouse checks ok");
console.log(`\ntest_lighthouse — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
