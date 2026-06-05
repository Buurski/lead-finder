#!/usr/bin/env node
/*
 * send_del4_ping.mjs — short "Del 4 done" ping to Lucas. RECIPIENT HARD-LOCKED to
 * buur.aigro@gmail.com. Prints + exits 0 if no GMAIL creds.
 *
 *   node scripts/send_del4_ping.mjs
 */
import fs from "node:fs";
import path from "node:path";

const RECIPIENT = "buur.aigro@gmail.com"; // hard-locked
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

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

const body = [
  "Hej Lucas,",
  "",
  "Del 4 er færdig på branch command-center-v3 (intet pushet/deployet).",
  "",
  "Block 1 — Mission Control mobil-redesign: hero-tal, 14-dages usage-sparkline,",
  "  korte tabs + sekundær-nav på mobil, tættere padding, 640px breakpoints.",
  "Block 2 — funktionelle fixes: rigtig omsætning i Goals (ingen 0'er), PageSpeed-",
  "  fallback til Lighthouse på Vercel, KV SCAN (ikke KEYS), /replies ARM live-send",
  "  med klar 412 (ikke stille).",
  "Block 3 — polish: /claude marketing-kort -> ærlig deployment-pending, klar",
  "  Gmail-fejl-UI på /replies, eksakte Anthropic-tokens i AI Spend.",
  "",
  "Build + lint + alle test-suites grønne. Live-kø urørt (12).",
  "Fuld rapport: NIGHT_BUILD_REPORT_v4.md. Åbn / på telefonen — der ses forskellen.",
  "",
  "Mvh, dit command center",
].join("\n");

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
if (!user || !pass) {
  console.log("No GMAIL creds — printing instead of sending.\n\n" + body);
  process.exit(0);
}

const nodemailer = (await import("nodemailer")).default;
const transporter = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } });
try {
  await transporter.sendMail({ from: `Lucas Buur <${user}>`, to: RECIPIENT, subject: "[BUILD] Del 4 færdig — Mission Control mobil + dead-button fixes", text: body });
  console.log(`Sent Del 4 ping to ${RECIPIENT}.`);
} catch (e) {
  console.error("Send failed:", String(e));
  process.exit(0);
}
