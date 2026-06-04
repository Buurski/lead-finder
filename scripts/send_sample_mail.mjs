#!/usr/bin/env node
/*
 * send_sample_mail.mjs — send Lucas a QA digest of the new tone-mixer v2 output.
 * RECIPIENT IS HARD-LOCKED to buur.aigro@gmail.com (Lucas's own inbox). Never a
 * lead, never anyone else. If GMAIL creds aren't present it prints the samples
 * and exits 0 (no send).
 *
 *   node scripts/send_sample_mail.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RECIPIENT = "buur.aigro@gmail.com"; // hard-locked

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// load .env.local (do not print secrets)
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

const { composeColdEmail } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "compose.ts")).href);

// 5 fictional leads chosen to exercise different opener kinds.
const leads = [
  { label: "achievement", lead: { name: "RR Studio", branch: "skønhed", city: "Aarhus", reviewsCount: 120, websiteStatus: "old", hooks: [], achievements: ["Danmarksmester 2026 i Lash Lift"] } },
  { label: "tech-problem", lead: { name: "VIDA Klinik", branch: "hudpleje", city: "Aalborg", reviewsCount: 30, websiteStatus: "dead", hooks: [] } },
  { label: "review-volume", lead: { name: "Salon Artec", branch: "frisør", city: "Herning", reviewsCount: 210, websiteStatus: "ok", hooks: [] } },
  { label: "quote", lead: { name: "Street Cut", branch: "barber", city: "Ikast", reviewsCount: 60, websiteStatus: "ok", hooks: [`en kunde fremhæver: "bedste fade jeg har fået"`] } },
  { label: "brand", lead: { name: "Atelier Foto", branch: "fotograf", city: "Skanderborg", reviewsCount: 12, websiteStatus: "ok", hooks: [] } },
];

const samples = leads.map(({ label, lead }) => {
  const c = composeColdEmail(lead);
  return { label, kind: c.openerKind, name: lead.name, subject: c.subject, text: c.text };
});

const body = [
  "Hej Lucas,",
  "",
  "5 sample-mails fra tone-mixer v2 (Del 3, Block 2+3). Hver er bygget deterministisk,",
  "valideret (ingen pris/kr/robot-CTA), og sendt som-er i den nye compose-pipeline.",
  "",
  ...samples.flatMap((s) => [
    `── [${s.kind}]  ${s.name}  ──`,
    `Emne: ${s.subject}`,
    "",
    s.text,
    "",
    "",
  ]),
  "Mvh, dit command center",
].join("\n");

console.log(`\nComposed ${samples.length} samples (kinds: ${samples.map((s) => s.kind).join(", ")})\n`);

const user = process.env.GMAIL_USER;
const pass = process.env.GMAIL_APP_PASSWORD;
if (!user || !pass) {
  console.log("No GMAIL creds — printing instead of sending.\n");
  console.log(body);
  process.exit(0);
}

const nodemailer = (await import("nodemailer")).default;
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com", port: 465, secure: true,
  auth: { user, pass },
});

try {
  await transporter.sendMail({
    from: `Lucas Buur <${user}>`,
    to: RECIPIENT, // hard-locked
    subject: "[BUILD] Tone-mixer v2 — 5 sample-mails (Del 3)",
    text: body,
  });
  console.log(`Sent QA digest to ${RECIPIENT}.`);
} catch (e) {
  console.error("Send failed:", String(e));
  process.exit(0); // never hard-fail the build flow
}
