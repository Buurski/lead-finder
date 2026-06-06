#!/usr/bin/env node
/*
 * test_money.mjs — offline tests for normalizeFeeInput (src/lib/money.ts), the
 * manual-fee write normalizer. Pure: no Sheets, no network. Guards the footgun
 * where a typo in a fee field silently wiped a client's revenue to blank.
 *
 *   node scripts/test_money.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { normalizeFeeInput } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "money.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// Parseable amounts → rounded integer string.
check("plain integer", normalizeFeeInput("545") === "545");
check("danish thousands dot", normalizeFeeInput("5.000") === "5000");
check("comma decimal rounds", normalizeFeeInput("1.234,56") === "1235");
check("strips kr + spaces", normalizeFeeInput(" 545 kr/md ") === "545");
check("number type accepted", normalizeFeeInput(295) === "295");

// Empty → "" (intentional clear, allowed).
check("empty string clears", normalizeFeeInput("") === "");
check("whitespace clears", normalizeFeeInput("   ") === "");
check("undefined clears", normalizeFeeInput(undefined) === "");
check("null clears", normalizeFeeInput(null) === "");

// Non-empty but unparseable → null (caller rejects, does NOT blank).
check("pure letters → null", normalizeFeeInput("abc") === null);
check("symbols only → null", normalizeFeeInput("???") === null);

console.log(`test_money — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
