#!/usr/bin/env node
/*
 * test_datalayer.mjs — offline tests for the queue<->Sheets bridge mapping and
 * the defensive degrade path. The pure leadId->rowIndex mapping is exercised
 * directly; the async sync helpers are checked to degrade to {ok:false} (never
 * throw) for drafts with no real Sheets row, WITHOUT importing googleapis.
 *
 *   node scripts/test_datalayer.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const dl = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "datalayer.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- rowIndexFromLeadId (CLAUDE.md: rowIndex = sheetRow - 2) --------------
check("leadId '2' -> rowIndex 0", dl.rowIndexFromLeadId("2") === 0);
check("leadId '83' -> rowIndex 81", dl.rowIndexFromLeadId("83") === 81);
check("leadId '' -> null", dl.rowIndexFromLeadId("") === null);
check("leadId 'abc' -> null", dl.rowIndexFromLeadId("abc") === null);
check("leadId '1' (header) -> null", dl.rowIndexFromLeadId("1") === null);
check("leadId '0' -> null", dl.rowIndexFromLeadId("0") === null);

// ---- async helpers degrade safely for fixture / write-to-x drafts --------
const fauxDraft = { id: "d_x", leadId: "", name: "Test", branch: "", city: "", hooks: [], demoPair: [], professionalism: "", subject: "", body: "", status: "approved", source: "write-to-x", createdAt: "", updatedAt: "" };
let threw = false, r1 = null, r2 = null;
try {
  r1 = await dl.registerDraftApproved(fauxDraft);
  r2 = await dl.registerDraftSent(fauxDraft);
} catch { threw = true; }
check("sync helpers never throw on no-row draft", threw === false);
check("registerDraftApproved -> ok:false no-sheets-row", r1 && r1.ok === false && r1.error === "no-sheets-row");
check("registerDraftSent -> ok:false no-sheets-row", r2 && r2.ok === false && r2.error === "no-sheets-row");

// reply outcome with no row
const r3 = await dl.registerReplyOutcome("", { category: "interested", isInterested: true, becameClient: true, shouldStop: false, confidence: 0.9, signals: [] });
check("registerReplyOutcome -> ok:false no-sheets-row", r3 && r3.ok === false);

// ---- report --------------------------------------------------------------
console.log("");
console.log(`  test_datalayer — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("  FAILURES:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exitCode = 1;
} else {
  console.log("  ✓ datalayer bridge mapping + degrade path hold (offline)");
  console.log("");
  process.exitCode = 0;
}
