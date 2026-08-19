#!/usr/bin/env node
/*
 * triage_leads.mjs — read-only triage af usendte leads (Lucas, 2026-08-19).
 * Kategoriserer hvert aldrig-kontaktet lead:
 *   A-email  = klar til send-køen (består canSendTo-gaten)
 *   A-phone  = ingen brugbar mail, men telefonnummer findes (ring/SMS-spor)
 *   B        = mangler kontaktinfo, men website findes (find-email-kandidat)
 *   C        = blokeret (kæde/offentlig/hostile/skip/bounced m.m.) eller for tynd
 * Skriver JSON-rapport, RØRER IKKE sheetet.
 *
 *   node --env-file=.env.local scripts/triage_leads.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const lib = (p) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", p)).href;

const { getLeads } = await import(lib("sheets.ts"));
const { canSendTo } = await import(lib("canSendTo.ts"));
const { isContactable } = await import(lib("leads/contactable.ts"));

const HARD_BLOCK = new Set(["hostile", "chain", "public", "skip", "bounced", "replied", "unsubscribed", "duplicate"]);
const hasPhone = (p) => !!(p || "").replace(/\D/g, "").match(/\d{8,}/);

const leads = await getLeads();
const pool = leads.filter(isContactable);

const seenEmails = new Set();
const buckets = { "A-email": [], "A-phone": [], B: [], C: [] };
for (const lead of pool) {
  const d = canSendTo(lead, { seenEmails });
  const row = { id: lead.id, name: lead.name, city: lead.city, email: lead.email || "", phone: lead.phone || "", website: lead.website || "", reason: d.ok ? "ok" : d.reason };
  if (d.ok) buckets["A-email"].push(row);
  else if (HARD_BLOCK.has(d.reason)) buckets.C.push(row);
  else if (hasPhone(lead.phone)) buckets["A-phone"].push(row);
  else if ((lead.website || "").trim()) buckets.B.push(row);
  else buckets.C.push({ ...row, reason: "thin" });
}

const summary = {
  dato: new Date().toISOString().slice(0, 10),
  leadsIalt: leads.length,
  aldrigKontaktet: pool.length,
  A_email: buckets["A-email"].length,
  A_phone: buckets["A-phone"].length,
  B_mangler_kontaktinfo: buckets.B.length,
  C_blokeret: buckets.C.length,
  C_grunde: buckets.C.reduce((m, r) => ((m[r.reason] = (m[r.reason] || 0) + 1), m), {}),
};

const outDir = path.join(REPO_ROOT, ".triage");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `triage-${summary.dato}.json`);
fs.writeFileSync(outFile, JSON.stringify({ summary, buckets }, null, 2));

console.log(JSON.stringify(summary, null, 2));
console.log(`\nFuld rapport: ${outFile}`);
