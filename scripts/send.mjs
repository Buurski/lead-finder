#!/usr/bin/env node
/*
 * scripts/send.mjs — sole Gmail caller.
 *
 * Polls the SendQueue tab on the Leads sheet, claims pending rows, and
 * dispatches them via Gmail SMTP with a triangular 4-14 min jittered
 * spacing. After a successful send, marks the SendQueue row as "sent"
 * AND writes back to the Leads sheet (emailSentAt / followupSentAt +
 * emailStatus="sent").
 *
 * Master pause-flag (PauseSchedule!A2) is checked before EVERY send. If
 * the flag flips to a future date / sentinel mid-batch, the loop bails
 * cleanly without touching Gmail.
 *
 * Lives in the repo under scripts/ so it's version-tracked. Lucas copies
 * this to .send_queue/send.mjs locally and runs it as a long-lived
 * background process. The local file may be a snapshot — re-copy after
 * pulling new commits.
 *
 * Env (loaded from ../lead-system/.env.local relative to this file when
 * placed in .send_queue/, or from the CWD when run from scripts/):
 *   GOOGLE_SHEET_ID
 *   GOOGLE_KEY_FILE   path to service-account JSON
 *   GMAIL_USER
 *   GMAIL_APP_PASSWORD
 *   APP_URL           (optional, used in nothing here directly)
 */

import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----- env --------------------------------------------------------------

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

// Try a few common locations for the .env.local. The file is searched in
// order: same dir as this script, parent, grandparent.
for (const candidate of [
  path.join(__dirname, ".env.local"),
  path.join(__dirname, "..", ".env.local"),
  path.join(__dirname, "..", "..", ".env.local"),
]) loadEnvFile(candidate);

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const KEY_FILE = process.env.GOOGLE_KEY_FILE;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_PASS = process.env.GMAIL_APP_PASSWORD;

if (!SHEET_ID || !KEY_FILE || !GMAIL_USER || !GMAIL_PASS) {
  console.error("Missing env: GOOGLE_SHEET_ID / GOOGLE_KEY_FILE / GMAIL_USER / GMAIL_APP_PASSWORD");
  process.exit(1);
}

// ----- log --------------------------------------------------------------

const LOG_FILE = path.join(__dirname, "send_log.txt");
function ts() { return new Date().toISOString().replace("T", " ").substring(0, 19); }
function log(msg) {
  const line = "[" + ts() + "] " + msg;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + "\n"); } catch {}
}

// ----- sleep / spacing --------------------------------------------------

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// 4-14 min triangular centered ~8 min. Same distribution Lucas has run
// for the past month without any deliverability incidents.
function nextDelayMs() {
  const t = (Math.random() + Math.random()) / 2;
  const minutes = 4 + t * 10;
  return Math.round(minutes * 60 * 1000);
}

// ----- sheets client ----------------------------------------------------

const auth = new google.auth.GoogleAuth({
  keyFile: KEY_FILE,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

async function readMasterPause() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "PauseSchedule!A2",
  });
  return (res.data.values?.[0]?.[0] ?? "").toString().trim();
}

function isPaused(rawUntil) {
  if (!rawUntil) return false;
  if (/^(indefinite|paused|forever|true|stop|halt)$/i.test(rawUntil)) return true;
  const t = Date.parse(rawUntil);
  if (Number.isNaN(t)) return true;            // fail CLOSED on master
  return t > Date.now();
}

async function readPendingSendQueue() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "SendQueue!A2:L",
  });
  const rows = res.data.values ?? [];
  return rows
    .map((r, i) => ({
      rowIndex: i,
      id: r[0] ?? "",
      enqueuedAt: r[1] ?? "",
      leadId: r[2] ?? "",
      toEmail: r[3] ?? "",
      kind: r[4] ?? "cold",
      subject: r[5] ?? "",
      body: r[6] ?? "",
      htmlBody: r[7] ?? "",
      status: r[8] ?? "pending",
    }))
    .filter((r) => r.status === "pending" && r.id && r.toEmail);
}

