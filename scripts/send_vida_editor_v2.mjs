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

Du re-ingestede igen -> det er PRAECIS det der knaekker den. Nu fundet HVORFOR
og lavet permanent fix.

HVORFOR DET KNAEKKER HVER GANG:
Re-ingest-knappen (POST /api/master/site + /connect) henter din LIVE side
(vida-klinik.dk). Den live side er din publicerede HTML — som ALLEREDE har alle
~200 data-cms-ankre. proposeFields springer ankrede elementer over -> finder
naesten intet -> overskriver Mongo med schema=1-2. Editor laeser schema -> kun
1-2 felter klikbare. Hver re-ingest = ny collapse. Recovery-en-gang hjaelper
ikke saa laenge knappen er bugget.

PERMANENT FIX (kode, paa branch fix/ingest-idempotent — IKKE pushet/deployet):
Ny ingestOrRebuild(): hvis HTML allerede har data-cms-ankre -> laes dem tilbage
(rebuildFromAnchors) i stedet for at smide dem vaek. Foerstegangs-ingest af et
raat kundesite gaar uaendret. Re-ingest er nu idempotent — kan trykkes uden skade.
Skiftet i master/site, master/connect, master/reingest-pages. npm run build groen.

LIVE NU:
Koert recovery igen -> alle 6 sider redigerbare. Testede selv i browseren: klik
paa 4 forskellige elementer (VIDA-overskrift, "forskon livet", klinik-linje,
BOOK TID-knap) -> ALLE abnede rigtigt redigeringsfelt. Ingen "ukendt element".

>>> VIGTIGT INDTIL DU DEPLOYER FIXET:
    Tryk IKKE re-ingest paa vida. Det kollapser igen (gammel kode i prod).
    Naar du siger ja, pusher jeg fix/ingest-idempotent + deployer -> saa er
    knappen sikker for evigt.

Rapport (committet lokalt i KnowledgeOS, afventer din push-OK):
KnowledgeOS/wiki/proces/vida-editor-redigerbarhed-2026-06-16.md

— Claude`;
const info = await t.sendMail({
  from: `Lucas Buur <${U}>`,
  to: "buur.aigro@gmail.com",
  subject: "[Task done] CMS editor redigerbarhed — root cause = re-ingest-knap, permanent fix klar (afventer deploy)",
  text: body,
});
console.log("SENT", info.messageId);
