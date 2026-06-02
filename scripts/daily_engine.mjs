#!/usr/bin/env node
/*
 * daily_engine.mjs — thin CLI wrapper around src/lib/engine.ts (Del 4).
 *
 * Runs the sequential PICK -> RESEARCH -> QUALIFY -> DRAFT -> COLLECT loop and
 * writes 10-15 personal drafts into the approval queue (.send_queue/
 * approval_queue.json) that the /approve UI reads. It NEVER sends mail.
 *
 * Canonical tracked copy lives here under scripts/. The runnable copy is
 * .send_queue/daily_engine.mjs (that dir is gitignored, like send.mjs). Keep
 * the two identical; re-copy after pulling new commits:
 *   cp scripts/daily_engine.mjs .send_queue/daily_engine.mjs
 *
 * Node >= 22.18 / 24 strips TypeScript types, so this .mjs can import engine.ts
 * directly with no build step.
 *
 * Usage:
 *   node .send_queue/daily_engine.mjs --limit=12
 *   node .send_queue/daily_engine.mjs --dry-run --limit=3
 *   node .send_queue/daily_engine.mjs --lead="Vida"
 *
 * Flags:
 *   --dry-run        Fill the queue but use no LLM / no network creds required.
 *   --limit=N        Target draft count (default 12).
 *   --lead="Name"    "skriv til X": research + draft one named lead.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

// ----- env (optional; dry-run needs none) -------------------------------
function loadEnvFile(filepath) {
  try {
    const content = fs.readFileSync(filepath, "utf-8");
    for (const line of content.split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch {}
}
for (const c of [
  path.join(__dirname, ".env.local"),
  path.join(REPO_ROOT, ".env.local"),
]) loadEnvFile(c);

// engine.ts reads voice-guide.md and writes the queue relative to process.cwd();
// pin cwd to the repo root so it works no matter where the CLI is launched from.
try { process.chdir(REPO_ROOT); } catch {}

// ----- args -------------------------------------------------------------
const argv = process.argv.slice(2);
const opts = { dryRun: false, limit: 12, leadName: undefined };
for (const a of argv) {
  if (a === "--dry-run" || a === "--dryrun") opts.dryRun = true;
  else if (a.startsWith("--limit=")) opts.limit = Math.max(1, parseInt(a.slice(8), 10) || 12);
  else if (a.startsWith("--lead=")) opts.leadName = a.slice(7).replace(/^["']|["']$/g, "");
}

// ----- run --------------------------------------------------------------
const engineUrl = pathToFileURL(path.join(REPO_ROOT, "src", "lib", "engine.ts")).href;
const { runEngine } = await import(engineUrl);

const started = Date.now();
const summary = await runEngine(opts);
const secs = ((Date.now() - started) / 1000).toFixed(1);

console.log("");
console.log("  daily_engine " + (opts.dryRun ? "(DRY RUN — no send, no LLM)" : ""));
console.log("  ─────────────────────────────────────────────");
console.log(`  source:     ${summary.source}`);
console.log(`  picked:     ${summary.picked}`);
console.log(`  drafted:    ${summary.drafted}`);
console.log(`  written:    ${summary.written}  -> .send_queue/approval_queue.json`);
console.log(`  skipped:    ${summary.qualifiedOut}`);
console.log(`  took:       ${secs}s`);
if (summary.skipped.length) {
  console.log("  ── dropped at QUALIFY ──");
  for (const s of summary.skipped.slice(0, 8)) console.log(`    · ${s.name}: ${s.reason}`);
}
console.log("");
for (const d of summary.drafts) {
  console.log(`  ✎ ${d.name} (${d.city}) — "${d.subject}"`);
}
console.log("");

// Always exit 0 on a successful run (no mail is ever sent).
process.exit(0);
