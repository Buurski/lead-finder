#!/usr/bin/env node
/*
 * test_tone_mixer.mjs — offline tests for src/lib/tone-mixer.ts.
 * Determinism, data-aware opener routing, the dropped dead opener, blacklist,
 * follow-up timing, and real variation across a batch. No network.
 *
 *   node scripts/test_tone_mixer.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const tm = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "tone-mixer.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- follow-up timing (the 12 -> 7 lesson) ------------------------------
check("FOLLOWUP_DAYS is 7", tm.FOLLOWUP_DAYS === 7);

// ---- hostile blacklist --------------------------------------------------
check("blacklist: Thellufsenfoto", tm.isBlacklisted("Thellufsenfoto") === true);
check("blacklist: Caroline Bjerring (spacing/case)", tm.isBlacklisted("caroline  BJERRING") === true);
check("blacklist: normal lead not blocked", tm.isBlacklisted("Salon Lumière") === false);

// ---- determinism --------------------------------------------------------
const L = { name: "Salon Lumière", branch: "frisør", city: "Aarhus", reviewsCount: 132, websiteStatus: "old", hooks: [] };
const a = tm.mixForLead(L);
const b = tm.mixForLead(L);
check("deterministic: same opener", a.opener === b.opener);
check("deterministic: same closing", a.closing === b.closing);
check("comboId present", typeof a.comboId === "string" && a.comboId.length > 0);

// ---- the salgselev disclosure is always present -------------------------
check("disclosure mentions salgselev", /salgselev/i.test(a.disclosure));

// ---- dead opener never produced -----------------------------------------
{
  let deadSeen = false;
  for (let i = 0; i < 60; i++) {
    const m = tm.mixForLead({ name: "Lead " + i, branch: "frisør", city: "Aarhus", reviewsCount: i * 3, websiteStatus: ["none", "old", "ok", "dead"][i % 4], hooks: [] });
    if (/bygget noget (særligt|rigtig solidt) op/i.test(m.opener)) deadSeen = true;
  }
  check("dead 'bygget noget særligt op' opener never appears", deadSeen === false);
}

// ---- data-aware routing -------------------------------------------------
{
  // tech-problem only when site is missing/old/dead
  let techOnOk = false;
  for (let i = 0; i < 40; i++) {
    const m = tm.mixForLead({ name: "OkSite " + i, branch: "vvs", city: "Herning", reviewsCount: 5, websiteStatus: "ok", hooks: [] });
    if (m.openerKind === "tech-problem") techOnOk = true;
  }
  check("tech-problem never chosen when websiteStatus=ok", techOnOk === false);
}
{
  // review-volume only when reviews >= 40
  let volOnLow = false;
  for (let i = 0; i < 40; i++) {
    const m = tm.mixForLead({ name: "LowRev " + i, branch: "salon", city: "Ikast", reviewsCount: 10, websiteStatus: "ok", hooks: [] });
    if (m.openerKind === "review-volume") volOnLow = true;
  }
  check("review-volume never chosen under 40 reviews", volOnLow === false);
}

// ---- review-volume uses the lead's OWN number ---------------------------
{
  // find a lead that lands on review-volume and check the number appears
  let checked = false;
  for (let i = 0; i < 80 && !checked; i++) {
    const rc = 100 + i;
    const m = tm.mixForLead({ name: "RevLead " + i, branch: "frisør", city: "Aarhus", reviewsCount: rc, websiteStatus: "ok", hooks: [] });
    if (m.openerKind === "review-volume") {
      check("review-volume opener contains the real count", m.opener.includes(String(rc)));
      checked = true;
    }
  }
  check("at least one review-volume opener was produced", checked);
}

// ---- variation across a batch -------------------------------------------
{
  const openers = new Set();
  for (let i = 0; i < 20; i++) {
    const m = tm.mixForLead({ name: "Batch " + i, branch: "frisør", city: "Aarhus", reviewsCount: (i % 6) * 30, websiteStatus: ["none", "old", "ok", "dead"][i % 4], hooks: [] });
    openers.add(m.opener);
  }
  check("batch of 20 yields >= 5 distinct openers", openers.size >= 5);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all tone-mixer checks ok");
console.log(`\ntest_tone_mixer — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
