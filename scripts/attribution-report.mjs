// scripts/attribution-report.mjs — læser Leads-fanen og printer udfald pr. branche
// og pr. score-bucket. READ-ONLY: skriver aldrig til Sheets.
//   node --conditions=react-server scripts/attribution-report.mjs
// Data er sandheden om udfald; scriptet ændrer INGEN vægte og anbefaler intet.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, "src", "lib", p)).href);

// Samme env-load som scripts/leadgen/run.mjs: env først, .env-fil som fallback.
for (const f of [".env.local", ".env.production"]) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf-8").split(/\r?\n/)) {
    const mm = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!mm || process.env[mm[1]]) continue;
    process.env[mm[1]] = mm[2];
  }
}

const bucketOf = (score) => (score >= 70 ? "70-100" : score >= 50 ? "50-69" : "0-49");
const BUCKETS = ["0-49", "50-69", "70-100"];

function tally(leads) {
  const t = { sent: 0, replied: 0, bounced: 0, unsubscribed: 0, interested: 0, called: 0, client: 0 };
  for (const l of leads) {
    t.sent++;
    const s = (l.emailStatus || "").trim().toLowerCase();
    if (s === "replied") {
      t.replied++;
      if (l.status === "interested") t.interested++;
      else if (l.status === "called") t.called++;
      else if (l.status === "client") t.client++;
    } else if (s === "bounced") t.bounced++;
    else if (s === "unsubscribed") t.unsubscribed++;
  }
  return t;
}

function row(label, t) {
  const pct = t.sent ? ((t.replied / t.sent) * 100).toFixed(1) : "0.0";
  const convPct = t.replied ? ((t.client / t.replied) * 100).toFixed(1) : "0.0";
  return `| ${label} | ${t.sent} | ${t.replied} | ${t.bounced} | ${t.unsubscribed} | ${pct} % | ${t.interested} | ${t.called} | ${t.client} | ${convPct} % |`;
}

const HEAD = [
  "| Gruppe | Sendt | Svaret | Bounced | Unsub | Svar-% | Interested | Called | Client | Svar→kunde-% |",
  "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
];

function table(title, groups) {
  const lines = [`### ${title}`, "", ...HEAD];
  for (const [label, leads] of groups) lines.push(row(label, tally(leads)));
  lines.push("");
  return lines;
}

function groupBy(leads, key) {
  const m = new Map();
  for (const l of leads) {
    const k = key(l) || "(tom)";
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(l);
  }
  return m;
}

const { getLeads } = await imp("sheets.ts");
const all = await getLeads();
const sent = all.filter((l) => (l.emailSentAt || "").trim());

const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
const last30 = sent.filter((l) => {
  const d = Date.parse(l.emailSentAt);
  return Number.isFinite(d) && d >= cutoff;
});

// ponytail: ~130 branche-strenge fra Places, de fleste med n=1. Vis dem med
// n >= 10 hver for sig og rul resten sammen, ellers drukner tabellen i støj.
const MIN_N = 10;
const branchGroups = [...groupBy(sent, (l) => l.branch)].sort((a, b) => b[1].length - a[1].length);
const bigBranches = branchGroups.filter(([, v]) => v.length >= MIN_N);
const restBranches = branchGroups.filter(([, v]) => v.length < MIN_N);
const byBranch = [...bigBranches, [`Øvrige (${restBranches.length} brancher med n < ${MIN_N})`, restBranches.flatMap(([, v]) => v)]];
const byBucket = BUCKETS.map((b) => [b, sent.filter((l) => bucketOf(l.score) === b)]);

const replied = sent.filter((l) => (l.emailStatus || "").trim().toLowerCase() === "replied");
const clients = replied.filter((l) => l.status === "client");
const staleInterested = replied.filter(
  (l) => l.status === "interested" && !(l.followupSentAt || "").trim() && !(l.callbackDate || "").trim()
);
const convPct = replied.length ? ((clients.length / replied.length) * 100).toFixed(1) : "0.0";
const convLine = `Af ${replied.length} svar blev ${clients.length} kunder (${convPct} %) — ${staleInterested.length} står som interested uden opfølgning (ingen followupSentAt/callbackDate)`;

const out = [
  `Leads i alt: ${all.length} · med emailSentAt: ${sent.length} · sidste 30 dage: ${last30.length}`,
  "",
  convLine,
  "",
  ...table("Pr. branche", byBranch),
  ...table("Pr. score-bucket", byBucket),
  ...table("Total og sidste 30 dage", [["Total", sent], ["Sidste 30 dage", last30]]),
];
console.log(out.join("\n"));
