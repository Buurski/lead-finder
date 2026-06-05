#!/usr/bin/env node
/*
 * test_deck.mjs — offline contract tests for the Mission Control read model
 * (src/lib/deck.ts). Pure helpers only: no Sheets, no network, no queue writes.
 *
 *   node scripts/test_deck.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const deck = await import(libUrl("deck.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

function lead(over = {}) {
  return {
    id: "L1", name: "Test", branch: "frisør", phone: "", city: "Aarhus", score: 70,
    source: "", website: "", websiteStatus: "none", status: "new", notes: "",
    lastUpdated: today, websiteQualityTier: "", enrichedInfo: "", email: "",
    emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
    followupSentAt: "", reviewsCount: 0, callbackDate: "", ...over,
  };
}
function draft(over = {}) {
  return { id: "d1", leadId: "L1", name: "Test", branch: "frisør", city: "Aarhus",
    hooks: [], demoPair: [], professionalism: "", subject: "Hej", body: "x",
    status: "pending", source: "daily-engine", createdAt: "2026-06-01T08:00:00Z",
    updatedAt: "2026-06-01T08:00:00Z", ...over };
}
function client(over = {}) {
  return { id: "C1", name: "Kunde", branch: "salon", phone: "", briefFilled: true,
    projectFolder: "", websiteStatus: "live", monthlyFee: "", setupFee: "", ...over };
}

// ---- buildNeedsYou: priority + cap --------------------------------------
{
  const leads = [
    lead({ id: "a", status: "interested" }),
    lead({ id: "b", emailStatus: "replied" }),
    lead({ id: "c", callbackDate: yesterday }),
  ];
  const n = deck.buildNeedsYou(leads);
  check("needsYou: reply ranks first", n[0].kind === "reply");
  check("needsYou: callback before interested", n[1].kind === "callback");
  check("needsYou: overdue callback labelled forsinket", n[1].why.includes("forsinket"));
  check("needsYou: all three surfaced", n.length === 3);
}
{
  // replied takes precedence over interested status on the same lead
  const n = deck.buildNeedsYou([lead({ status: "interested", emailStatus: "replied" })]);
  check("needsYou: replied wins over interested", n.length === 1 && n[0].kind === "reply");
}
{
  const many = Array.from({ length: 12 }, (_, i) => lead({ id: "x" + i, emailStatus: "replied" }));
  check("needsYou: capped at 8", deck.buildNeedsYou(many).length === 8);
}
{
  check("needsYou: new lead with nothing pending is ignored", deck.buildNeedsYou([lead()]).length === 0);
}

// ---- buildQueuePeek ------------------------------------------------------
{
  const q = [draft({ id: "1", status: "pending" }), draft({ id: "2", status: "approved" }), draft({ id: "3", status: "pending" })];
  const p = deck.buildQueuePeek(q);
  check("queuePeek: count is all", p.count === 3);
  check("queuePeek: pending counts only pending", p.pending === 2);
  check("queuePeek: top holds pending only", p.top.every((d) => d.status === "pending"));
}

// ---- buildPipeline -------------------------------------------------------
{
  const q = [
    draft({ status: "pending", createdAt: "2026-06-01T08:00:00Z" }),
    draft({ status: "edited", createdAt: "2026-06-03T09:00:00Z" }),
    draft({ status: "rejected", createdAt: "2026-06-02T10:00:00Z" }),
  ];
  const p = deck.buildPipeline(q);
  check("pipeline: total", p.totalDrafts === 3);
  check("pipeline: edited counts as approved", p.approved === 1);
  check("pipeline: rejected counted", p.rejected === 1);
  check("pipeline: lastRunAt = newest createdAt", p.lastRunAt === "2026-06-03T09:00:00Z");
  check("pipeline: empty queue lastRunAt null", deck.buildPipeline([]).lastRunAt === null);
}

// ---- buildPulse ----------------------------------------------------------
{
  const cs = [
    client({ id: "1", websiteStatus: "live", briefFilled: true }),
    client({ id: "2", websiteStatus: "demo" }),
    client({ id: "3", websiteStatus: "live", briefFilled: false }),
  ];
  const p = deck.buildPulse(cs);
  check("pulse: skips healthy live client", !p.find((c) => c.id === "1"));
  check("pulse: flags demo", !!p.find((c) => c.id === "2" && c.reason.includes("Demo")));
  check("pulse: flags live-but-brief-missing", !!p.find((c) => c.id === "3" && c.reason.includes("brief")));
}

// ---- buildNumbers --------------------------------------------------------
{
  const leads = [
    lead({ status: "new" }),
    lead({ status: "new", email: "a@b.dk" }),
    lead({ status: "client", lastUpdated: today }),
    lead({ status: "client", lastUpdated: "2020-01-01" }),
    lead({ status: "called", emailStatus: "replied" }),
  ];
  const n = deck.buildNumbers(leads);
  check("numbers: newLeads", n.newLeads === 2);
  check("numbers: withEmail", n.withEmail === 1);
  check("numbers: repliesToday", n.repliesToday === 1);
  check("numbers: wonThisWeek only recent client", n.wonThisWeek === 1);
}

// ---- buildDailySent ------------------------------------------------------
{
  const today = new Date().toISOString();
  const yest = new Date(Date.now() - 86_400_000).toISOString();
  const old = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const leads = [
    lead({ emailSentAt: today }),
    lead({ emailSentAt: today, emailStatus: "replied" }),
    lead({ emailSentAt: yest }),
    lead({ emailSentAt: old }),       // outside 14d window
    lead({ emailSentAt: "" }),         // never sent
  ];
  const series = deck.buildDailySent(leads, 14);
  check("dailySent has 14 entries", series.length === 14);
  check("dailySent oldest->newest", series[0].date < series[13].date);
  const todayBucket = series[series.length - 1];
  check("dailySent today count = 2", todayBucket.count === 2);
  check("dailySent today replies = 1", todayBucket.replies === 1);
  check("dailySent excludes out-of-window", series.reduce((a, d) => a + d.count, 0) === 3);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all deck checks ok");
console.log(`\ntest_deck — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
