#!/usr/bin/env node
/*
 * watchdogs.mjs — deterministisk erstatning for de 3 LLM-watchdog-tasks
 * (daglig-brief-watchdog, daily-lead-gen-watchdog, ugentlig-brief-watchdog).
 *
 * Kører uden Claude: ren fetch + dato-sammenligning. Sender kun mail når
 * noget faktisk mangler. Køres af Windows Task Scheduler kl 08:45 dagligt.
 *
 *   node scripts/watchdogs.mjs          # normal kørsel
 *   node scripts/watchdogs.mjs --dry    # tjek uden at sende mail
 *
 * ponytail: én fil, ingen retries, ingen state. Fejler et check, sendes én
 * mail og scriptet er færdigt — næste dags kørsel er "retry"'et.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Vaulten er et PRIVAT repo — raw.githubusercontent svarer 404 uden token.
// Derfor tjekkes den lokale vault direkte (scriptet koerer paa Lucas' maskine,
// og det er ogsaa dér Cowork-tasks skriver filerne).
const VAULT = "C:\\Users\\Buur\\Documents\\KnowledgeOS";
const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);
const DRY = process.argv.includes("--dry");

// Dagens dato i Europe/Copenhagen som YYYY-MM-DD
function todayCph() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

// ISO-uge (YYYY-Www) for en dato i Europe/Copenhagen
function isoWeek(d = new Date()) {
  const local = new Date(d.toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  const t = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekdayCph() {
  return new Date().toLocaleDateString("en-US", { timeZone: "Europe/Copenhagen", weekday: "short" });
}

function exists(p) {
  return fs.existsSync(path.join(VAULT, p));
}

// send_brief_mail.mjs tager en FIL-sti til --html, ikke inline HTML.
// (De gamle LLM-watchdogs sendte inline og ville have fejlet ved foerste alarm.)
function sendMail(subject, html, to) {
  if (DRY) {
    console.log(`[dry] ville sende til ${to}: ${subject}`);
    return;
  }
  const f = path.join(os.tmpdir(), `watchdog-${Date.now()}.html`);
  fs.writeFileSync(f, html, "utf-8");
  try {
    execFileSync("node", ["scripts/send_brief_mail.mjs", "--subject", subject, "--html", f, "--to", to], {
      cwd: REPO_ROOT,
      stdio: "inherit",
    });
  } finally {
    fs.unlinkSync(f);
  }
}

const alerts = [];

// 1. daglig-brief-check FJERNET 2026-10-09: jobbet daglig-brief blev pauset 17/9 og findes
// ikke laengere (se KnowledgeOS wiki/os/daglig-brief-genopretning-2026-09-22.md), saa
// checket mailede Lucas + Charlie hver morgen om en brief der aldrig kommer.
// Genopretter I jobbet: saet checket ind igen (exists(`daily/${todayCph()}.md`) -> alert til "both").

// 2. leadgen.json er under 26 timer gammel
// Springes over mens data/leadgen.paused findes (Lucas 9/10: lead-finding pauset til §10 er afklaret;
// Hermes-cron 89f66dea4d2f + leadgen-watchdog f4e371754ed9 er også pauset). Genoptag: slet filen + resume begge.
if (exists("data/leadgen.paused")) console.log("leadgen.json: PAUSET (data/leadgen.paused) -> spring over");
else {
  let ageH = null;
  try {
    const j = JSON.parse(fs.readFileSync(path.join(VAULT, "data/leadgen.json"), "utf-8"));
    if (j.at) ageH = (Date.now() - new Date(j.at).getTime()) / 3600000;
  } catch {}
  const ok = ageH !== null && ageH < 26;
  console.log(`leadgen.json: ${ageH === null ? "MANGLER/ULAESELIG" : ageH.toFixed(1) + "t"} -> ${ok ? "OK" : "FLAG"}`);
  if (!ok)
    alerts.push({
      to: "lucas",
      subject: "Lead-gen data mangler eller er gammel",
      html: `<p>data/leadgen.json er enten vaek eller aeldre end 26 timer (${ageH === null ? "ingen timestamp" : ageH.toFixed(1) + " timer"}).</p><p>Kan vaere den bevidste gate (godkendelses-koe fuld) eller en reel fejl i daily-lead-gen. Tjek koeens stoerrelse foerst.</p><p>Denne mail er fra watchdoggen.</p>`,
    });
}

// 3. Mandag: ugens brief blev skrevet i weekend'en
if (weekdayCph() === "Mon") {
  const lastWeek = isoWeek(new Date(Date.now() - 3 * 86400000));
  const ok = exists(`weekly/${lastWeek}.md`) || exists(`weekly/${isoWeek()}.md`);
  console.log(`ugentlig-brief ${lastWeek}: ${ok ? "OK" : "MANGLER"}`);
  if (!ok)
    alerts.push({
      to: "both",
      subject: `Ugentlig brief mangler (${lastWeek})`,
      html: `<p>ugentlig-brief-tasken har ikke skrevet KnowledgeOS/weekly/${lastWeek}.md.</p><p>Tjek Cowork-sessioner for soendagens koersel.</p><p>Denne mail er fra watchdoggen.</p>`,
    });
}

for (const a of alerts) sendMail(a.subject, a.html, a.to);
console.log(alerts.length ? `sendte ${alerts.length} mail(s)` : "alt gront, ingen mail");
