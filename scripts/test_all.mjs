#!/usr/bin/env node
/*
 * test_all.mjs — run every offline lib test suite in one shot. Exits non-zero
 * if any suite fails. No API key / no network required.
 *
 *   node scripts/test_all.mjs
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const suites = ["test_pipeline", "test_ai", "test_email_finder", "test_reply", "test_datalayer", "test_deck", "test_seo", "test_tone_mixer", "test_spend", "test_vault", "test_recon", "test_compose", "test_composite", "test_cleanup", "test_diversify", "test_rowplan", "test_store", "test_pickfilter", "test_engine_enrich", "test_inbox_digest", "test_money", "test_email", "test_eligibility", "test_can_send", "test_achievements", "test_validate", "test_demo_render", "test_lighthouse", "test_integration", "test_security"];

let failed = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(HERE, `${s}.mjs`)], { encoding: "utf-8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const line = out.split("\n").find((l) => /— \d+ passed/.test(l)) || "(no summary)";
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${s.padEnd(20)} ${line.trim()}`);
}
console.log("");
console.log(failed ? `  ${failed} suite(s) FAILED` : "  all suites green");
process.exitCode = failed ? 1 : 0;
