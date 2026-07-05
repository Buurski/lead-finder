#!/usr/bin/env node
/*
 * test_finance.mjs — offline tests for src/lib/finance.ts, the Økonomi
 * aggregator. Pure: no Sheets, no network. Guards the derived-numbers contract
 * (run-rate, weighted pipeline, revenue buckets, pace, suggested target).
 *
 *   node scripts/test_finance.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const fin = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "finance.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

// --- num() parsing (da-DK) ---
check("num plain", fin.num("545") === 545);
check("num thousands dot", fin.num("5.000") === 5000);
check("num comma decimal", near(fin.num("1.234,56"), 1234.56, 0.01));
check("num strips kr", fin.num("295 kr/md") === 295);
check("num blank → 0", fin.num("") === 0 && fin.num(undefined) === 0);
check("num number type", fin.num(700) === 700);

// --- stageOf fallback from websiteStatus ---
check("stage explicit wins", fin.stageOf({ stage: "offer", websiteStatus: "demo" }) === "offer");
check("stage fallback live", fin.stageOf({ websiteStatus: "live" }) === "live");
check("stage fallback in progress", fin.stageOf({ websiteStatus: "in progress" }) === "delivering");
check("stage fallback demo", fin.stageOf({ websiteStatus: "demo" }) === "concept");
check("stage retainer → live", fin.stageOf({ stage: "retainer" }) === "live");
check("stage empty default lead", fin.stageOf({}) === "lead");

// --- MRR run-rate: only live/retainer count ---
const deals = [
  { name: "Live A", stage: "live", monthlyFee: "2000", setupFee: "8000" },
  { name: "Live B", stage: "live", monthlyFee: "1500", setupFee: "0" },
  { name: "Delivering", stage: "delivering", monthlyFee: "1000", setupFee: "5000" }, // not run-rate
  { name: "Offer", stage: "offer", monthlyFee: "1000", setupFee: "10000", expectedClose: "2026-08-15" },
  { name: "Lead", stage: "lead", monthlyFee: "500", setupFee: "6000" },
];
check("run-rate = 3500 (live only)", fin.mrrRunRate(deals) === 3500);
check("annualised = 42000", fin.annualised(fin.mrrRunRate(deals)) === 42000);

// --- weighted pipeline: only open deals, (setup + 12*mrr)*P ---
const wp = fin.weightedPipeline(deals);
// offer: (10000 + 12000)*0.60 = 13200 ; lead: (6000 + 6000)*0.05 = 600
check("weighted total = 13800", near(wp.total, 13800));
const offerBar = wp.byStage.find((b) => b.stage === "offer");
check("offer bar value 13200", near(offerBar.value, 13200));
check("offer bar count 1", offerBar.count === 1);
const wonExcluded = wp.byStage.every((b) => b.stage !== "won" && b.stage !== "live");
check("closed stages absent from pipeline bars", wonExcluded);

// --- projected EOQ MRR: run-rate + open deals closing by quarter end ---
const qEnd = new Date(2026, 8, 30); // 2026-09-30
// offer mrr 1000 * 0.60 = 600 (expectedClose in quarter); lead has no expectedClose → excluded
check("projected EOQ = 3500 + 600", near(fin.projectedEoqMrr(deals, qEnd), 4100));

// --- period revenue: setup won in period + run-rate ---
const now = new Date(2026, 6, 15); // 2026-07-15 (Wed)
const revDeals = [
  { stage: "live", monthlyFee: "2000", setupFee: "8000", wonDate: "2026-07-14" }, // this week
  { stage: "won", monthlyFee: "0", setupFee: "12000", wonDate: "2026-07-02" },    // this month, not week
  { stage: "won", monthlyFee: "0", setupFee: "5000", wonDate: "2026-01-10" },     // this year only
];
// run-rate = 2000 (one live)
check("week revenue = 8000 setup + 2000 rr", near(fin.periodRevenue(revDeals, fin.weekPeriod(now)), 10000));
check("month revenue = 20000 setup + 2000 rr", near(fin.periodRevenue(revDeals, fin.monthPeriod(now)), 22000));
check("year revenue = 25000 setup + 2000 rr", near(fin.periodRevenue(revDeals, fin.yearPeriod(now)), 27000));

// --- quarter + won count ---
const q = fin.quarterOf(now);
check("quarter key 2026-Q3", q.key === "2026-Q3");
check("wonCount this quarter = 2", fin.wonCount(revDeals, q) === 2);

// --- pace: actual - target*elapsedFraction ---
// 2026-07-15 is 14 days into a 92-day Q3 → frac ~0.152; target 6 → expected ~0.91
const pc = fin.pace(2, 6, now, q);
check("pace expected ~0.91", near(pc.expected, 0.91, 0.15));
check("pace ahead → on-pace", pc.status === "on-pace");
// delta -0.91 (0 vs expected ~0.91) is within -1 → slightly-behind
check("pace just short → slightly-behind", fin.pace(0, 6, now, q).status === "slightly-behind");
// late in quarter, 0 of 6 → expected ~4 → delta < -1 → behind
check("pace clearly short → behind", fin.pace(0, 6, new Date(2026, 8, 1), q).status === "behind");

// --- suggested target: trailing 3 full months + growth ---
// full months before Jul 2026 = Apr, May, Jun. Wins in 2 of them → enough.
const histNow = new Date(2026, 6, 20);
const hist = [
  { stage: "live", monthlyFee: "2000", wonDate: "2026-04-10" },
  { stage: "live", monthlyFee: "1000", wonDate: "2026-05-15" },
  { stage: "won", monthlyFee: "1000", wonDate: "2026-06-05" },
  { stage: "won", monthlyFee: "1000", wonDate: "2026-07-19" }, // current month excluded
];
const sug = fin.suggestTarget(hist, histNow, 1.15);
check("suggestion enoughHistory", sug.enoughHistory === true);
check("suggestion months=3", sug.monthsOfData === 3);
// 3 wins over 3 months → avg 1/mo → *3*1.15 = 3.45 → round 3
check("suggested clients = 3", sug.suggestedClients === 3);
// mrr sum 4000/3 *3 *1.15 = 4600
check("suggested mrr added = 4600", sug.suggestedMrrAdded === 4600);
// too little history
const sug2 = fin.suggestTarget([{ stage: "won", monthlyFee: "1000", wonDate: "2026-06-05" }], histNow, 1.15);
check("thin history → not enough", sug2.enoughHistory === false && sug2.monthsOfData === 1);

// --- dkk formatting ---
check("dkk rounds + da-DK", fin.dkk(12345.6) === "12.346 kr");

// --- computeFinance bundle sanity ---
const snap = fin.computeFinance(deals, {
  quarter: "2026-Q3", target_new_clients: 6, target_setup_revenue: 30000,
  target_mrr_added: 8000, weekly_outreach_floor: 40, annual_mrr_goal: 25000,
}, now, 1.15);
check("bundle run-rate", snap.runRate === 3500);
check("bundle pipeline total", near(snap.pipeline.total, 13800));
check("bundle booked has 6 months", snap.booked.length === 6);

console.log(`test_finance — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
