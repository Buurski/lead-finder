#!/usr/bin/env node
/*
 * backfill-lead-replies.mjs — engangs-indsamling af leads' svar-mails i lead_reply (spec 2026-10-15-har-svaret-kontekst-design.md §5).
 * Læser Gmail (INBOX, begge konti) og DB. DRY-RUN er standard: skriver intet og printer kun tal.
 * `--apply` skriver til DATABASE_URL — kræver at migration 0017 er kørt og Lucas' ja.
 *
 *   node --env-file=.env.local --conditions=react-server scripts/backfill-lead-replies.mjs [--days 365] [--apply]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { captureReplies } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "capture-replies.ts")).href);

const apply = process.argv.includes("--apply");
const di = process.argv.indexOf("--days");
const days = di > -1 ? Number(process.argv[di + 1]) : 365;
if (!Number.isInteger(days) || days < 1 || days > 1000) { console.error("--days skal være et helt tal 1-1000"); process.exit(1); }

const since = new Date(Date.now() - days * 86_400_000);
console.log(`${apply ? "APPLY" : "DRY-RUN"} · ${days} dage tilbage (siden ${since.toISOString().slice(0, 10)})`);

let r;
try {
  r = await captureReplies({ since, dryRun: !apply });
} catch (err) {
  // Mangler lead_reply (migration 0017 ikke kørt) fejler opslaget her; en dry-run uden tabellen kan ikke tælle "existing".
  console.error("fejlede:", String(err).slice(0, 300));
  process.exit(1);
}
console.log(JSON.stringify(r, null, 1));
console.log(apply ? `gemt ${r.inserted} nye svar` : `ville gemme ${r.wouldInsert} nye svar fra ${r.companies} virksomheder (intet skrevet)`);
process.exit(Object.keys(r.errors).length ? 2 : 0);
