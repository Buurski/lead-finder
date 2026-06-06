#!/usr/bin/env node
/*
 * test_engine_enrich.mjs — offline tests for the deep-research → engine wire
 * (src/lib/engine.ts deepResearchSignals + enrichedComposite).
 *
 * Regression guard for the bug we fixed: Cowork deep-research used to write a
 * result the engine never read. Now enrichedInfo.deepResearch feeds compositeScore
 * + the manual delta, so a deep-researched lead actually moves in PICK.
 *
 *   node scripts/test_engine_enrich.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { deepResearchSignals, enrichedComposite } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "engine.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// A minimal Lead — only the fields compositeScore/enrichedComposite read.
function lead(extra = {}) {
  return {
    id: "2", name: "Salon Test", branch: "frisør / skønhed", phone: "", city: "Aarhus",
    score: 60, source: "", website: "", websiteStatus: "none", status: "new", notes: "",
    lastUpdated: "", websiteQualityTier: "", enrichedInfo: "", email: "", emailSentAt: "",
    emailOpenedAt: "", emailClickedAt: "", emailStatus: "", followupSentAt: "",
    reviewsCount: 40, callbackDate: "", ...extra,
  };
}

// --- deepResearchSignals parsing ---
check("empty enrichedInfo → null", deepResearchSignals("") === null);
check("non-JSON → null", deepResearchSignals("not json") === null);
check("JSON without deepResearch → null", deepResearchSignals('{"foo":1}') === null);

const enriched = JSON.stringify({
  deepResearch: {
    compositeScoreDelta: 12,
    emailQualityTier: "personal",
    reviewVelocity90d: 9,
    lighthouseScoreMobile: 30,
    madeByBureau: null,
  },
});
const sig = deepResearchSignals(enriched);
check("parses a deepResearch slice", sig !== null);
check("delta read", sig.delta === 12);
check("personal tier → emailQuality 1", sig.signals.emailQuality === 1);
check("90d velocity → per-month (9/3=3)", sig.signals.reviewVelocity === 3);
check("mobile score passthrough", sig.signals.mobileScore === 30);
check("no bureau → madeByBureau false", sig.signals.madeByBureau === false);

const bureau = deepResearchSignals(JSON.stringify({ deepResearch: { madeByBureau: "wedo.dk" } }));
check("bureau string → madeByBureau true", bureau.signals.madeByBureau === true);

// --- enrichedComposite: enrichment must move the score ---
const baseline = enrichedComposite(lead());
const lifted = enrichedComposite(lead({ enrichedInfo: enriched }));
check("enriched lead scores higher than baseline", lifted > baseline);

// A negative delta + bureau penalty must drag a lead DOWN.
const dragged = enrichedComposite(lead({
  enrichedInfo: JSON.stringify({ deepResearch: { compositeScoreDelta: -25, madeByBureau: "bureau.dk" } }),
}));
check("negative delta + bureau lowers score", dragged < baseline);

// Score stays clamped 0–100 even with a huge delta.
const clamped = enrichedComposite(lead({ enrichedInfo: JSON.stringify({ deepResearch: { compositeScoreDelta: 999 } }) }));
check("score clamps at 100", clamped <= 100 && clamped >= 0);

// Malformed enrichedInfo must not throw — falls back to plain composite.
let threw = false;
try { enrichedComposite(lead({ enrichedInfo: "{broken" })); } catch { threw = true; }
check("malformed enrichedInfo doesn't throw", threw === false);

console.log(`test_engine_enrich — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
