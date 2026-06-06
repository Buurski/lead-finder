#!/usr/bin/env node
/*
 * test_cleanup.mjs — offline contract tests for the aggressive-cleanup
 * classifier (src/lib/leads/cleanup-classify.ts). Pure: no Sheets, no network.
 *
 *   node scripts/test_cleanup.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const mod = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", "cleanup-classify.ts")).href);
const { classifyLeadForCleanup, summarizeCleanup, isEngaged } = mod;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

function makeLead(over = {}) {
  return {
    id: "2", name: "Salon Luna", branch: "frisør", phone: "", city: "Aarhus",
    score: 60, source: "places", website: "", websiteStatus: "none",
    status: "new", notes: "", lastUpdated: "", websiteQualityTier: "",
    enrichedInfo: "", email: "hej@salonluna.dk", emailSentAt: "", emailOpenedAt: "",
    emailClickedAt: "", emailStatus: "", followupSentAt: "", reviewsCount: 30,
    callbackDate: "", skipReason: "", ...over,
  };
}
const dec = (over) => classifyLeadForCleanup(makeLead(over)).decision;

// ---- KEEP: engaged is sacred regardless of quality ----------------------
check("engaged: status=sendt kept", dec({ status: "sendt", reviewsCount: 0, email: "" }) === "keep");
check("engaged: emailSentAt kept", dec({ status: "new", emailSentAt: "2026-05-01", reviewsCount: 0, email: "" }) === "keep");
check("engaged: replied kept", dec({ status: "new", emailStatus: "replied", reviewsCount: 1, email: "" }) === "keep");
check("engaged: client kept even if chain-ish", dec({ status: "client", name: "McDonald's", reviewsCount: 0 }) === "keep");
check("isEngaged false on pristine new", isEngaged(makeLead({ status: "new", emailSentAt: "", emailStatus: "" })) === false);

// ---- DELETE triggers (uncontacted) --------------------------------------
check("uncontacted no-email → delete", dec({ email: "" }) === "delete");
check("uncontacted chain → delete", dec({ name: "McDonald's", email: "a@b.dk", reviewsCount: 99 }) === "delete");
check("uncontacted few-reviews → delete", dec({ reviewsCount: 5 }) === "delete");
check("uncontacted 14 reviews → delete (boundary)", dec({ reviewsCount: 14 }) === "delete");

// ---- ARCHIVE: uncontacted but decent ------------------------------------
check("uncontacted 20 reviews + email + no chain → archive", dec({ reviewsCount: 20 }) === "archive");
check("15 reviews boundary → archive (>=15)", dec({ reviewsCount: 15 }) === "archive");

// ---- precedence: engaged beats delete triggers --------------------------
check("engaged + no email still kept", dec({ status: "kontaktet", email: "", reviewsCount: 0 }) === "keep");

// ---- summarize ----------------------------------------------------------
const classified = [
  { decision: "keep", reason: "engaged/has-history" },
  { decision: "delete", reason: "no-email" },
  { decision: "delete", reason: "chain" },
  { decision: "archive", reason: "uncontacted-mid-quality" },
];
const s = summarizeCleanup(classified);
check("summary total", s.total === 4);
check("summary delete count", s.wouldDelete === 2);
check("summary archive count", s.wouldArchive === 1);
check("summary keep count", s.wouldKeep === 1);
check("summary byReason chain", s.byReason["chain"] === 1);

console.log(`test_cleanup — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
