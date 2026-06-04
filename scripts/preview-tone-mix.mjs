#!/usr/bin/env node
/*
 * preview-tone-mix.mjs — generate sample openers for 20 fictional leads so the
 * variation from tone-mixer.ts is visible at a glance. No network.
 *
 *   node scripts/preview-tone-mix.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { mixForLead, FOLLOWUP_DAYS } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "tone-mixer.ts")).href);

const branches = ["frisør", "restaurant", "vvs", "salon", "hudpleje", "fotograf", "advokat", "café", "bager", "tandlæge"];
const cities = ["Aarhus", "Aalborg", "Herning", "Ikast", "Skanderborg", "Viborg", "Holstebro", "Randers"];
const wsStates = ["none", "old", "ok", "dead"];

function lead(i) {
  const reviews = [0, 12, 41, 88, 132, 210][i % 6];
  const hooks = i % 3 === 0 ? [`en kunde fremhæver: "bedste klip jeg har fået i ${cities[i % cities.length]}"`]
    : i % 3 === 1 ? [`balayage og bryllupsstyling`] : [];
  return {
    name: `Virksomhed ${String.fromCharCode(65 + (i % 26))}${i}`,
    branch: branches[i % branches.length],
    city: cities[i % cities.length],
    reviewsCount: reviews,
    websiteStatus: wsStates[i % wsStates.length],
    hooks,
  };
}

console.log(`\n  tone-mix preview — follow-up ${FOLLOWUP_DAYS} dage\n  ${"=".repeat(60)}\n`);
let prevOpener = "";
let repeats = 0;
const kinds = {};
for (let i = 0; i < 20; i++) {
  const l = lead(i);
  const m = mixForLead(l);
  kinds[m.openerKind] = (kinds[m.openerKind] ?? 0) + 1;
  if (m.opener === prevOpener) repeats++;
  prevOpener = m.opener;
  console.log(`  [${String(i + 1).padStart(2)}] ${l.branch.padEnd(10)} ws=${(l.websiteStatus + "").padEnd(5)} rev=${String(l.reviewsCount).padStart(3)}  (${m.openerKind})`);
  console.log(`       Hej ${l.name}, ${m.opener}`);
  console.log("");
}
console.log(`  ${"=".repeat(60)}`);
console.log(`  opener-typer brugt:`, kinds);
console.log(`  back-to-back identiske openers: ${repeats} (vil helst være 0)\n`);
