#!/usr/bin/env node
/*
 * test_pipeline.mjs — offline regression tests for the core pipeline libs.
 *
 * Imports the TypeScript libs directly (Node 24 type-stripping) and asserts the
 * qualify / research / draft contracts. No network, no creds required — every
 * lib is built to degrade gracefully offline, so these run anywhere and exit 0
 * only when every assertion holds.
 *
 *   node scripts/test_pipeline.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;

const { hardDrop, isProfessionalEnough } = await import(libUrl("qualify.ts"));
const { research_lead } = await import(libUrl("research.ts"));
const { draft_personal_message, validateDraft } = await import(libUrl("draft.ts"));

let pass = 0;
let fail = 0;
const failures = [];
function check(name, cond) {
  if (cond) { pass++; }
  else { fail++; failures.push(name); }
}

// ---- qualify: hardDrop --------------------------------------------------
check("hardDrop empty", hardDrop("") !== null);
check("hardDrop personal-name (Frisør Adnan)", hardDrop("Frisør Adnan") !== null);
check("hardDrop personal-name (Hos Jonas)", hardDrop("Hos Jonas") !== null);
check("hardDrop cheap keyword (Quick Klip)", hardDrop("Quick Klip 99 kr") !== null);
check("hardDrop keeps brand (Salon Lumière)", hardDrop("Salon Lumière") === null);
check("hardDrop keeps Studio X", hardDrop("Studio Hud & Velvære") === null);

// ---- qualify: isProfessionalEnough --------------------------------------
const established = isProfessionalEnough({
  name: "Salon Lumière", branch: "frisør", score: 81,
  website: "", websiteStatus: "none", websiteQualityTier: "", reviewsCount: 132,
});
check("isProfessionalEnough passes established brand", established.ok === true);

const thin = isProfessionalEnough({
  name: "Frisør Adnan", branch: "frisør", score: 38,
  website: "", websiteStatus: "none", websiteQualityTier: "", reviewsCount: 4,
});
check("isProfessionalEnough drops thin personal-name", thin.ok === false);

const proBranchLow = isProfessionalEnough({
  name: "Advokathuset", branch: "advokat", score: 55,
  website: "x.dk", websiteStatus: "old", websiteQualityTier: "old", reviewsCount: 30,
});
check("isProfessionalEnough drops pro-branch below score 70", proBranchLow.ok === false);

// ---- research (offline) -------------------------------------------------
const lead = {
  name: "Salon Lumière", branch: "frisør / skønhed", city: "Aarhus", score: 81,
  website: "", websiteStatus: "none", websiteQualityTier: "", reviewsCount: 132,
  notes: "kendt for balayage", enrichedInfo: '{"specialty":"balayage og bryllup"}',
};
const research = await research_lead(lead);
check("research returns hooks array", Array.isArray(research.hooks));
check("research mines offline hook from enrichedInfo", research.hooks.some((h) => /balayage/i.test(h)));
check("research returns demoPair of 2", research.demoPair.length === 2);
check("research demoPair has urls", research.demoPair.every((d) => typeof d.url === "string" && d.url.length > 0));
check("research professionalismVerdict.ok", research.professionalismVerdict.ok === true);

// ---- draft (deterministic, no LLM) --------------------------------------
const voice = "Voice: humble hobby salgselev, warm, no price/kr, no robot-CTA, 2 demos, end 'Mvh, Lucas'.";
const draft = await draft_personal_message(lead, research, voice, { useLLM: false });
check("draft has subject", typeof draft.subject === "string" && draft.subject.length > 0);
check("draft body greets lead", draft.body.includes("Salon Lumière"));
check("draft body ends Mvh, Lucas", /Mvh, Lucas\s*$/.test(draft.body));
check("draft body includes both demo urls",
  draft.body.includes(research.demoPair[0].url) && draft.body.includes(research.demoPair[1].url));
check("draft passes validateDraft (no price/robot)", validateDraft(draft.body).ok === true);

// ---- validateDraft catches violations -----------------------------------
check("validateDraft rejects kr", validateDraft("Det koster 5000 kr").ok === false);
check("validateDraft rejects 'skriv ja'", validateDraft("Skriv ja hvis interesseret").ok === false);
check("validateDraft rejects gratis", validateDraft("Helt gratis tilbud").ok === false);
check("validateDraft rejects DKK", validateDraft("Det koster 5000 DKK").ok === false);
check("validateDraft rejects euro sign", validateDraft("Kun 500 € for det hele").ok === false);
check("validateDraft accepts clean copy", validateDraft("Hej, jeg lavede en demo til jer. Mvh, Lucas").ok === true);
// guard against false-positives the kr/DKK rules must NOT trip on:
check("validateDraft accepts year 2026", validateDraft("Vi ses i 2026, mvh Lucas").ok === true);
check("validateDraft accepts review count", validateDraft("I har over 200 gode anmeldelser").ok === true);

// ---- report -------------------------------------------------------------
console.log("");
console.log(`  test_pipeline — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("  FAILURES:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exit(1);
}
console.log("  ✓ all pipeline contracts hold (offline)");
console.log("");
process.exit(0);
