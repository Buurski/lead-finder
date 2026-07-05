#!/usr/bin/env node
/*
 * test_insights.mjs — offline tests for src/lib/insights.ts (Salg analytics).
 * Pure: no Sheets, no network.
 *
 *   node scripts/test_insights.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ins = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "insights.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

const deals = [
  { name: "A", stage: "live", monthlyFee: "2000", setupFee: "8000", source: "outreach", expectedClose: "" },
  { name: "B", stage: "won", monthlyFee: "0", setupFee: "12000", source: "inbound", expectedClose: "" },
  { name: "C", stage: "lost", monthlyFee: "0", setupFee: "0", source: "outreach", expectedClose: "" },
  { name: "D", stage: "offer", monthlyFee: "1000", setupFee: "10000", source: "referral", expectedClose: "2026-07-20" },
  { name: "E", stage: "lead", monthlyFee: "500", setupFee: "6000", source: "outreach", expectedClose: "2026-09-01" },
  { name: "F", stage: "negotiation", monthlyFee: "1500", setupFee: "5000", source: "inbound", expectedClose: "2026-06-01" },
];

// dealValue = setup + 12*mrr
check("dealValue A = 32000", ins.dealValue(deals[0]) === 32000);
check("isWon live/won", ins.isWon(deals[0]) && ins.isWon(deals[1]));
check("isLost", ins.isLost(deals[2]) && !ins.isLost(deals[0]));

// --- funnel ---
const fn = ins.funnel(deals);
const byStage = Object.fromEntries(fn.map((s) => [s.stage, s]));
check("funnel lead count 1", byStage.lead.count === 1);
check("funnel offer count 1", byStage.offer.count === 1);
check("funnel negotiation count 1", byStage.negotiation.count === 1);
check("funnel won folds live+won → 2", byStage.won.count === 2);
check("funnel excludes lost (no lost bucket)", !("lost" in byStage));
check("funnel offer weighted 13200", near(byStage.offer.weightedValue, 13200));
check("funnel won weighted = raw 44000", near(byStage.won.weightedValue, 44000));

// --- conversion ---
const conv = ins.conversionRates(fn);
const trans = Object.fromEntries(conv.transitions.map((t) => [`${t.from}->${t.to}`, t.rate]));
check("offer→negotiation = 1", trans["Tilbud ude->Forhandling"] === 1);
check("negotiation→won = 2", trans["Forhandling->Vundet"] === 2);
check("contacted→engaged null (empty upstream)", trans["Kontaktet->Engageret"] === null);
check("overall Kontaktet→Vundet null (0 contacted)", conv.overall === null);

// --- win rate ---
const wr = ins.winRate(deals);
check("winRate won 2 lost 1", wr.won === 2 && wr.lost === 1);
check("winRate rate 2/3", near(wr.rate, 2 / 3, 0.01));
check("winRate null when none closed", ins.winRate([{ stage: "lead" }]).rate === null);

// --- deal economics ---
const econ = ins.dealEconomics(deals);
check("econ wonCount 2", econ.wonCount === 2);
check("econ avgDealValue 22000", near(econ.avgDealValue, 22000));
check("econ avgSetup 10000", near(econ.avgSetup, 10000));
check("econ avgRecurringAnnual 12000", near(econ.avgRecurringAnnual, 12000));
check("econ openRaw 57000", near(econ.openRaw, 57000));
check("econ openWeighted 31050", near(econ.openWeighted, 31050));

// --- expected close (July 2026) ---
const jul = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };
const exp = ins.expectedCloseIn(deals, jul);
check("expectedClose July count 1 (D)", exp.count === 1);
check("expectedClose July raw 22000", near(exp.raw, 22000));
check("expectedClose July weighted 13200", near(exp.weighted, 13200));

// --- segmentation by source ---
const seg = ins.segmentBy(deals, "source");
const bySrc = Object.fromEntries(seg.map((s) => [s.key, s]));
check("segment outreach count 3", bySrc.outreach.count === 3);
check("segment outreach value 32000 (won A)", near(bySrc.outreach.value, 32000));
check("segment outreach win 0.5", near(bySrc.outreach.win.rate, 0.5, 0.01));
check("segment inbound win 1.0", near(bySrc.inbound.win.rate, 1, 0.01));
check("segment referral win null", bySrc.referral.win.rate === null);
check("segments sorted by value desc", seg[0].key === "outreach");
check("blank field → ukendt bucket", ins.segmentBy([{ stage: "lead" }], "owner")[0].key === "ukendt");

// --- overdue hygiene ---
const overdue = ins.overdueDeals(deals, new Date(2026, 6, 15));
check("overdue count 1 (F)", overdue.length === 1 && overdue[0].name === "F");
check("overdue F 44 days", overdue[0].daysOverdue === 44);
check("no overdue when nothing past due", ins.overdueDeals([deals[3]], new Date(2026, 6, 1)).length === 0);

console.log(`test_insights — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
