#!/usr/bin/env node
/*
 * test_contact_history.mjs — offline tests for src/lib/leads/contact-history.ts.
 * Warmth rules + lastContact + replied-state + index lookup (key/email/domain).
 * Pure: no Sheets, no network.
 *
 *   node scripts/test_contact_history.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ch = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "leads", "contact-history.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const NOW = new Date("2026-07-18T12:00:00Z");
const lead = (over = {}) => ({
  id: "1", name: "Salon Saks", branch: "frisør", city: "Herning", phone: "", score: 50,
  source: "", website: "", websiteStatus: "none", status: "", notes: "", lastUpdated: "",
  websiteQualityTier: "", enrichedInfo: "", email: "info@salonsaks.dk",
  emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
  followupSentAt: "", reviewsCount: 0, callbackDate: "", ...over,
});

// ── warmthOf ──────────────────────────────────────────────────────────────
check("nej → død uanset dage", ch.warmthOf("nej", 1) === "død");
check("ja + 3 dage → varm", ch.warmthOf("ja", 3) === "varm");
check("ja + 7 dage → varm (grænse)", ch.warmthOf("ja", 7) === "varm");
check("ja + 8 dage → lun", ch.warmthOf("ja", 8) === "lun");
check("ja + 30 dage → lun (grænse)", ch.warmthOf("ja", 30) === "lun");
check("ja + 31 dage → kold", ch.warmthOf("ja", 31) === "kold");
check("ja + ukendt dato → lun", ch.warmthOf("ja", null) === "lun");
check("aldrig + 5 dage → lun (grænse)", ch.warmthOf("aldrig", 5) === "lun");
check("aldrig + 6 dage → kold", ch.warmthOf("aldrig", 6) === "kold");
check("aldrig + ukendt dato → kold", ch.warmthOf("aldrig", null) === "kold");

// ── repliedState ──────────────────────────────────────────────────────────
check("emailStatus replied → ja", ch.repliedState(lead({ emailStatus: "replied" })) === "ja");
check("status interesseret → ja", ch.repliedState(lead({ status: "interesseret" })) === "ja");
check("status kunde → ja", ch.repliedState(lead({ status: "kunde" })) === "ja");
check("status nej → nej", ch.repliedState(lead({ status: "nej" })) === "nej");
check("status ikke-interesseret → nej", ch.repliedState(lead({ status: "ikke-interesseret" })) === "nej");
check("kun sendt → aldrig", ch.repliedState(lead({ emailStatus: "sent" })) === "aldrig");

// ── lastContactDate ───────────────────────────────────────────────────────
check("followup nyere end sent vinder",
  ch.lastContactDate(lead({ emailSentAt: "2026-07-01", followupSentAt: "2026-07-10" }))?.toISOString().slice(0, 10) === "2026-07-10");
check("kun sent → sent", ch.lastContactDate(lead({ emailSentAt: "2026-07-01" }))?.toISOString().slice(0, 10) === "2026-07-01");
check("ingen datoer → null", ch.lastContactDate(lead()) === null);

// ── contactRecordOf ───────────────────────────────────────────────────────
{
  const r = ch.contactRecordOf(lead({ emailSentAt: "2026-07-13", emailStatus: "sent" }), NOW);
  check("daysSince = 5", r.daysSince === 5);
  check("5 dage, aldrig svaret → lun", r.warmth === "lun");
  check("reason nævner mail sendt", r.reason.includes("mail sendt 2026-07-13"));
}
{
  const r = ch.contactRecordOf(lead({ emailSentAt: "2026-07-10", emailStatus: "replied" }), NOW);
  check("svaret for 8 dage siden → lun", r.warmth === "lun");
  check("replied ja", r.replied === "ja");
}
{
  const r = ch.contactRecordOf(lead({ emailSentAt: "2026-07-01", status: "nej" }), NOW);
  check("svarede nej → død", r.warmth === "død");
  check("reason = svarede nej", r.reason === "svarede nej");
}

// ── buildContactIndex + lookup ────────────────────────────────────────────
{
  const leads = [
    lead({ name: "Salon Saks", city: "Herning", email: "info@salonsaks.dk", emailSentAt: "2026-07-15", emailStatus: "sent" }),
    lead({ id: "2", name: "Cafe Hygge", city: "Ikast", email: "hygge@gmail.com", emailSentAt: "2026-07-01", emailStatus: "replied" }),
    lead({ id: "3", name: "Frisk Frisør", city: "Holstebro", email: "" }), // aldrig kontaktet
  ];
  const idx = ch.buildContactIndex(leads, NOW);
  check("lookup navn+by rammer", idx.lookup("Salon Saks", "Herning", undefined)?.reason.includes("2026-07-15") === true);
  check("lookup samme email, andet navn", idx.lookup("Saksen ApS", "Aarhus", "info@salonsaks.dk") !== null);
  check("lookup firma-domæne rammer", idx.lookup("Saksen ApS", "Aarhus", "kontakt@salonsaks.dk") !== null);
  check("freemail-domæne blokerer IKKE andre", idx.lookup("Anden Cafe", "Vejle", "anden@gmail.com") === null);
  check("freemail eksakt adresse blokerer", idx.lookup("Anden Cafe", "Vejle", "hygge@gmail.com") !== null);
  check("ukontaktet lead ikke i indeks", idx.lookup("Frisk Frisør", "Holstebro", undefined) === null);
  check("nyeste kontakt vinder ved dublet", (() => {
    const dup = ch.buildContactIndex([
      lead({ emailSentAt: "2026-06-01" }),
      lead({ emailSentAt: "2026-07-15" }),
    ], NOW);
    return dup.lookup("Salon Saks", "Herning", undefined)?.lastContactAt === "2026-07-15";
  })());
}

console.log(`test_contact_history: ${pass} pass, ${fail} fail`);
if (fail) { console.error("FAILURES:", failures); process.exit(1); }
