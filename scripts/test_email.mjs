#!/usr/bin/env node
/*
 * test_email.mjs — offline render tests for the legacy email templates
 * (src/lib/email.ts). Pure render only: getEmailTemplate / buildLeadEmail never
 * touch Gmail (nodemailer connects lazily on sendMail). Guards the broken-Danish
 * compliment regression and the branch→demo routing.
 *
 *   node scripts/test_email.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { getEmailTemplate, buildLeadEmail } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "email.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const base = { leadId: "5", name: "Restaurant Nord", branch: "restaurant", city: "Aalborg", websiteStatus: "none", websiteQualityTier: "", daysSince: 7 };

// ---- food compliment: correct Danish (regression: was "stoedt paa") --------
const food = getEmailTemplate("restaurant", "cold", { ...base });
check("food compliment uses 'stødt på'", food.text.includes("stødt på"));
check("food compliment has no ASCII digraph 'stoedt'", !food.text.includes("stoedt"));
check("food compliment has no ASCII 'paa '", !food.text.includes("paa "));
check("food sends both food demos", food.text.includes("under-klippen") && food.text.includes("zaytoon"));
check("food has unsubscribe line", food.text.includes("fjerner jeg dig fra listen"));

// ---- beauty compliment: correct Danish -------------------------------------
const beauty = getEmailTemplate("frisør", "cold", { ...base, name: "Salon Lumière", branch: "frisør" });
check("beauty compliment uses 'nysgerrig på'", beauty.text.includes("nysgerrig på"));
check("beauty has no 'paa'/'taenke'/'klaede'", !/\bpaa\b|taenke|klaede/.test(beauty.text));
check("beauty sends salon demo", beauty.text.includes("salon-artec"));

// ---- craft compliment ------------------------------------------------------
const craft = getEmailTemplate("tømrer", "cold", { ...base, name: "Tømrerhuset", branch: "tømrer" });
check("craft compliment uses 'står for'", craft.text.includes("står for"));
check("craft routes to denlillemaler demo", craft.text.includes("denlillemaler"));
const vvs = getEmailTemplate("vvs", "cold", { ...base, name: "Bryggens VVS", branch: "vvs" });
check("vvs routes to ktvvs utility demo", vvs.text.includes("ktvvs"));

// ---- professional + unknown fallback --------------------------------------
const pro = getEmailTemplate("advokat", "cold", { ...base, name: "Midtadvokaterne", branch: "advokat" });
check("professional routes to midtadvokaterne demo", pro.text.includes("midtadvokaterne"));
const unknown = getEmailTemplate("dyrlæge", "cold", { ...base, name: "Dyreklinik X", branch: "dyrlæge" });
check("unknown branch → neutral service copy (no craft demo)", !unknown.text.includes("denlillemaler"));

// ---- buildLeadEmail wraps the same render ---------------------------------
const built = buildLeadEmail({ id: "5", name: "Restaurant Nord", branch: "restaurant", city: "Aalborg", websiteStatus: "none", websiteQualityTier: "", emailSentAt: "" }, "cold");
check("buildLeadEmail returns subject/text/html", !!built.subject && !!built.text && !!built.html);
check("buildLeadEmail food Danish correct", built.text.includes("stødt på"));

console.log(`test_email — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
