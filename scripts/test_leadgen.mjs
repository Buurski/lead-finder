#!/usr/bin/env node
/*
 * test_leadgen.mjs — offline tests for src/lib/leadgen.ts (ingest normalize +
 * dedupe). Pure.
 *   node scripts/test_leadgen.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { normalizeIngest, dedupeByName } = await import(pathToFileURL(path.join(ROOT, "src", "lib", "leadgen.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// normalizeIngest
const norm = normalizeIngest([
  { name: "Salon Vida", branch: "skønhed", city: "Aarhus", fitScore: 88, gap: "no booking", reviewsCount: 120 },
  { name: "  ", fitScore: 50 },              // blank name → dropped
  { fitScore: 99 },                           // no name → dropped
  { name: "Over", fitScore: 250 },            // clamp
  null,                                        // junk
]);
check("invalid rows dropped (2 valid)", norm.length === 2);
check("fitScore clamped to 100", norm.find((l) => l.name === "Over").fitScore === 100);
check("fields preserved", norm[0].gap === "no booking" && norm[0].reviewsCount === 120);
check("empty input → []", normalizeIngest(null).length === 0);

// dedupeByName
const existing = new Set(["salon vida"]);
const { fresh, skipped } = dedupeByName(
  [{ name: "Salon Vida" }, { name: "Ny Klinik" }, { name: "ny klinik" }],
  existing,
);
check("known name skipped", skipped.find((l) => l.name === "Salon Vida"));
check("fresh unique kept", fresh.length === 1 && fresh[0].name === "Ny Klinik");
check("intra-batch dupe skipped", skipped.filter((l) => l.name.toLowerCase() === "ny klinik").length === 1);

console.log(`test_leadgen — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
