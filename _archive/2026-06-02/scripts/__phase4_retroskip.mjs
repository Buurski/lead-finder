#!/usr/bin/env node
// Phase 4 retroactive bulk-skip — computes and applies skipReason for leads
// that slipped through the cold-send pipeline before the eligibility rules
// were hardened.
//
// Read-only first (--dry). Writes column V (skipReason), column J (status)
// and appends to the SkipReasons audit tab. Halt-flag is verified before
// any write to make 100% sure nothing kicks off sends.
//
// Groups:
//   A. emailStatus=replied AND followupSentAt non-empty
//      → markedsføringslov risk (followed up after reply)
//   B. branch matches a "dropped" professional/retail list AND emailSentAt non-empty
//      → leads in branches we no longer target that already got a cold mail
//   C. Strict public-sector domains (state.dk / kommune.dk) + 3 known IDs

import { google } from "googleapis";
import fs from "node:fs";
import path from "node:path";

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "1it8BeujksJjZuMAFaFaA0j11UDAA_afFP1BqgViVFJ8";
const KEY_FILE = process.env.GOOGLE_KEY_FILE;
const HALT_EXPECTED_MIN_ISO = "2026-07-01T00:00:00.000Z";

const DRY = !process.argv.includes("--apply");

if (!KEY_FILE) {
  console.error("GOOGLE_KEY_FILE env var required (set via .env.local)");
  process.exit(1);
}
if (!fs.existsSync(KEY_FILE)) {
  console.error("Key file not found:", KEY_FILE);
  process.exit(1);
}

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

async function readPause() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "PauseSchedule!A2:B2",
  });
  return (res.data.values?.[0]?.[0] ?? "").toString().trim();
}

async function readLeads() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "Leads!A2:V",
  });
  return (res.data.values ?? []).map((row, i) => ({
    id: String(i + 2),
    rowIndex: i,
    name: row[0] ?? "",
    branch: row[1] ?? "",
    city: row[3] ?? "",
    website: row[6] ?? "",
    status: row[9] ?? "",
    email: row[13] ?? "",
    emailSentAt: row[14] ?? "",
    emailStatus: row[17] ?? "",
    followupSentAt: row[18] ?? "",
    skipReason: row[21] ?? "",
  }));
}

// ----------------------------------------------------------------------------

const DROPPED_BRANCHES = [
  "advokat", "læge", "tandlæge", "fysioterapi", "fysioterapeut",
  "kiropraktor", "psykolog", "apotek", "optiker", "konsulent",
  "hovedentreprenør", "butik",
];

function classify(lead) {
  // Group A — replied but followed up anyway
  if (lead.emailStatus === "replied" && lead.followupSentAt) {
    return { group: "A", reason: "already_contacted_elsewhere",
      note: "phase4-A: replied then followed up (markedsføringslov risk)" };
  }
  // Group B — dropped-branch lead already cold-mailed
  if (lead.emailSentAt) {
    const b = (lead.branch || "").toLowerCase();
    if (DROPPED_BRANCHES.some((k) => b.includes(k))) {
      return { group: "B", reason: "bad_fit",
        note: `phase4-B: dropped branch "${lead.branch}" already cold-mailed` };
    }
  }
  // Group C — strict public-sector domains
  const email = (lead.email || "").toLowerCase();
  const name = (lead.name || "").toLowerCase();
  if (/@[a-z0-9-]+\.(kommune|region|sygehus)\./.test(email) || /\.kommune\.dk$/.test(email) || /@silkeborg\.dk$/.test(email)) {
    return { group: "C", reason: "bad_fit", note: "phase4-C: public-sector domain" };
  }
  if (/retshj[æa]lp|sundhedscenter|borgerservice|jobcenter/.test(name) && lead.emailSentAt) {
    return { group: "C", reason: "bad_fit", note: "phase4-C: public-sector name token" };
  }
  return null;
}

// ----------------------------------------------------------------------------

async function appendSkipReasons(rows) {
  if (rows.length === 0) return;
  // Ensure tab exists (would already exist after first /api/review/skip call).
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: "SkipReasons!A:E",
    valueInputOption: "RAW",
    requestBody: { values: rows },
  });
}

async function writeSkipReasonsBatch(updates) {
  // updates: [{ rowIndex, skipReason }]
  if (updates.length === 0) return;
  const data = updates.map(({ rowIndex, skipReason }) => ({
    range: `Leads!V${rowIndex + 2}`,
    values: [[skipReason]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

async function writeStatusBatch(updates) {
  if (updates.length === 0) return;
  const data = updates.map(({ rowIndex }) => ({
    range: `Leads!J${rowIndex + 2}`,
    values: [["skip"]],
  }));
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

// ----------------------------------------------------------------------------

const pause = await readPause();
console.log(`[pause] PauseSchedule!A2 = ${JSON.stringify(pause)}`);
const pauseDate = Date.parse(pause);
const haltMin = Date.parse(HALT_EXPECTED_MIN_ISO);
if (!Number.isFinite(pauseDate) || pauseDate < haltMin) {
  console.error(`[abort] pause flag is NOT set to >= ${HALT_EXPECTED_MIN_ISO}. Refusing to write.`);
  process.exit(2);
}
console.log(`[pause] halt flag verified: pausedUntil >= ${HALT_EXPECTED_MIN_ISO} ✓`);

const leads = await readLeads();
console.log(`[leads] loaded ${leads.length} rows`);

const groups = { A: [], B: [], C: [] };
const targets = [];
for (const lead of leads) {
  // Already skip? Don't re-mark.
  if (lead.status === "skip" && lead.skipReason) continue;
  // Never overwrite an active client.
  if (lead.status === "client") continue;
  const cls = classify(lead);
  if (!cls) continue;
  groups[cls.group].push(lead);
  targets.push({ ...lead, ...cls });
}

const dedup = new Map();
for (const t of targets) {
  if (!dedup.has(t.id)) dedup.set(t.id, t);
}
const unique = [...dedup.values()];

console.log("\n=== Phase 4 retro-skip — computed groups ===");
console.log(`Group A (replied + followed up):     ${groups.A.length}`);
console.log(`Group B (dropped branches cold-mailed): ${groups.B.length}`);
console.log(`Group C (public-sector):                ${groups.C.length}`);
console.log(`Total unique (after dedup):             ${unique.length}`);

console.log("\n=== Sample per group ===");
for (const g of ["A", "B", "C"]) {
  console.log(`\n--- Group ${g} (first 5 of ${groups[g].length}) ---`);
  for (const lead of groups[g].slice(0, 5)) {
    console.log(`  ${lead.id.padStart(4)} ${lead.name.padEnd(40)} ${lead.branch.padEnd(25)} ${lead.email}`);
  }
}

if (DRY) {
  console.log("\n[dry] Run with --apply to write to sheet.");
  process.exit(0);
}

console.log("\n[apply] writing skipReason (col V) for all targets …");
await writeSkipReasonsBatch(unique.map((t) => ({ rowIndex: t.rowIndex, skipReason: t.reason })));

console.log("[apply] writing status=skip (col J) for all targets …");
await writeStatusBatch(unique.map((t) => ({ rowIndex: t.rowIndex })));

console.log("[apply] appending SkipReasons audit rows …");
const now = new Date().toISOString();
await appendSkipReasons(unique.map((t) => [now, t.id, t.reason, t.note, t.group]));

console.log(`\n[done] ${unique.length} leads marked skip (A:${groups.A.length} B:${groups.B.length} C:${groups.C.length})`);
