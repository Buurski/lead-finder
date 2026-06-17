import nodemailer from "nodemailer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const c of [path.join(__dirname, "..", ".env.local"), path.join(__dirname, ".env.local")]) {
  try { for (const line of fs.readFileSync(c, "utf-8").split(/\r?\n/)) {
    const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (!m || process.env[m[1]]) continue;
    let v = m[2].trim(); if ((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'"))) v=v.slice(1,-1);
    process.env[m[1]] = v; } } catch {}
}
const U = process.env.GMAIL_USER, P = process.env.GMAIL_APP_PASSWORD;
const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: U, pass: P } });
const body = `Lucas —

VIDA CMS-editor: LØST. Alle 6 sider redigerbare igen.

ROOT CAUSE: re-ingest virkede IKKE — den lavede skaden.
proposeFields springer allerede-ankrede elementer over. Ingest kort 2x pa vida
-> schema kollapsede til 1-2 felter mens repo-HTML beholdt alle ~200 data-cms-ankre.
Editor laeser schema -> kun 2 felter klikbare, resten "ukendt element" -> "kan ikke redigere".

FIX: kort den eksisterende idempotente recovery (commit d0a2ea7):
  npx tsx scripts/anchor-recover.ts vida --commit
Rebuildede schema fra repo-ankrene (kilden til sandhed). Resultat:
  forside 2->198, behandlinger 1->304, gavekort 2->61, om 1->78, booking 1->56.
Kun Mongo-skrivning. INGEN git push / deploy (dit forbud overholdt).

E2E-BEVIS (live prod, mintet session):
  verify-editor: alle sider status=200, serveret-ankre ~= schema -> REDIGERBAR.
  Browser: klik pa "forskon livet" -> inline tekst-editor abnede (BRODTEKST-felt,
  font/B/K/U, storrelse-sliders, Gem kladde). AEgte felt, ikke "ukendt element".
  Screenshots: vida-editor-proof.png + vida-editor-field.png (i buur-cms repo-roden).

GENKOMMER DET? Nej. Editor-save rorer aldrig schema (kun draft). Kun ingest kan
kollapse, og anchor-migrate har nu en GUARD mod re-ingest af ankret repo.

NB: recovery nulstillede draft til repo-tilstand. OK — editor var brudt, ingen
reelle u-publicerede aendringer fandtes.

Rapport: KnowledgeOS/wiki/proces/vida-editor-redigerbarhed-2026-06-16.md

Forslag (kraever dit ja, ikke gjort): guard i proposeFields der aborter hvis
schema-output << anker-tal; stram verify-editor ok-betingelse.

— Claude`;
const info = await t.sendMail({
  from: `Lucas Buur <${U}>`,
  to: "buur.aigro@gmail.com",
  subject: "[Task done] CMS editor redigerbarhed — LØST (vida, alle 6 sider)",
  text: body,
});
console.log("SENT", info.messageId);
