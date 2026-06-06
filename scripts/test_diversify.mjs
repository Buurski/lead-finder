#!/usr/bin/env node
/*
 * test_diversify.mjs — offline tests for the branch-diversity PICK helper
 * (src/lib/leads/diversify.ts + branchFamily). Pure: no Sheets, no network.
 *
 *   node scripts/test_diversify.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const lib = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", f)).href;
const { diversifyByFamily } = await import(lib("diversify.ts"));
const { branchFamily } = await import(lib("composite-score.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- branchFamily --------------------------------------------------------
check("family beauty", branchFamily("frisør") === "beauty");
check("family food", branchFamily("restaurant") === "food");
check("family trade", branchFamily("VVS-installatør") === "trade");
check("family retail", branchFamily("fotograf") === "retail");
check("family professional", branchFamily("advokat") === "professional");
check("family other", branchFamily("dyrlæge") === "other");

// ---- diversifyByFamily ---------------------------------------------------
// Best-first input: 5 food then 2 beauty. Naive order keeps all food first.
const sorted = [
  { n: "F1", branch: "restaurant" },
  { n: "F2", branch: "pizzeria" },
  { n: "F3", branch: "café" },
  { n: "F4", branch: "bistro" },
  { n: "F5", branch: "kro" },
  { n: "B1", branch: "frisør" },
  { n: "B2", branch: "negle" },
];
const out = diversifyByFamily(sorted, (x) => x.branch);

check("same length (no drops)", out.length === sorted.length);
check("no duplicates", new Set(out.map((x) => x.n)).size === sorted.length);
check("strongest lead still first", out[0].n === "F1");
// Beauty should surface by the 2nd pick instead of being buried at position 6.
check("2nd pick is beauty (mix, not all food)", branchFamily(out[1].branch) === "beauty");
check("beauty fully surfaced within first 4", out.slice(0, 4).filter((x) => branchFamily(x.branch) === "beauty").length === 2);

// Single-family input is returned in original order.
const mono = [{ n: "A", branch: "restaurant" }, { n: "B", branch: "café" }];
const monoOut = diversifyByFamily(mono, (x) => x.branch);
check("single family preserves order", monoOut.map((x) => x.n).join("") === "AB");

// Empty input.
check("empty input ok", diversifyByFamily([], (x) => x.branch).length === 0);

console.log(`test_diversify — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
