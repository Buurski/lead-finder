#!/usr/bin/env node
/*
 * diagnose.mjs — READ-ONLY data diagnostic. Writes nothing, deletes nothing.
 *
 * Answers three questions before any cleanup or feature work:
 *   1. Leads tab: how many rows, status/emailStatus breakdown, how many carry an
 *      emailSentAt (= the "~8340 mails" Lucas wants located).
 *   2. Clients tab: how many rows, and which have monthlyFee > 0 (= real paying).
 *   3. Approval queue files in .send_queue: are they actually empty?
 *
 * Auth: service account JSON at .send_queue/.sa.json, read-only Sheets scope.
 * Run from repo root:  node scripts/diagnose.mjs
 */

import fs from "node:fs";
import { google } from "googleapis";

const SHEET = "1it8BeujksJjZuMAFaFaA0j11UDAA_afFP1BqgViVFJ8";
const SA_PATH = ".send_queue/.sa.json";

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
}

function parseFee(s) {
  const n = parseFloat(
    String(s ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")
  );
  return Number.isFinite(n) ? n : 0;
}

async function main() {
  if (!fs.existsSync(SA_PATH)) {
    console.error(`Service account not found at ${SA_PATH} — run from repo root.`);
    process.exit(1);
  }
  const sa = JSON.parse(fs.readFileSync(SA_PATH, "utf8"));
  const auth = new google.auth.GoogleAuth({
    credentials: sa,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  // ---- 1. LEADS ---------------------------------------------------------
  const leadsRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: "Leads!A2:U" });
  const leads = leadsRes.data.values || [];
  // Column indexes: I=status(8), O=emailSentAt(14), R=emailStatus(17)
  const byStatus = {};
  const byEmailStatus = {};
  let withSentAt = 0;
  let withEmail = 0; // N=email(13)
  for (const row of leads) {
    const status = (row[8] || "(blank)").trim() || "(blank)";
    const emailStatus = (row[17] || "(blank)").trim() || "(blank)";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byEmailStatus[emailStatus] = (byEmailStatus[emailStatus] || 0) + 1;
    if ((row[14] || "").trim()) withSentAt++;
    if ((row[13] || "").trim()) withEmail++;
  }

  console.log("\n=========== LEADS tab ===========");
  console.log(`Total rows: ${leads.length}`);
  console.log(`With email address (col N): ${withEmail} (${pct(withEmail, leads.length)})`);
  console.log(`With emailSentAt (col O)  : ${withSentAt} (${pct(withSentAt, leads.length)})  <-- the "mails sent" count`);
  console.log("\n-- by status (col I) --");
  for (const [k, v] of Object.entries(byStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);
  console.log("\n-- by emailStatus (col R) --");
  for (const [k, v] of Object.entries(byEmailStatus).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(16)} ${v}`);

  // ---- 2. CLIENTS -------------------------------------------------------
  const cliRes = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET, range: "Clients!A2:I" });
  const clients = cliRes.data.values || [];
  // A=name(0), G=monthlyFee(6), H=setupFee(7)
  let paying = 0;
  let mrr = 0;
  console.log("\n=========== CLIENTS tab ===========");
  console.log(`Total rows: ${clients.length}`);
  console.log("\n-- rows --");
  for (const row of clients) {
    const name = row[0] || "(no name)";
    const monthly = parseFee(row[6]);
    const setup = parseFee(row[7]);
    const isPaying = monthly > 0;
    if (isPaying) { paying++; mrr += monthly; }
    console.log(`  ${isPaying ? "💰" : "  "} ${name.padEnd(28)} md:${String(monthly).padStart(6)}  setup:${String(setup).padStart(6)}`);
  }
  console.log(`\nPaying clients (monthlyFee>0): ${paying} of ${clients.length}`);
  console.log(`MRR (sum of monthlyFee): ${mrr} kr`);

  // ---- 3. APPROVAL QUEUE FILES -----------------------------------------
  console.log("\n=========== APPROVAL QUEUE (local .send_queue) ===========");
  for (const f of [".send_queue/approval_queue.json", ".send_queue/queue.json"]) {
    if (!fs.existsSync(f)) { console.log(`  ${f}: (missing)`); continue; }
    try {
      const data = JSON.parse(fs.readFileSync(f, "utf8"));
      const arr = Array.isArray(data) ? data : (data.items || data.queue || []);
      const len = Array.isArray(arr) ? arr.length : "(not array)";
      console.log(`  ${f}: ${len} entries`);
    } catch (e) {
      console.log(`  ${f}: parse error ${e.message}`);
    }
  }
  console.log("\nDone. Read-only — nothing changed.\n");
}

main().catch((e) => { console.error("DIAGNOSE FAILED:", e.message); process.exit(1); });
