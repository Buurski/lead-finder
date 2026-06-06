#!/usr/bin/env node
/*
 * test_spend.mjs — offline tests for the pure spend helpers (src/lib/spend-log.ts):
 * token estimate, cost math, and summarize() over injected entries. No file IO.
 *
 *   node scripts/test_spend.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const sp = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "spend-log.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- estimateTokens ------------------------------------------------------
check("estimate ~ len/4", sp.estimateTokens("a".repeat(40)) === 10);
check("estimate min 1", sp.estimateTokens("") === 1);

// ---- costUSD: opus dearer than sonnet -----------------------------------
const opus = sp.costUSD("claude-opus-4-8", 1_000_000, 1_000_000);
const sonnet = sp.costUSD("claude-sonnet-4-6", 1_000_000, 1_000_000);
check("opus 1M+1M = 90 USD", Math.abs(opus - 90) < 0.001);
check("sonnet 1M+1M = 18 USD", Math.abs(sonnet - 18) < 0.001);
check("opus costs more than sonnet", opus > sonnet);
check("haiku cheapest", sp.costUSD("claude-haiku-4-5", 1_000_000, 0) < sp.costUSD("claude-sonnet-4-6", 1_000_000, 0));

// ---- summarize -----------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);
const entries = [
  { ts: `${today}T08:00:00Z`, task: "draft", model: "claude-opus-4-8", provider: "anthropic", inputTokens: 1_000_000, outputTokens: 1_000_000, costUSD: 90, estimated: true },
  { ts: `${today}T09:00:00Z`, task: "research", model: "claude-sonnet-4-6", provider: "anthropic", inputTokens: 100_000, outputTokens: 100_000, costUSD: 1.8, estimated: true },
  { ts: `2020-01-01T09:00:00Z`, task: "qualify", model: "claude-sonnet-4-6", provider: "anthropic", inputTokens: 1000, outputTokens: 1000, costUSD: 0.018, estimated: true },
];
const sum = sp.summarize(entries);
check("summarize total", Math.abs(sum.totalUSD - 91.818) < 0.01);
check("summarize today only counts today", Math.abs(sum.todayUSD - 91.8) < 0.01);
check("summarize alert true when today*6.9 > 100", sum.alert === true);
check("summarize byModel has Opus + Sonnet", sum.byModel.some((m) => m.key === "Opus") && sum.byModel.some((m) => m.key === "Sonnet"));
check("summarize top sorted desc", sum.top[0].costUSD >= sum.top[1].costUSD);
check("summarize byDay sorted asc", sum.byDay[0].key <= sum.byDay[sum.byDay.length - 1].key);

// no alert path
const calm = sp.summarize([{ ts: `${today}T08:00:00Z`, task: "draft", model: "claude-haiku-4-5", provider: "anthropic", inputTokens: 100, outputTokens: 100, costUSD: 0.001, estimated: true }]);
check("no alert on tiny spend", calm.alert === false);

// ---- daily cap (Lucas's 150 kr/day) -------------------------------------
delete process.env.AI_DAILY_CAP_DKK;
check("dailyCapDKK default 150", sp.dailyCapDKK() === 150);
check("isOverCap below cap is false", sp.isOverCap(149.99) === false);
check("isOverCap at cap is true", sp.isOverCap(150) === true);
check("isOverCap above cap is true", sp.isOverCap(300) === true);
// env override tunes the cap without a code change
process.env.AI_DAILY_CAP_DKK = "200";
check("dailyCapDKK honours env override", sp.dailyCapDKK() === 200);
check("isOverCap uses overridden cap", sp.isOverCap(150) === false && sp.isOverCap(200) === true);
// bad override falls back to the constant
process.env.AI_DAILY_CAP_DKK = "abc";
check("bad override falls back to 150", sp.dailyCapDKK() === 150);
delete process.env.AI_DAILY_CAP_DKK;

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all spend checks ok");
console.log(`\ntest_spend — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
