#!/usr/bin/env node
/*
 * seed-rr-studio.mjs — add RR Studio (Rikke Rask) to the Leads sheet as a real
 * lead, so the new auto reply-sync catches her. She was contacted manually from
 * Gmail (not via the engine), which is exactly why she never appeared in the CRM.
 *
 * Idempotent: skips if a lead with her email already exists.
 *
 *   node --env-file-if-exists=.env.production scripts/seed-rr-studio.mjs
 *   (or just: node scripts/seed-rr-studio.mjs   — it loads .env.production itself)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

function loadEnvFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {}
}
// .env.local first so its GOOGLE_KEY_FILE (a real file path locally) wins; then
// .env.production fills any gaps.
for (const c of [
  path.join(REPO_ROOT, ".env.local"),
  path.join(REPO_ROOT, ".env.production"),
]) loadEnvFile(c);

// If GOOGLE_SERVICE_ACCOUNT_JSON is present but not valid JSON (e.g. a local
// .env file that escaped the newlines), drop it so getAuth() falls back to the
// GOOGLE_KEY_FILE path instead of crashing on JSON.parse.
if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch {
    if (process.env.GOOGLE_KEY_FILE) {
      console.warn("GOOGLE_SERVICE_ACCOUNT_JSON er ikke gyldig JSON — bruger GOOGLE_KEY_FILE i stedet.");
      delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    }
  }
}

try { process.chdir(REPO_ROOT); } catch {}

const sheets = await import(pathToFileURL(path.join(REPO_ROOT, "src/lib/sheets.ts")).href);
const { getLeads, appendLeads, updateLeadEmailStatus } = sheets;

const EMAIL = "kontakt@rrstudio.dk";

const existing = await getLeads();
const match = existing.findIndex((l) => (l.email || "").toLowerCase().trim() === EMAIL);
if (match !== -1) {
  console.log(`RR Studio findes allerede som lead (række-index ${match}). Sætter status korrekt.`);
  await updateLeadEmailStatus(match, { emailSentAt: "2026-05-22", emailStatus: "replied" });
  console.log("Opdateret: emailStatus=replied. Færdig.");
  process.exit(0);
}

await appendLeads([
  {
    name: "RR Studio (Rikke Rask)",
    branch: "skønhed",
    phone: "22 18 04 88",
    city: "",
    score: 88,
    source: "manual",
    website: "https://rrstudio.dk",
    websiteStatus: "ok",
    status: "interested",
    notes:
      "Danmarksmester 2026 lash lift + brow lamination. Elleebana Global Instruktør. " +
      "Kontaktet manuelt via Gmail 22/5. Sagde JA til gratis mockup 3/6 (\"prøv! :)\"). " +
      "Skønheds-lead. Seedet 5/6 så auto reply-sync fanger hende.",
    lastUpdated: new Date().toISOString().slice(0, 10),
    websiteQualityTier: "",
    enrichedInfo: "",
    email: EMAIL,
    emailSentAt: "",
    emailOpenedAt: "",
    emailClickedAt: "",
    emailStatus: "",
    followupSentAt: "",
    reviewsCount: 0,
    callbackDate: "",
  },
]);

// appendLeads can't set the email-tracking columns, so set them now: she was
// emailed 22/5 and has already replied.
const after = await getLeads();
const idx = after.findIndex((l) => (l.email || "").toLowerCase().trim() === EMAIL);
if (idx !== -1) {
  await updateLeadEmailStatus(idx, { emailSentAt: "2026-05-22", emailStatus: "replied" });
}

console.log(`RR Studio tilføjet som lead (række-index ${idx}), markeret som replied. Færdig.`);
