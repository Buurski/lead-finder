#!/usr/bin/env node
/*
 * send_brief_mail.mjs — generic sender for the daily/weekly brief emails.
 * RECIPIENTS ARE HARD-LOCKED to the allowlist (buur.aigro@gmail.com +
 * 1charlie.nielsen@gmail.com). Never a lead, never anyone else.
 * If GMAIL creds aren't present it prints the mail and exits 0 (no send).
 *
 * Usage:
 *   node scripts/send_brief_mail.mjs --subject "Morgenbrief 2026-06-08" --html path/to/mail.html [--text path/to/mail.txt] [--to lucas|both]
 *
 * Defaults: --to both
 */
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const ALLOWLIST = {
  lucas: ["buur.aigro@gmail.com"],
  both: ["buur.aigro@gmail.com", "1charlie.nielsen@gmail.com"],
};

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// load .env.local / .env (do not print secrets)
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.join(REPO_ROOT, f), "utf-8").split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch { /* optional */ }
}

// --- parse args ---
function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const subject = arg("subject");
const htmlPath = arg("html");
const textPath = arg("text");
const toKey = (arg("to", "both") || "both").toLowerCase();

if (!subject || !htmlPath) {
  console.error("Usage: node scripts/send_brief_mail.mjs --subject \"...\" --html file.html [--text file.txt] [--to lucas|both]");
  process.exit(1);
}
if (!ALLOWLIST[toKey]) {
  console.error(`--to must be one of: ${Object.keys(ALLOWLIST).join(", ")}. Recipients are hard-locked; arbitrary addresses are NOT supported.`);
  process.exit(1);
}

const recipients = ALLOWLIST[toKey];
const html = fs.readFileSync(htmlPath, "utf-8");
const text = textPath ? fs.readFileSync(textPath, "utf-8") : html.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.log("[send_brief_mail] No GMAIL creds — printing instead of sending.\n");
  console.log(`To: ${recipients.join(", ")}\nSubject: ${subject}\n\n${text.slice(0, 2000)}`);
  process.exit(0);
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

const info = await transporter.sendMail({
  from: `Buur Brief <${process.env.GMAIL_USER}>`,
  to: recipients.join(", "),
  subject,
  text,
  html,
});
console.log(`[send_brief_mail] Sent "${subject}" to ${recipients.join(", ")} — messageId=${info.messageId}`);
