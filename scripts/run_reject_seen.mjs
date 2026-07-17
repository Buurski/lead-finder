#!/usr/bin/env node
/*
 * run_reject_seen.mjs — engangs-oprydning (Lucas, 2026-07-18): afvis alle
 * pending drafts i køen hvis forretning allerede findes i kontakt-historikken.
 * Samme logik som POST /api/approve/queue {action:"reject-seen"} — kørt lokalt
 * mod samme store (KV når env er sat, ellers .send_queue/approval_queue.json).
 *
 *   node --env-file=.env.local scripts/run_reject_seen.mjs [--dry-run]
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;

const { readQueue, writeQueue } = await import(libUrl("queue.ts"));
const { getLeads } = await import(libUrl("sheets.ts"));
const { buildContactIndex } = await import(libUrl(path.join("leads", "contact-history.ts")));

const dryRun = process.argv.includes("--dry-run");
const index = buildContactIndex(await getLeads());
const drafts = await readQueue();
const now = new Date().toISOString();
const rejected = [];
for (const d of drafts) {
  if (d.status !== "pending") continue;
  const rec = index.lookup(d.name, d.city, d.recipientEmail);
  if (!rec) continue;
  if (!dryRun) { d.status = "rejected"; d.updatedAt = now; }
  rejected.push(`${d.name} (${d.city}) — ${rec.reason}`);
}
if (!dryRun) await writeQueue(drafts);
console.log(`${dryRun ? "[dry-run] ville afvise" : "afvist"}: ${rejected.length} af ${drafts.filter((d) => d.status === "pending" || rejected.includes(d.name)).length} pending`);
for (const n of rejected.slice(0, 40)) console.log("  -", n);
if (rejected.length > 40) console.log(`  … +${rejected.length - 40} flere`);
