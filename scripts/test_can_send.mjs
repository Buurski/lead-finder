#!/usr/bin/env node
/*
 * test_can_send.mjs — the central send-gate (src/lib/canSendTo.ts): one snapshot
 * per blocking reason + the happy path. No network.
 *
 *   node scripts/test_can_send.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { canSendTo } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "canSendTo.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const ok = { name: "Salon Lumière", branch: "frisør", email: "hej@salonlumiere.dk", emailStatus: "", status: "new" };

check("happy path passes", canSendTo({ ...ok }).ok === true);
check("hostile blocked", canSendTo({ ...ok, name: "Thellufsenfoto" }).reason === "hostile");
check("public blocked (kommune)", canSendTo({ ...ok, name: "Tønder Kommune" }).reason === "public");
check("public blocked (sygehus in branch)", canSendTo({ ...ok, branch: "sygehus" }).reason === "public");
check("no-email blocked", canSendTo({ ...ok, email: "" }).reason === "no-email");
check("bad-email blocked", canSendTo({ ...ok, email: "not-an-email" }).reason === "bad-email");
check("bounced blocked", canSendTo({ ...ok, emailStatus: "bounced" }).reason === "bounced");
check("replied blocked", canSendTo({ ...ok, emailStatus: "replied" }).reason === "replied");
check("unsubscribed blocked", canSendTo({ ...ok, emailStatus: "unsubscribed" }).reason === "unsubscribed");
check("status skip blocked", canSendTo({ ...ok, status: "skip" }).reason === "skip");

// Sheets values arrive with stray whitespace / mixed case — the gate must still
// block them. (Regression guard: untrimmed equality let these slip through and
// re-mailed repliers / unsubscribers.)
check("bounced blocked w/ trailing space", canSendTo({ ...ok, emailStatus: "bounced " }).reason === "bounced");
check("replied blocked mixed-case", canSendTo({ ...ok, emailStatus: "Replied" }).reason === "replied");
check("unsubscribed blocked w/ space+case", canSendTo({ ...ok, emailStatus: " Unsubscribed " }).reason === "unsubscribed");
check("skip blocked w/ space+case", canSendTo({ ...ok, status: " Skip " }).reason === "skip");

// chain: use a known chain-ish name; isChain handles the matching
{
  const chainDecision = canSendTo({ ...ok, name: "McDonald's" });
  check("chain blocked (McDonald's)", chainDecision.reason === "chain" || chainDecision.ok === false);
}

// duplicate across a batch via shared seenEmails
{
  const seen = new Set();
  const a = canSendTo({ ...ok, email: "same@x.dk" }, { seenEmails: seen });
  const b = canSendTo({ ...ok, email: "same@x.dk" }, { seenEmails: seen });
  check("first of duplicate passes", a.ok === true);
  check("second of duplicate blocked", b.reason === "duplicate");
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all canSendTo checks ok");
console.log(`\ntest_can_send — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
