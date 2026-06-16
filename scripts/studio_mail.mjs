// studio_mail.mjs — send a progress mail to Lucas (buur.aigro@gmail.com ONLY).
// Reads GMAIL_USER/GMAIL_APP_PASSWORD from .env.local. Allowlist-guarded.
//   node scripts/studio_mail.mjs --subject "..." --bodyFile path [--attach path]...
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// load .env.local
const envRaw = fs.readFileSync(path.join(ROOT, ".env.local"), "utf-8");
const env = {};
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const USER = env.GMAIL_USER, PASS = env.GMAIL_APP_PASSWORD;
if (!USER || !PASS) { console.error("missing GMAIL creds"); process.exit(1); }

const ALLOW = new Set(["buur.aigro@gmail.com", "1charlie.nielsen@gmail.com"]);

// parse args
const args = process.argv.slice(2);
let subject = "", bodyFile = "", to = "buur.aigro@gmail.com";
const attach = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--subject") subject = args[++i];
  else if (args[i] === "--bodyFile") bodyFile = args[++i];
  else if (args[i] === "--attach") attach.push(args[++i]);
  else if (args[i] === "--to") to = args[++i];
}
if (!ALLOW.has(to)) { console.error("recipient not in allowlist:", to); process.exit(1); }

const body = fs.readFileSync(path.resolve(ROOT, bodyFile), "utf-8");
const attachments = attach.filter(Boolean).map((p) => ({ path: path.resolve(ROOT, p), filename: path.basename(p) }));

const tx = nodemailer.createTransport({ service: "gmail", auth: { user: USER, pass: PASS } });
const info = await tx.sendMail({ from: USER, to, subject, text: body, attachments });
console.log("sent:", info.messageId, "→", to, "attach:", attachments.length);
