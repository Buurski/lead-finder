#!/usr/bin/env node
// Send Bundle C deliverable mail to buur.aigro@gmail.com with 3 example reports.
// Usage: node scripts/_send_bundle_c_mail.mjs <previewUrl>
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const require = createRequire(path.join(REPO_ROOT, "package.json"));
const nodemailer = require("nodemailer");

const envRaw = fs.readFileSync(path.join(REPO_ROOT, ".env.local"), "utf-8");
const env = {};
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
}

const previewUrl = (process.argv[2] || "").replace(/\/$/, "");
if (!previewUrl) { console.error("brug: node scripts/_send_bundle_c_mail.mjs <previewUrl>"); process.exit(1); }

const reportsDir = path.join(REPO_ROOT, "audits", "seo-tjek");
const attachments = ["jernbanecafeen.dk.html", "vida_ten_gamma.vercel.app.html", "trend_cut.dk.html"]
  .filter((f) => fs.existsSync(path.join(reportsDir, f)))
  .map((f) => ({ filename: f.replace(".html", "-rapport.html"), path: path.join(reportsDir, f) }));

const text = `Hej Lucas,

Bundle C er faerdig: gratis SEO-tjek-tragt paa lead-system, bygget paa branch feat/bundle-c-seo-tjek-2026-07-02 (ikke merged til main).

PREVIEW
Formular: ${previewUrl}/seo-tjek
Proev at indtaste en side + din mail. Rapporten aabner direkte, og day 0-mailen lander i denne indbakke (preview har SEO_TJEK_TEST_RECIPIENT=buur.aigro@gmail.com, saa ingen fremmede faar mail fra preview).

SAADAN VIRKER TRAGTEN
1. /seo-tjek: offentlig formular (URL + mail + valgfri branche/by + samtykke-checkbox). Uden for basic auth, resten af sitet er stadig laast.
2. Tjekket koerer PageSpeed mobil+desktop, schema/llms.txt/robots (AI-parathed), lokal placering via Places ("frisoer i Ikast"-soegning), booking-audit for salon/restaurant-brancher.
3. Rapport paa dansk uden jargon: score-cirkler, top 3 fixes, "Kan ChatGPT finde dig?", faerdigt schema-snippet, CTA "Book 15 minutter" + Gem som PDF-knap (print).
4. Day 0-mail med rapportlink + vigtigste fix. Day 7-mail med Vida-case + maanedlig ordning (cron 07:15, sender KUN med CRON_SECRET sat).
5. Afmeld-link i alle mails (et klik, GDPR). Samtykke-tidspunkt gemmes.

EKSEMPEL-RAPPORTER (vedhaeftet)
- Jernbanecafeen (Ikast): mobil 27 / desktop 25 - meget langsom side, godt salgsargument. Har allerede easyTable-booking.
- Vida (demo-sitet): mobil 78 / desktop 66, schema + llms.txt ok. Mangler titel/beskrivelse.
- Trend Cut (tilfaeldig Ikast-frisoer): mobil 57 / desktop 52, ligger nr. 1 paa "frisoer i Ikast" i Maps. Kun 1 fix fundet.

TRACKING
/api/seo-tjek/stats (bag basic auth): taellere for submissions, rapporter, day 0-mails, day 7-mails, afmeldinger + liste over alle indsendelser. Data ligger i KV/filstore, intet nyt system.

VAERN
Per-IP graense 3 tjek/time, globalt loft 50 tjek/dag (SEO_TJEK_DAILY_CAP), 24 timers dedupe paa url+mail, SSRF-guard paa URL-feltet, stoerrelses-loft paa side-hentning.

LIVE-TEST KOERT PAA PREVIEW
Submit -> rapport -> day 0-mail -> afmeld, alt verificeret. Day 0-mailen for trend-cut.dk ligger allerede i denne indbakke. Bemaerk: score-cirklerne viser "?" paa preview, fordi PAGESPEED_API_KEY kun er sat til Production i Vercel. Saet flueben i "Preview" paa den env-var i dashboardet, saa virker scores ogsaa der. De vedhaeftede rapporter (koert lokalt) viser de rigtige tal.

DU SKAL SELV (naar du vil live)
1. Saet SEO_TJEK_BOOKING_URL i Vercel prod (din Cal.com-link). Ellers falder CTA tilbage til mailto.
2. Giv PAGESPEED_API_KEY preview-target hvis du vil have scores paa preview (valgfrit).
3. Merge branchen naar du har godkendt.

BEKLAGER COLLABORATOR-MAILEN fra Vercel: den kom fra et CLI-deploy-forsoeg fra min session (forkert konto). Bare afvis den. Reglen "kun git-push, aldrig Vercel CLI" er nu gemt i min hukommelse.

Council-noter: kold-email-forbedringerne er parkeret i docs/backlog/cold-email-hardening.md som aftalt. Day 7-mailen naevner ingen pris - kan testes senere.

Mvh
Claude (Bundle C)
`;

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: env.GMAIL_USER, pass: env.GMAIL_APP_PASSWORD },
});

const info = await transporter.sendMail({
  from: `Lead-system <${env.GMAIL_USER}>`,
  to: "buur.aigro@gmail.com",
  subject: "AgenticOS Bundle C - Gratis SEO-tjek-tragt faerdig",
  text,
  attachments,
});
console.log("sent:", info.messageId, "attachments:", attachments.length);
