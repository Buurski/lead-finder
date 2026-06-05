#!/usr/bin/env node
/*
 * test_composite.mjs — offline contract tests for the composite lead score
 * (src/lib/leads/composite-score.ts). Pure function: no Sheets, no network.
 *
 *   node scripts/test_composite.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mod = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", "composite-score.ts")).href);
const { compositeScore, branchRelevanceMultiplier, isSleepingBeauty } = mod;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

function makeLead(over = {}) {
  return {
    id: "1", name: "Test", branch: "frisør", phone: "", city: "Aarhus",
    score: 60, source: "places", website: "", websiteStatus: "none",
    status: "new", notes: "", lastUpdated: "", websiteQualityTier: "",
    enrichedInfo: "", email: "", emailSentAt: "", emailOpenedAt: "",
    emailClickedAt: "", emailStatus: "", followupSentAt: "", reviewsCount: 30,
    callbackDate: "", skipReason: "", ...over,
  };
}

// ---- branchRelevanceMultiplier ------------------------------------------
check("beauty weighted up (1.2)", branchRelevanceMultiplier("frisør") === 1.2);
check("hudpleje is beauty 1.2", branchRelevanceMultiplier("hudpleje klinik") === 1.2);
check("restaurant kept (1.05)", branchRelevanceMultiplier("restaurant") === 1.05);
check("trades mid (0.95)", branchRelevanceMultiplier("tømrer") === 0.95);
check("professional down (0.7)", branchRelevanceMultiplier("advokat") === 0.7);
check("unknown neutral-ish (0.85)", branchRelevanceMultiplier("xyzzy") === 0.85);
check("empty branch 0.85", branchRelevanceMultiplier("") === 0.85);

// ---- isSleepingBeauty ----------------------------------------------------
check("sleeping beauty: strong rep + weak site", isSleepingBeauty(4.7, 40, "none") === true);
check("not sleeping: good site", isSleepingBeauty(4.7, 40, "ok") === false);
check("not sleeping: too few reviews", isSleepingBeauty(4.7, 5, "none") === false);
check("not sleeping: low rating", isSleepingBeauty(4.0, 40, "dead") === false);

// ---- compositeScore: clamp + shape --------------------------------------
const r1 = compositeScore(makeLead());
check("score is integer", Number.isInteger(r1.score));
check("score within 0..100", r1.score >= 0 && r1.score <= 100);
check("breakdown present", r1.breakdown && typeof r1.breakdown.branchMultiplier === "number");

// ---- bureau penalty is a cap, not a hard drop ---------------------------
const clean = compositeScore(makeLead({ branch: "restaurant" }), undefined, {});
const bureau = compositeScore(makeLead({ branch: "restaurant" }), undefined, { madeByBureau: true });
check("bureau lowers score", bureau.score < clean.score);
check("bureau is not a hard drop (>0 possible)", bureau.breakdown.bureauPenalty === 20);

// ---- beauty beats professional for identical base -----------------------
const beauty = compositeScore(makeLead({ branch: "frisør", score: 70, reviewsCount: 50 }));
const prof = compositeScore(makeLead({ branch: "advokat", score: 70, reviewsCount: 50 }));
check("beauty scores higher than professional (same base)", beauty.score > prof.score);

// ---- sleeping-beauty bonus lifts the score ------------------------------
const sb = compositeScore(makeLead({ score: 70, reviewsCount: 40, websiteStatus: "none" }), undefined, { rating: 4.8 });
check("sleeping beauty bonus applied", sb.breakdown.sleepingBeautyBonus === 15);

// ---- email quality: personal inbox beats role inbox ---------------------
const personal = compositeScore(makeLead({ email: "anna@salon.dk" }));
const role = compositeScore(makeLead({ email: "info@salon.dk" }));
check("personal inbox >= role inbox term", personal.breakdown.emailQuality > role.breakdown.emailQuality);

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : `all composite checks ok (${pass})`);
process.exit(fail ? 1 : 0);
