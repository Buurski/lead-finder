#!/usr/bin/env node
/*
 * test_messenger.mjs — offline tests for the Messenger workspace lib
 * (src/lib/messenger/*): handle resolution, draft composition, candidate
 * selection (quality gates + quotas). Pure, no Sheets/network.
 *
 *   node scripts/test_messenger.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, "src", "lib", "messenger", p)).href);
const { handleFromWebsite, messengerUrlFor } = await imp("handle.ts");
const { branchGroupFor, buildMessengerDraft, validateMessengerDraft } = await imp("compose.ts");
const { isMessengerEligible, nameVerdict, selectMessengerCandidates } = await imp("select.ts");

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// --- handle resolution ---
check("vanity handle", handleFromWebsite("https://www.facebook.com/SalonArtec/")?.handle === "SalonArtec");
check("messenger url built", handleFromWebsite("https://www.facebook.com/SalonArtec/")?.messengerUrl === "https://www.facebook.com/messages/t/SalonArtec");
check("profile.php id", handleFromWebsite("https://www.facebook.com/profile.php?id=100088889963740")?.handle === "100088889963740");
check("/p/ trailing id", handleFromWebsite("https://www.facebook.com/p/Din-Frisør-Thisted-100063624940952/")?.handle === "100063624940952");
check("share link → null", handleFromWebsite("https://www.facebook.com/share/abc123/") === null);
check("posts link → null", handleFromWebsite("https://www.facebook.com/somepage/posts/123") === null);
check("reserved word → null", handleFromWebsite("https://www.facebook.com/groups/") === null);
check("non-fb → null", handleFromWebsite("https://salon.dk") === null);
check("empty → null", handleFromWebsite("") === null);
check("messengerUrlFor", messengerUrlFor("abc") === "https://www.facebook.com/messages/t/abc");

// --- compose ---
check("beauty group", branchGroupFor("frisør", "Salon Lumière") === "beauty");
check("food group", branchGroupFor("pizzeria", "Bella") === "food");
check("craftUtility group", branchGroupFor("vvs", "Bryggens VVS") === "craftUtility");
const draft = buildMessengerDraft({ name: "Salon Lumière", branch: "frisør", city: "Aarhus", reviews: 132, pattern: "A" });
check("draft mentions reviews", draft.text.includes("132"));
check("draft has demo url", /https?:\/\//.test(draft.text));
check("draft ends signature", draft.text.endsWith("Mvh, Lucas"));
check("draft passes validation", validateMessengerDraft(draft.text).length === 0);
check("pattern B uses city", buildMessengerDraft({ name: "X", branch: "café", city: "Odense", reviews: 60, pattern: "B" }).text.includes("Odense"));

// --- nameVerdict ---
check("cheap keyword dropped", nameVerdict("Billig Frisør").hardDrop === true);
check("known personal name dropped", nameVerdict("Adnan").hardDrop === true);
check("brand-ish kept + boosted", nameVerdict("Klippehuset Studio").hardDrop === false && nameVerdict("Klippehuset Studio").boost > 0);
check("city-as-brand kept", nameVerdict("Aarhus").hardDrop === false);

// --- eligibility + selection ---
function lead(o = {}) {
  return {
    id: "2", name: "Salon Lumière", branch: "frisør", phone: "", city: "Aarhus", score: 70,
    source: "", website: "https://facebook.com/SalonLumiere", websiteStatus: "none", status: "new",
    notes: "", lastUpdated: "", websiteQualityTier: "", enrichedInfo: "", email: "",
    emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "", followupSentAt: "",
    reviewsCount: 90, callbackDate: "", ...o,
  };
}
check("eligible FB-only lead", isMessengerEligible(lead()) === true);
check("has-email lead excluded", isMessengerEligible(lead({ email: "info@salon.dk" })) === false);
check("real-website lead excluded", isMessengerEligible(lead({ website: "https://salon.dk" })) === false);
check("low-reviews excluded", isMessengerEligible(lead({ reviewsCount: 10 })) === false);
check("client status excluded", isMessengerEligible(lead({ status: "client" })) === false);
check("no-handle excluded", isMessengerEligible(lead({ website: "" })) === false);

const many = [
  lead({ id: "2", name: "Salon Lumière", reviewsCount: 200, website: "https://facebook.com/lumiere" }),
  lead({ id: "3", name: "Café Mathilde", branch: "café", reviewsCount: 150, website: "https://facebook.com/mathilde" }),
  lead({ id: "4", name: "Billig Klip", reviewsCount: 300, website: "https://facebook.com/billig" }), // cheap → dropped
  lead({ id: "5", name: "Bryggens VVS", branch: "vvs", reviewsCount: 120, website: "https://facebook.com/bryggenvvs" }),
];
const sel = selectMessengerCandidates(many, { limit: 12 });
check("cheap-name dropped from selection", !sel.find((c) => c.id === "4"));
check("selection returns 3 valid", sel.length === 3);
check("each has messenger url", sel.every((c) => c.messengerUrl.includes("messages/t/")));
check("each has a draft", sel.every((c) => c.draft.endsWith("Mvh, Lucas")));
check("patterns rotate", new Set(sel.map((c) => c.pattern)).size >= 1);
const selExcluded = selectMessengerCandidates(many, { limit: 12, excludeIds: new Set(["2"]) });
check("excludeIds respected", !selExcluded.find((c) => c.id === "2"));
check("limit respected", selectMessengerCandidates(many, { limit: 1 }).length === 1);

console.log(`test_messenger — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
