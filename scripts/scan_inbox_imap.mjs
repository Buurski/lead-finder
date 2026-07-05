#!/usr/bin/env node
/*
 * scan_inbox_imap.mjs — read-only IMAP inbox scan for a given account.
 *
 * Used by the daily-inbox-triage task to scan an account the Cowork Gmail tools
 * aren't logged into — primarily CHARLIE (1charlie.nielsen@gmail.com). Prints a
 * JSON envelope of recent INBOX messages to stdout; the triage agent classifies.
 *
 * NEVER sends or modifies mail (no flag changes, no deletes). Read-only.
 *
 * Usage:
 *   node scripts/scan_inbox_imap.mjs --account charlie [--days 7] [--max 40]
 *
 * Creds (from .env.local / .env, never printed):
 *   lucas   → GMAIL_USER / GMAIL_APP_PASSWORD
 *   charlie → CHARLIE_GMAIL_USER / CHARLIE_GMAIL_APP_PASSWORD
 *
 * Missing creds is NOT an error: prints {ok:false, reason:"no creds", items:[]}
 * and exits 0 so the morning task degrades gracefully until the app password
 * is configured.
 */
import fs from "node:fs";
import path from "node:path";
import { ImapFlow } from "imapflow";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);

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

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const account = (arg("account", "lucas") || "lucas").toLowerCase();
const days = Math.max(1, parseInt(arg("days", "7"), 10) || 7);
const max = Math.max(1, parseInt(arg("max", "40"), 10) || 40);

const CREDS = {
  lucas: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
  charlie: { user: process.env.CHARLIE_GMAIL_USER, pass: process.env.CHARLIE_GMAIL_APP_PASSWORD },
};

function out(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

const creds = CREDS[account];
if (!creds || !creds.user || !creds.pass) {
  out({ account, ok: false, reason: "no creds", items: [] });
  process.exit(0);
}

function snippetFrom(buf) {
  if (!buf) return "";
  let s = buf.toString("utf8");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
  return s.slice(0, 320);
}

// Local antivirus tools (Kaspersky, ESET) MITM TLS and break the default cert
// chain on some user machines. Set IMAP_INSECURE_TLS=1 in .env.local to bypass
// on those machines. Vercel/clean envs leave it unset (stays secure).
const insecureTls = ["1", "true", "yes"].includes((process.env.IMAP_INSECURE_TLS || "").toLowerCase());
const client = new ImapFlow({
  host: "imap.gmail.com",
  port: 993,
  secure: true,
  auth: { user: creds.user, pass: creds.pass },
  logger: false,
  connectionTimeout: 15000,
  socketTimeout: 30000,
  tls: { rejectUnauthorized: !insecureTls },
});

const items = [];
try {
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - days * 86400000);
    const uids = await client.search({ since }, { uid: true });
    const take = uids.slice(-max);
    for await (const msg of client.fetch(
      take,
      { uid: true, envelope: true, internalDate: true, bodyParts: ["1", "TEXT"] },
      { uid: true }
    )) {
      const env = msg.envelope || {};
      const fromObj = (env.from && env.from[0]) || {};
      const fromAddr = fromObj.address || "";
      // skip obvious system/no-reply noise; the agent filters further
      const part = (msg.bodyParts && (msg.bodyParts.get("1") || msg.bodyParts.get("TEXT"))) || null;
      items.push({
        id: String(msg.uid),
        account,
        from: fromAddr,
        fromName: fromObj.name || fromAddr,
        subject: env.subject || "(intet emne)",
        date: (env.date || msg.internalDate || new Date()).toISOString?.() || String(env.date || ""),
        snippet: snippetFrom(part),
      });
    }
  } finally {
    lock.release();
  }
  await client.logout();
  out({ account, ok: true, windowDays: days, count: items.length, items });
} catch (err) {
  try { await client.logout(); } catch { /* ignore */ }
  out({ account, ok: false, reason: String(err && err.message ? err.message : err), items });
  process.exit(0);
}
