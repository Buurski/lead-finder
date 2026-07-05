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

// ==========================================================================
// Phase 3 — period comparison, decomposition, coverage, rules engine
// ==========================================================================

const p3 = [
  { name: "W1", stage: "won", monthlyFee: "1000", setupFee: "5000", wonDate: "2026-06-10" },
  { name: "W2", stage: "won", monthlyFee: "2000", setupFee: "10000", wonDate: "2026-06-20" },
  { name: "W3", stage: "won", monthlyFee: "1500", setupFee: "8000", wonDate: "2026-07-05" },
  { name: "L1", stage: "lost", monthlyFee: "800", setupFee: "0", lostDate: "2026-07-12" },
  { name: "O1", stage: "offer", monthlyFee: "1000", setupFee: "10000", expectedClose: "2026-07-25" },
];
const JUN = { start: new Date(2026, 5, 1), end: new Date(2026, 5, 30, 23, 59, 59) };
const JUL = { start: new Date(2026, 6, 1), end: new Date(2026, 6, 31, 23, 59, 59) };
const MAY = { start: new Date(2026, 4, 1), end: new Date(2026, 4, 31, 23, 59, 59) };

// --- periodStats ---
const june = ins.periodStats(p3, JUN);
check("June revenue 15000", june.revenue === 15000);
check("June newClients 2", june.newClients === 2);
check("June avgDealValue 25500", near(june.avgDealValue, 25500));
check("June winRate 1", june.winRate === 1);
const july = ins.periodStats(p3, JUL);
check("July churnedMrr 800", july.churnedMrr === 800);
check("July netNewMrr 700", july.netNewMrr === 700);
check("July winRate 0.5", near(july.winRate, 0.5, 0.01));
check("winRate null when nothing closed", ins.periodStats(p3, MAY).winRate === null);

// --- delta ---
check("delta pct", near(ins.delta(8000, 15000).pct, -0.4667, 0.01));
check("delta pct null when prev 0", ins.delta(5, 0).pct === null);
check("delta abs", ins.delta(8000, 15000).abs === -7000);

// --- decomposition: volume + value === total, always ---
const dec = ins.decomposeRevenue(july, june);
check("decompose total -7000", dec.totalDelta === -7000);
check("decompose volume -7500", near(dec.volumeEffect, -7500));
check("decompose value 500", near(dec.valueEffect, 500));
check("decompose sums to total", near(dec.volumeEffect + dec.valueEffect, dec.totalDelta, 0.001));
// n0 = 0 edge (July vs May): all Δ lands cleanly, still sums
const decEdge = ins.decomposeRevenue(july, ins.periodStats(p3, MAY));
check("decompose n0=0 total 8000", near(decEdge.totalDelta, 8000));
check("decompose n0=0 sums to total", near(decEdge.volumeEffect + decEdge.valueEffect, decEdge.totalDelta, 0.001));

// --- comparePeriods ---
const cmp = ins.comparePeriods(p3, JUL, JUN);
check("compare revenue delta -7000", cmp.deltas.revenue.abs === -7000);
check("compare newClients delta -1", cmp.deltas.newClients.abs === -1);

// --- pipelineCoverage ---
const target = { quarter: "2026-Q3", target_setup_revenue: 30000, target_mrr_added: 8000, weekly_outreach_floor: 40, annual_mrr_goal: 25000 };
const cov = ins.pipelineCoverage(p3, target, new Date(2026, 6, 15));
// weighted pipeline O1 = (10000+12000)*0.6 = 13200 ; remaining = 22000 + 12*6500 = 100000
check("pipelineCoverage ~0.132", near(cov, 0.132, 0.005));
check("pipelineCoverage null when target met", ins.pipelineCoverage(p3, { ...target, target_setup_revenue: 0, target_mrr_added: 0 }, new Date(2026, 6, 15)) === null);
check("pipelineCoverage null when no target", ins.pipelineCoverage(p3, null, new Date(2026, 6, 15)) === null);

// --- arpa ---
check("arpa 1500", near(ins.arpa([{ stage: "live", monthlyFee: "2000" }, { stage: "live", monthlyFee: "1000" }]), 1500));
check("arpa 0 when no live", ins.arpa([{ stage: "lead", monthlyFee: "500" }]) === 0);

// --- monthlySalesSeries ---
const ms = ins.monthlySalesSeries(p3, new Date(2026, 6, 15), 3); // May, Jun, Jul
check("monthlySalesSeries length 3", ms.length === 3);
check("monthlySalesSeries Jun wonCount 2", ms[1].wonCount === 2 && ms[1].revenue === 15000);
check("monthlySalesSeries Jul avgDealValue 26000", near(ms[2].avgDealValue, 26000));

// --- keyInsights rules engine ---
const insList = ins.keyInsights({ periodLabel: "måned", comparison: cmp, pipelineCoverage: cov, overdueCount: 0, hasHistory: true });
check("keyInsights capped at 6", insList.length <= 6);
check("keyInsights warnings first", insList[0].tone === "warning");
check("keyInsights has churn warning", insList.some((i) => /churn/.test(i.text)));
check("keyInsights has win-rate positive", insList.some((i) => i.tone === "positive" && /win rate/i.test(i.text)));
check("keyInsights numbers are real (revenue fald 47%)", insList.some((i) => /47%/.test(i.text)));
// sparse-history footnote appears only when little to say
const thin = ins.keyInsights({ periodLabel: "måned", comparison: ins.comparePeriods([], MAY, JUN), pipelineCoverage: null, overdueCount: 0, hasHistory: false });
check("keyInsights sparse footnote", thin.some((i) => /Bygger historik/.test(i.text)));

console.log(`test_insights — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
