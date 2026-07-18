#!/usr/bin/env node
/*
 * backfill_sent_stamps.mjs — engangs-backfill (2026-07-18): match ALLE leads i
 * Sheets mod all-time Gmail sendt-listen (audit_sent_alltime.mjs-output) og
 * stempl emailSentAt/emailStatus på leads der ER mailet men står blanke.
 * Lukker hullet hvor gamle manuelle/systemmails aldrig blev registreret.
 *
 *   node --env-file=.env.local scripts/backfill_sent_stamps.mjs <sent.json> [--dry-run]
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const { getLeads, updateLeadEmailStatusBulk } = await import(libUrl("sheets.ts"));
const { isContactable } = await import(libUrl(path.join("leads", "contactable.ts")));

const sentFile = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!sentFile) { console.error("brug: backfill_sent_stamps.mjs <sent.json> [--dry-run]"); process.exit(1); }
const sent = JSON.parse(fs.readFileSync(sentFile, "utf8")); // adresse → seneste ISO

const leads = await getLeads();
const writes = [];
for (let i = 0; i < leads.length; i++) {
  const l = leads[i];
  const e = (l.email || "").toLowerCase().trim();
  if (!e || !sent[e]) continue;
  if (!isContactable(l)) continue; // allerede registreret som kontaktet
  writes.push({ rowIndex: i, fields: { emailSentAt: sent[e], ...(l.emailStatus && l.emailStatus.trim() ? {} : { emailStatus: "sent" }) } });
  console.log(`${dryRun ? "[dry] " : ""}${l.name} (${l.city}) — ${e} → sendt ${sent[e].slice(0, 10)}`);
}
if (!dryRun) await updateLeadEmailStatusBulk(writes);
console.log(`${dryRun ? "ville stemple" : "stemplet"}: ${writes.length} leads`);
