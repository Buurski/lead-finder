#!/usr/bin/env node
/*
 * test_eligibility.mjs — offline tests for the single send-eligibility gate
 * (src/lib/eligibility.ts), feeding bulk-send + follow-ups. Pure: type-only
 * Sheets import, chains.ts is pure. Guards the whitespace/case regression where
 * a "bounced "/"replied "/"Skip" value slipped the gate and re-mailed a lead.
 *
 *   node scripts/test_eligibility.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const elig = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "eligibility.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

function lead(over = {}) {
  return {
    id: "2", name: "Restaurant Nord", branch: "restaurant", phone: "", city: "Aalborg",
    score: 75, source: "", website: "", websiteStatus: "none", status: "new", notes: "",
    lastUpdated: "", websiteQualityTier: "old", enrichedInfo: "", email: "hej@nord.dk",
    emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
    followupSentAt: "", reviewsCount: 50, callbackDate: "", skipReason: "", ...over,
  };
}

// ---- isEligibleForCold: happy + suppressions -----------------------------
check("clean new lead is cold-eligible", elig.isEligibleForCold(lead()) === true);
check("already-sent blocked", elig.isEligibleForCold(lead({ emailSentAt: "2026-06-01T08:00:00Z" })) === false);
check("bounced blocked", elig.isEligibleForCold(lead({ emailStatus: "bounced" })) === false);
check("skip blocked", elig.isEligibleForCold(lead({ status: "skip" })) === false);
check("client blocked", elig.isEligibleForCold(lead({ status: "client" })) === false);
check("modern site blocked", elig.isEligibleForCold(lead({ websiteQualityTier: "modern" })) === false);
check("bad email blocked", elig.isEligibleForCold(lead({ email: "noreply@example.com" })) === false);
check("low score blocked", elig.isEligibleForCold(lead({ score: 40 })) === false);
check("professional needs >=70", elig.isEligibleForCold(lead({ branch: "advokat", score: 65 })) === false);
check("professional >=70 passes", elig.isEligibleForCold(lead({ branch: "advokat", score: 72 })) === true);

// Whitespace/case regression — must still block.
check("'bounced ' (space) blocked", elig.isEligibleForCold(lead({ emailStatus: "bounced " })) === false);
check("'Skip' (case) blocked", elig.isEligibleForCold(lead({ status: "Skip" })) === false);
check("' Client ' (space+case) blocked", elig.isEligibleForCold(lead({ status: " Client " })) === false);
check("'Modern' (case) blocked", elig.isEligibleForCold(lead({ websiteQualityTier: "Modern" })) === false);

// ---- isEligibleForFollowup ----------------------------------------------
const sent8d = new Date(Date.now() - 8 * 86_400_000).toISOString();
const sent2d = new Date(Date.now() - 2 * 86_400_000).toISOString();
check("followup eligible after window", elig.isEligibleForFollowup(lead({ emailSentAt: sent8d })) === true);
check("followup too soon blocked", elig.isEligibleForFollowup(lead({ emailSentAt: sent2d })) === false);
check("followup blocked if never sent", elig.isEligibleForFollowup(lead({ emailSentAt: "" })) === false);
check("followup blocked if replied", elig.isEligibleForFollowup(lead({ emailSentAt: sent8d, emailStatus: "replied" })) === false);
check("followup blocked if 'replied ' (space)", elig.isEligibleForFollowup(lead({ emailSentAt: sent8d, emailStatus: "replied " })) === false);
check("followup blocked if opened", elig.isEligibleForFollowup(lead({ emailSentAt: sent8d, emailOpenedAt: sent2d })) === false);
check("followup blocked if already followed up", elig.isEligibleForFollowup(lead({ emailSentAt: sent8d, followupSentAt: sent2d })) === false);

console.log(`test_eligibility — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
