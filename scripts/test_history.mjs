#!/usr/bin/env node
/*
 * test_history.mjs — offline tests for src/lib/history.ts (snapshot compute +
 * series/delta helpers). Pure: no Sheets, no network.
 *
 *   node scripts/test_history.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const h = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "history.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }
const near = (a, b, eps = 0.5) => Math.abs(a - b) <= eps;

// --- dateKey ---
check("dateKey pads", h.dateKey(new Date(2026, 0, 5)) === "2026-01-05");

// --- computeSnapshot ---
const clients = [
  { name: "A", stage: "live", monthlyFee: "2000", setupFee: "8000", wonDate: "2026-07-10" },
  { name: "B", stage: "won", monthlyFee: "0", setupFee: "12000", wonDate: "2026-07-02" },
  { name: "D", stage: "offer", monthlyFee: "1000", setupFee: "10000", expectedClose: "2026-07-20" },
  { name: "E", stage: "lead", monthlyFee: "500", setupFee: "6000" },
  { name: "F", stage: "negotiation", monthlyFee: "1500", setupFee: "5000" },
];
const snap = h.computeSnapshot(clients, new Date(2026, 6, 15), 42);
check("snapshot date", snap.date === "2026-07-15");
check("snapshot mrr_runrate 2000 (live only)", snap.mrr_runrate === 2000);
check("snapshot clients_live 1", snap.clients_live === 1);
check("snapshot open_deal_count 3", snap.open_deal_count === 3);
check("snapshot new_clients_mtd 2", snap.new_clients_mtd === 2);
check("snapshot setup_revenue_mtd 20000", snap.setup_revenue_mtd === 20000);
check("snapshot open_pipeline_weighted 31050", near(snap.open_pipeline_weighted, 31050));
check("snapshot leads_total passthrough 42", snap.leads_total === 42);
check("snapshot leads_total defaults 0", h.computeSnapshot(clients, new Date(2026, 6, 15)).leads_total === 0);

// --- hasHistory ---
check("hasHistory false when empty", h.hasHistory([]) === false);
check("hasHistory false with 1 point", h.hasHistory([{ date: "2026-07-01" }]) === false);
check("hasHistory true with 2", h.hasHistory([{ date: "2026-07-01" }, { date: "2026-07-02" }]) === true);

// --- seriesOf ---
const snaps = [
  { date: "2026-07-15", mrr_runrate: 2000 },
  { date: "2026-07-01", mrr_runrate: 1000 },
  { date: "2026-07-08", mrr_runrate: 1500 },
];
const series = h.seriesOf(snaps, "mrr_runrate");
check("seriesOf sorts oldest-first", series[0].date === "2026-07-01" && series[2].date === "2026-07-15");
check("seriesOf maps value", series[1].value === 1500);

// --- changeOverDays ---
const c7 = h.changeOverDays(snaps, "mrr_runrate", 7);
check("change 7d current 2000", c7.current === 2000);
check("change 7d previous 1500 (07-08)", c7.previous === 1500);
check("change 7d abs 500", c7.abs === 500);
check("change 7d pct ~0.333", near(c7.pct, 1 / 3, 0.01));
check("change 30d null (no baseline that far)", h.changeOverDays(snaps, "mrr_runrate", 30) === null);
check("change null with <2 points", h.changeOverDays([snaps[0]], "mrr_runrate", 7) === null);
check("change pct null when baseline 0",
  h.changeOverDays([{ date: "2026-07-01", clients_live: 0 }, { date: "2026-07-15", clients_live: 3 }], "clients_live", 7).pct === null);

console.log(`test_history — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
