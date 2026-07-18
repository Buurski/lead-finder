#!/usr/bin/env node
/*
 * audit_sent_alltime.mjs — engangs-audit (Lucas, 2026-07-18): scan HELE
 * Sendt-mappen (all-time, begge Gmail-konti) og dump alle modtager-adresser
 * med seneste dato. Bruges til at 100%-verificere at ingen pending draft går
 * til nogen vi nogensinde har skrevet til. Read-only på Gmail.
 *
 *   node --env-file=.env.local scripts/audit_sent_alltime.mjs <ud.json>
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { ImapFlow } from "imapflow";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { getActiveSenders } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "senders.ts")).href);

const outFile = process.argv[2];
if (!outFile) { console.error("brug: audit_sent_alltime.mjs <ud.json>"); process.exit(1); }

const recipients = new Map(); // adresse → seneste ISO-dato

for (const account of getActiveSenders()) {
  const client = new ImapFlow({
    host: "imap.gmail.com", port: 993, secure: true,
    auth: { user: account.user, pass: account.appPassword },
    logger: false, connectionTimeout: 20_000, socketTimeout: 120_000,
  });
  await client.connect();
  try {
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === "\\Sent");
    if (!sent) { console.warn(`${account.id}: ingen \\Sent-mappe`); continue; }
    await client.mailboxOpen(sent.path, { readOnly: true });
    let n = 0;
    for await (const msg of client.fetch("1:*", { envelope: true })) {
      n++;
      const date = msg.envelope?.date ? new Date(msg.envelope.date).toISOString() : "";
      for (const r of [...(msg.envelope?.to ?? []), ...(msg.envelope?.cc ?? []), ...(msg.envelope?.bcc ?? [])]) {
        const a = r?.address?.toLowerCase().trim();
        if (!a) continue;
        const prev = recipients.get(a) ?? "";
        if (date > prev) recipients.set(a, date);
      }
    }
    console.log(`${account.id}: ${n} sendte mails scannet`);
  } finally {
    try { await client.logout(); } catch { /* lukket */ }
  }
}

fs.writeFileSync(outFile, JSON.stringify(Object.fromEntries(recipients), null, 1));
console.log(`skrev ${recipients.size} unikke modtagere → ${outFile}`);
