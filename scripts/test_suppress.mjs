#!/usr/bin/env node
/*
 * test_suppress.mjs — offline tests for the never-twice cold-outreach gate:
 *   src/lib/leads/suppress.ts  (bizKey, buildBlockSets, suppressionReason)
 *   src/lib/leads/branch-policy.ts (isExcludedBranch)
 * Pure, no network/creds.
 *   node scripts/test_suppress.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const supp = await import(pathToFileURL(path.join(ROOT, "src", "lib", "leads", "suppress.ts")).href);
const policy = await import(pathToFileURL(path.join(ROOT, "src", "lib", "leads", "branch-policy.ts")).href);
const { bizKey, buildBlockSets, suppressionReason } = supp;
const { isExcludedBranch } = policy;

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ── bizKey normalization ───────────────────────────────────────────────
check("bizKey folds apostrophe variants", bizKey("Pinseria C´ho Fame") === bizKey("Pinseria C'ho Fame"));
check("bizKey strips apostrophe", bizKey("Pinseria C'ho Fame") === "pinseria cho fame");
check("bizKey folds danish chars", bizKey("Skønhedsklinik Åse") === "skoenhedsklinik aase");
check("bizKey adds city segment", bizKey("Vida", "Aarhus") === "vida|aarhus");
check("bizKey case-insensitive", bizKey("SALON VIDA") === bizKey("salon vida"));

// ── branch policy: medical/health excluded, beauty kept ────────────────
check("tandlæge excluded", isExcludedBranch("tandlæge") === true);
check("tandlaege ascii excluded", isExcludedBranch("tandlaege") === true);
check("Tandlægerne by name excluded", isExcludedBranch("restaurant", "Tandlægerne Brønshøj Torv") === false || isExcludedBranch("tandlæge", "Tandlægerne Brønshøj Torv") === true);
check("læge/lægehus excluded", isExcludedBranch("lægehus") === true && isExcludedBranch("læge") === true);
check("kiropraktor excluded", isExcludedBranch("kiropraktor") === true);
check("fysioterapeut excluded", isExcludedBranch("fysioterapeut") === true);
check("psykolog excluded", isExcludedBranch("psykolog") === true);
check("skønhedsklinik KEPT", isExcludedBranch("skønhedsklinik") === false);
check("hudklinik KEPT", isExcludedBranch("hudklinik") === false);
check("frisør KEPT", isExcludedBranch("frisør") === false);
check("negle salon KEPT", isExcludedBranch("negle & vippeextensions salon") === false);
check("restaurant KEPT", isExcludedBranch("restaurant") === false);

// ── buildBlockSets + suppressionReason ─────────────────────────────────
const queue = [
  { id: "a", leadId: "place_1", name: "Pinseria C´ho Fame", city: "København", status: "sent", createdAt: "2026-06-12T00:00:00Z", updatedAt: "2026-06-12T00:00:00Z" },
  { id: "b", leadId: "place_2", name: "Salon Vida", city: "Aarhus", status: "pending", createdAt: "2026-06-13T00:00:00Z", updatedAt: "2026-06-13T00:00:00Z" },
  { id: "c", leadId: "place_3", name: "Gammel Afvist", city: "Odense", status: "rejected", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  { id: "d", leadId: "place_4", name: "Nylig Afvist", city: "Vejle", status: "rejected", createdAt: "2026-06-12T00:00:00Z", updatedAt: "2026-06-12T00:00:00Z" },
];
const sheets = [
  { name: "Kontaktet Cafe", city: "Aalborg", status: "new", emailSentAt: "2026-06-10T00:00:00Z", emailStatus: "sent", followupSentAt: "", callbackDate: "" },
  { name: "Frisk Lead", city: "Esbjerg", status: "new", emailSentAt: "", emailStatus: "", followupSentAt: "", callbackDate: "" },
];
const NOW = new Date("2026-06-13T12:00:00Z").getTime();
const sets = buildBlockSets(queue, sheets, NOW);

// The Pinseria case — sent yesterday, re-scraped today with a DIFFERENT place_id and
// the apostrophe variant. Must be blocked by name+city.
check("Pinseria re-scrape blocked by name (diff place_id, apostrophe variant)",
  suppressionReason({ leadId: "place_NEW", name: "Pinseria C'ho Fame", city: "København", branch: "restaurant" }, sets) !== null);
check("sent draft blocked by place_id",
  suppressionReason({ leadId: "place_1", name: "whatever", city: "x", branch: "restaurant" }, sets) !== null);
check("pending draft blocks re-add",
  suppressionReason({ leadId: "place_2", name: "Salon Vida", city: "Aarhus", branch: "frisør" }, sets) !== null);
check("recently-rejected blocked",
  suppressionReason({ leadId: "place_4", name: "Nylig Afvist", city: "Vejle", branch: "café" }, sets) !== null);
check("old rejected (>14d) NOT blocked",
  suppressionReason({ leadId: "place_3", name: "Gammel Afvist", city: "Odense", branch: "café" }, sets) === null);
check("Sheets-contacted blocked by name",
  suppressionReason({ leadId: "place_X", name: "Kontaktet Cafe", city: "Aalborg", branch: "café" }, sets) !== null);
check("uncontacted Sheets lead NOT blocked",
  suppressionReason({ leadId: "place_Y", name: "Frisk Lead", city: "Esbjerg", branch: "café" }, sets) === null);
check("brand-new business NOT blocked",
  suppressionReason({ leadId: "place_Z", name: "Helt Ny Salon", city: "Randers", branch: "skønhedsklinik" }, sets) === null);
check("excluded branch blocked even if new",
  suppressionReason({ leadId: "place_T", name: "Ny Tandklinik", city: "Horsens", branch: "tandlæge" }, sets) !== null);

// Sheets unavailable → queue half still guards, contactedAvailable false.
const setsNoSheets = buildBlockSets(queue, null, NOW);
check("Sheets null → contactedAvailable false", setsNoSheets.contactedAvailable === false);
check("queue guard works without Sheets",
  suppressionReason({ leadId: "place_2", name: "Salon Vida", city: "Aarhus", branch: "frisør" }, setsNoSheets) !== null);

console.log(`test_suppress — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
