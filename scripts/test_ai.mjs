#!/usr/bin/env node
/*
 * test_ai.mjs — contract tests for the model gateway (src/lib/ai.ts).
 *
 * These run WITHOUT any API key: they assert model selection, env overrides,
 * provider detection, and the all-important deterministic fallback (generate()
 * returns null with no key, so every caller degrades safely). The live gateway
 * / Anthropic paths can't be exercised here — that needs a key (see BLOCKERS.md)
 * — but the no-key contract is the one that must never regress.
 *
 *   node scripts/test_ai.mjs
 */

import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;

// Ensure a clean no-key environment for the default assertions.
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.AI_DISABLED;
delete process.env.AI_MODEL_DRAFT;
delete process.env.AI_MODEL_RESEARCH;
delete process.env.AI_MODEL_QUALIFY;

const ai = await import(libUrl("ai.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- model selection defaults (brief: research+qualify=Sonnet 4.6, draft=Opus 4.8)
check("draft -> Opus 4.8", ai.modelFor("draft") === "anthropic/claude-opus-4-8");
check("research -> Sonnet 4.6", ai.modelFor("research") === "anthropic/claude-sonnet-4-6");
check("qualify -> Sonnet 4.6", ai.modelFor("qualify") === "anthropic/claude-sonnet-4-6");

// ---- stripProvider for the Anthropic-direct path
check("stripProvider drops provider prefix", ai.stripProvider("anthropic/claude-opus-4-8") === "claude-opus-4-8");
check("stripProvider passes bare id", ai.stripProvider("claude-opus-4-8") === "claude-opus-4-8");

// ---- env override
process.env.AI_MODEL_DRAFT = "anthropic/claude-some-future";
check("AI_MODEL_DRAFT override honoured", ai.modelFor("draft") === "anthropic/claude-some-future");
delete process.env.AI_MODEL_DRAFT;

// ---- provider detection
check("no key -> provider none", ai.activeProvider() === "none");
check("no key -> isAiEnabled false", ai.isAiEnabled() === false);

process.env.AI_GATEWAY_API_KEY = "test-gw";
check("gateway key -> provider gateway", ai.activeProvider() === "gateway");
process.env.AI_DISABLED = "1";
check("AI_DISABLED=1 forces none even with key", ai.activeProvider() === "none");
delete process.env.AI_DISABLED;
delete process.env.AI_GATEWAY_API_KEY;

process.env.ANTHROPIC_API_KEY = "test-anthropic";
check("anthropic-only key -> provider anthropic", ai.activeProvider() === "anthropic");
delete process.env.ANTHROPIC_API_KEY;

// ---- generate() returns null with no key (deterministic fallback)
const res = await ai.generate({ task: "draft", prompt: "test" });
check("generate() returns null with no key", res === null);

// ---- with-key resilience: a (fake) key must engage the live path and degrade
//      to null WITHOUT throwing (real success needs a real key — see BLOCKERS).
//      Gateway is pointed at a dead local port so it fails instantly with no
//      lingering keepalive socket (avoids a Windows libuv exit race).
process.env.AI_GATEWAY_API_KEY = "fake-key-for-resilience-test";
process.env.AI_GATEWAY_BASE_URL = "http://127.0.0.1:9/ai";
let threw = false, gwRes = null;
try { gwRes = await ai.generate({ task: "draft", prompt: "hej", timeoutMs: 4000 }); }
catch { threw = true; }
check("gateway path with bad key does not throw", threw === false);
check("gateway path with bad key returns null", gwRes === null);
delete process.env.AI_GATEWAY_API_KEY;
delete process.env.AI_GATEWAY_BASE_URL;

// ---- aiStatus shape
const status = ai.aiStatus();
check("aiStatus reports enabled=false with no key", status.enabled === false && status.provider === "none");
check("aiStatus lists all three models", !!status.models.research && !!status.models.qualify && !!status.models.draft);

// ---- report
console.log("");
console.log(`  test_ai — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("  FAILURES:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exitCode = 1;
} else {
  console.log("  ✓ ai gateway contracts hold (no-key deterministic fallback safe)");
  console.log("");
  process.exitCode = 0;
}
// Let Node drain naturally (no forced process.exit) so any keepalive socket
// from the resilience probe closes cleanly — avoids a Windows libuv exit race.