async function markQueueItem(rowIndex, updates) {
  // rowIndex is 0-based after header → sheet row = rowIndex + 2
  const row = rowIndex + 2;
  const data = [];
  if (updates.status !== undefined)     data.push({ range: `SendQueue!I${row}`, values: [[updates.status]] });
  if (updates.claimedAt !== undefined)  data.push({ range: `SendQueue!J${row}`, values: [[updates.claimedAt]] });
  if (updates.sentAt !== undefined)     data.push({ range: `SendQueue!K${row}`, values: [[updates.sentAt]] });
  if (updates.skipReason !== undefined) data.push({ range: `SendQueue!L${row}`, values: [[updates.skipReason]] });
  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

async function markLeadSent(leadId, kind) {
  // leadId equals the sheet row number for the Leads tab (id = String(rowIndex + 2)).
  if (!leadId || leadId === "test") return;       // synthetic, no Leads row
  const row = parseInt(leadId, 10);
  if (!Number.isFinite(row) || row < 2) return;
  const now = new Date().toISOString();
  const data = [];
  if (kind === "followup") {
    data.push({ range: `Leads!S${row}`, values: [[now]] });
  } else {
    data.push({ range: `Leads!O${row}`, values: [[now]] });
    data.push({ range: `Leads!R${row}`, values: [["sent"]] });
  }
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}

// ----- main loop --------------------------------------------------------

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_PASS },
});

const POLL_MS = 60 * 1000;
const MAX_EMPTY_POLLS = 10;

async function main() {
  log("send.mjs starting. polling SendQueue every 60s.");
  let emptyPolls = 0;

  // Warm-up — randomise first send window so a fresh start at 10:00:00 UTC
  // doesn't itself look like a burst across multiple boots.
  const warmupMs = Math.round((60 + Math.random() * 120) * 1000);
  log(`warm-up ${Math.round(warmupMs / 1000)}s before first send`);
  await sleep(warmupMs);

  while (true) {
    const masterPause = await readMasterPause();
    if (isPaused(masterPause)) {
      log(`master pause active (until=${masterPause}). idle 60s.`);
      await sleep(POLL_MS);
      continue;
    }

    const pending = await readPendingSendQueue();
    if (pending.length === 0) {
      emptyPolls++;
      if (emptyPolls >= MAX_EMPTY_POLLS) {
        log(`no pending for ${MAX_EMPTY_POLLS} polls. exiting.`);
        break;
      }
      log(`no pending. poll ${emptyPolls}/${MAX_EMPTY_POLLS}, sleep 60s.`);
      await sleep(POLL_MS);
      continue;
    }
    emptyPolls = 0;

    // Claim oldest first.
    pending.sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
    const item = pending[0];

    const claimedAt = new Date().toISOString();
    await markQueueItem(item.rowIndex, { status: "claimed", claimedAt });

    // Re-check master pause AFTER claiming and BEFORE dispatch — closes
    // a tiny race window where someone hits halt during the claim.
    const recheck = await readMasterPause();
    if (isPaused(recheck)) {
      // Release the claim — set back to pending so a future run picks it up.
      await markQueueItem(item.rowIndex, { status: "pending", claimedAt: "" });
      log(`master pause flipped mid-claim. released ${item.id}. idle 60s.`);
      await sleep(POLL_MS);
      continue;
    }

    try {
      const info = await transporter.sendMail({
        from: `Lucas Buur <${GMAIL_USER}>`,
        to: item.toEmail,
        subject: item.subject,
        text: item.body,
        html: item.htmlBody,
        headers: {
          "List-Unsubscribe": `<mailto:${GMAIL_USER}?subject=unsubscribe>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          "X-Entity-Ref-ID": item.leadId,
        },
      });
      const sentAt = new Date().toISOString();
      await markQueueItem(item.rowIndex, { status: "sent", sentAt });
      try { await markLeadSent(item.leadId, item.kind); } catch (e) { log(`leads write failed for ${item.leadId}: ${e.message}`); }
      log(`SENT  ${item.id}  ${item.kind}  ${item.toEmail}  (msg=${info.messageId})`);
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      await markQueueItem(item.rowIndex, { status: "pending", claimedAt: "", skipReason: `send-fail:${msg.slice(0, 80)}` });
      log(`FAIL  ${item.id}  ${item.toEmail}  ERROR: ${msg}`);
      if (/rate|limit|550|421|quota/i.test(msg)) {
        log("rate-limit detected. back-off 30 min.");
        await sleep(30 * 60 * 1000);
        continue;
      }
    }

    // Inter-send spacing — 4-14 min triangular.
    const delay = nextDelayMs();
    log(`sleep ${(delay / 60000).toFixed(1)} min`);
    await sleep(delay);
  }
}

main().catch((e) => {
  log(`FATAL: ${e.stack || e.message}`);
  process.exit(1);
});
