#!/usr/bin/env node
/*
 * test_pickfilter.mjs — offline tests for isUnworkedStatus
 * (src/lib/leads/pick-filter.ts), the daily-engine PICK eligibility predicate.
 * Pure: no Sheets, no network. Regression guard: a blank status ("") from a
 * Sheets row with a later populated column must still count as un-worked.
 *
 *   node scripts/test_pickfilter.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { isUnworkedStatus } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", "pick-filter.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// Eligible (un-worked).
check("blank string is un-worked", isUnworkedStatus("") === true);
check("undefined is un-worked", isUnworkedStatus(undefined) === true);
check("null is un-worked", isUnworkedStatus(null) === true);
check("'new' is un-worked", isUnworkedStatus("new") === true);
check("'New ' (case+space) is un-worked", isUnworkedStatus("New ") === true);
check("whitespace-only is un-worked", isUnworkedStatus("   ") === true);

// Worked — excluded.
check("called excluded", isUnworkedStatus("called") === false);
check("interested excluded", isUnworkedStatus("interested") === false);
check("client excluded", isUnworkedStatus("client") === false);
check("skip excluded", isUnworkedStatus("skip") === false);
check("'Client' (case) excluded", isUnworkedStatus("Client") === false);

console.log(`test_pickfilter — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
