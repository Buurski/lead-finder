#!/usr/bin/env node
/*
 * mark_duplicates.mjs — markér dubletter fra triage-rapporten (Lucas, 2026-08-19).
 * Sætter status="skip" + note på dublet-leads. SLETTER INTET.
 * Sikkerhed: skriver kun hvis navnet på rækken stadig matcher triage-rapporten.
 *
 *   node --env-file=.env.local scripts/mark_duplicates.mjs           (dry-run)
 *   node --env-file=.env.local scripts/mark_duplicates.mjs --skriv   (udfør)
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const lib = (p) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", p)).href;
const { getLeads, updateLeadStatus } = await import(lib("sheets.ts"));

const DO_WRITE = process.argv.includes("--skriv");
const rapport = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".triage", "triage-2026-08-19.json"), "utf-8"));
const dupes = rapport.buckets.C.filter((r) => r.reason === "duplicate");

const leads = await getLeads();
const byId = new Map(leads.map((l) => [String(l.id), l]));

let okCount = 0, mismatch = 0;
for (const d of dupes) {
  const live = byId.get(String(d.id));
  if (!live || live.name.trim() !== d.name.trim()) {
    console.log(`SPRINGER OVER (række flyttet?): id=${d.id} triage="${d.name}" sheet="${live?.name ?? "MANGLER"}"`);
    mismatch++;
    continue;
  }
  if (DO_WRITE) {
    await updateLeadStatus(Number(d.id) - 2, "skip", `dublet-mail (triage 2026-08-19): ${d.email}`);
    console.log(`MARKERET skip: ${d.name} (række ${d.id})`);
  } else {
    console.log(`VIL markere skip: ${d.name} (række ${d.id}, ${d.email})`);
  }
  okCount++;
}
console.log(`\n${DO_WRITE ? "Markeret" : "Dry-run"}: ${okCount} · mismatch: ${mismatch}`);
