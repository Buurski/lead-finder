#!/usr/bin/env node
/*
 * test_inbox_digest.mjs — offline tests for the inbox-triage model
 * (src/lib/inbox-digest.ts): noise heuristics, importance scoring, and the
 * defensive normalizeDigest that a producer POSTs into.
 *
 *   node scripts/test_inbox_digest.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const m = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "inbox-digest.ts")).href);
const { isNoise, scoreImportance, isActionable, normalizeDigest, summarizeDigest } = m;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// --- isNoise ---
check("no-reply sender is noise", isNoise("no-reply@stripe.com", "Receipt") === true);
check("newsletter subject is noise", isNoise("hello@brand.dk", "Vores nyhedsbrev for juni") === true);
check("kvittering is noise", isNoise("butik@shop.dk", "Kvittering for din ordre") === true);
check("facebook notification is noise", isNoise("notification@facebookmail.com", "You have a new message") === true);
check("real person is NOT noise", isNoise("anna@frisoeren.dk", "Spørgsmål til jeres tilbud") === false);
check("plain business mail not noise", isNoise("kontakt@cafe.dk", "Kan vi tage en snak?") === false);

// --- scoreImportance ---
check("client ranks highest", scoreImportance("client", false) >= 95);
check("newsletter ranks low", scoreImportance("newsletter", false) <= 10);
check("lead bonus applies", scoreImportance("question", true) > scoreImportance("question", false));
check("score never exceeds 100", scoreImportance("client", true) <= 100);

// --- isActionable ---
check("interested actionable", isActionable("interested") === true);
check("admin actionable", isActionable("admin") === true);
check("newsletter not actionable", isActionable("newsletter") === false);
check("auto-reply not actionable", isActionable("auto-reply") === false);

// --- normalizeDigest (defensive against bad producer input) ---
const norm = normalizeDigest({
  generatedBy: "cowork-opus",
  items: [
    { from: "a@b.dk", subject: "Hej", importance: 88, needsReply: true, category: "interested" },
    { from: "c@d.dk", importance: 200, needsReply: false, category: "newsletter" }, // clamp test
    { subject: "no from — dropped" }, // invalid, must be filtered
    null, // junk, must be filtered
  ],
});
check("invalid items filtered (2 valid of 4)", norm.items.length === 2);
check("importance clamped to 100", norm.items.every((i) => i.importance <= 100));
check("sorted importance desc", norm.items[0].importance >= norm.items[1].importance);
check("generatedBy preserved", norm.generatedBy === "cowork-opus");
check("missing subject defaulted", norm.items.find((i) => i.from === "c@d.dk").subject === "(intet emne)");

const empty = normalizeDigest(null);
check("null input → empty digest", Array.isArray(empty.items) && empty.items.length === 0);

// --- summarizeDigest ---
const sum = summarizeDigest(norm);
check("summary total", sum.total === 2);
check("summary needsReply count", sum.needsReply === 1);
check("summary of null is zero", summarizeDigest(null).total === 0);

console.log(`test_inbox_digest — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
