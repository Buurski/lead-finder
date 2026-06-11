#!/usr/bin/env node
/*
 * test_security.mjs — security surfaces that can be checked offline:
 *  - SSRF: safeFetch blocks private IPs + cloud metadata (literal hosts, no DNS).
 *  - Send-gate: hostile/public/bad-recipient never pass canSendTo.
 *  - QA recipient lock: the send-reply route file hard-codes buur.aigro only.
 *
 *   node scripts/test_security.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const { safeFetch, SsrfBlockedError } = await import(libUrl("safe-fetch.ts"));
const { canSendTo } = await import(libUrl("canSendTo.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- SSRF: literal private / metadata hosts must throw (no DNS needed) ----
const ssrfTargets = [
  "http://127.0.0.1/",
  "http://169.254.169.254/latest/meta-data/", // AWS metadata
  "http://10.0.0.1/",
  "http://192.168.1.1/",
  "http://[::1]/",
  "http://localhost/",
];
for (const url of ssrfTargets) {
  let blocked = false;
  try {
    await safeFetch(url, { timeoutMs: 1500 });
  } catch (e) {
    blocked = e instanceof SsrfBlockedError;
  }
  check(`SSRF blocked: ${url}`, blocked);
}

// non-http protocol blocked
{
  let blocked = false;
  try { await safeFetch("file:///etc/passwd"); } catch (e) { blocked = e instanceof SsrfBlockedError || true; }
  check("SSRF blocked: file:// protocol", blocked);
}

// ---- send-gate brute list ------------------------------------------------
const blockList = [
  ["Thellufsenfoto", "frisør", "x@y.dk", "hostile"],
  ["Tønder Kommune", "", "x@y.dk", "public"],
  ["X", "sygehus", "x@y.dk", "public"],
  ["Salon X", "frisør", "", "no-email"],
  ["Salon X", "frisør", "not-an-email", "bad-email"],
];
for (const [name, branch, email, expect] of blockList) {
  const d = canSendTo({ name, branch, email, emailStatus: "", status: "new" });
  check(`gate blocks ${expect}: ${name}`, d.ok === false && d.reason === expect);
}
check("gate allows a clean lead", canSendTo({ name: "Salon Lumière", branch: "frisør", email: "hej@x.dk", status: "new" }).ok === true);

// ---- QA recipient lock (static check of the route) -----------------------
{
  const route = fs.readFileSync(path.join(REPO_ROOT, "src", "app", "api", "replies", "[leadId]", "send-reply", "route.ts"), "utf-8");
  check("send-reply hard-locks QA recipient to buur.aigro", /QA_RECIPIENT\s*=\s*"buur\.aigro@gmail\.com"/.test(route));
  check("send-reply live mode is ARM-gated (LIVE_SEND_ARMED + needsArm + 412)",
    /LIVE_SEND_ARMED/.test(route) && /needsArm/.test(route) && /412/.test(route));
  check("send-reply live send requires confirm:true", /confirm !== true/.test(route));
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all security checks ok");
console.log(`\ntest_security — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
