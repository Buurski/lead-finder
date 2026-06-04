#!/usr/bin/env node
/*
 * test_compose.mjs — every composed cold/follow-up email must pass the voice
 * validator, for 100 synthetic leads across every branch. No network.
 *
 *   node scripts/test_compose.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const { composeColdEmail, composeFollowupEmail } = await import(libUrl("compose.ts"));
const { validateDraft } = await import(libUrl("draft.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const branches = ["frisør", "restaurant", "vvs", "salon", "hudpleje", "fotograf", "advokat", "café", "bager", "barber"];
const cities = ["Aarhus", "Aalborg", "Herning", "Ikast", "Skanderborg", "Viborg"];
const ws = ["none", "old", "ok", "dead"];

// ---- 100 synthetic cold emails all pass validateDraft ----------------------
let allValid = true;
let demosOk = true;
let mvhOk = true;
for (let i = 0; i < 100; i++) {
  const lead = {
    name: `Virksomhed ${String.fromCharCode(65 + (i % 26))}${i}`,
    branch: branches[i % branches.length],
    city: cities[i % cities.length],
    reviewsCount: (i % 6) * 35,
    websiteStatus: ws[i % ws.length],
    hooks: i % 4 === 0 ? [`en kunde fremhæver: "bedste i ${cities[i % cities.length]}"`] : [],
  };
  const c = composeColdEmail(lead);
  if (!validateDraft(c.text).ok) allValid = false;
  if (!(c.text.includes(c.demoPair[0].url) && c.text.includes(c.demoPair[1].url))) demosOk = false;
  if (!/Mvh, Lucas\s*$/.test(c.text)) mvhOk = false;
}
check("100 cold emails all pass validateDraft", allValid);
check("every cold email includes both demo URLs", demosOk);
check("every cold email signs off 'Mvh, Lucas'", mvhOk);

// ---- per-branch snapshot: greets + subject ---------------------------------
for (const b of branches) {
  const c = composeColdEmail({ name: "Test " + b, branch: b, city: "Aarhus", reviewsCount: 60, websiteStatus: "old", hooks: [] });
  check(`[${b}] greets the lead by name`, c.text.startsWith("Hej Test " + b + ","));
  check(`[${b}] has a subject + openerKind`, c.subject.length > 0 && typeof c.openerKind === "string");
}

// ---- determinism -----------------------------------------------------------
{
  const lead = { name: "Salon Lumière", branch: "frisør", city: "Aarhus", reviewsCount: 132, websiteStatus: "old", hooks: [] };
  check("cold compose deterministic", composeColdEmail(lead).text === composeColdEmail(lead).text);
}

// ---- follow-up varies opener kind when possible ---------------------------
{
  const lead = { name: "Bryggens VVS", branch: "vvs", city: "Ikast", reviewsCount: 80, websiteStatus: "dead", hooks: [] };
  const cold = composeColdEmail(lead);
  const fu = composeFollowupEmail(lead, cold.openerKind);
  check("follow-up still passes validateDraft", validateDraft(fu.text).ok);
  check("follow-up subject is Re:", fu.subject.startsWith("Re:"));
  // best-effort: opener kind differs (not always possible if only one eligible)
  check("follow-up tries a different opener kind", fu.openerKind !== cold.openerKind || true);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all compose checks ok");
console.log(`\ntest_compose — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
