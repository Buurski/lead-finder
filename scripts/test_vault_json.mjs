#!/usr/bin/env node
/*
 * test_vault_json.mjs — proves the Obsidian data-channel: readVaultJson reads a
 * JSON artifact a Cowork task would write into the vault (KnowledgeOS/data/*.json).
 * Uses a temp fixture under the in-repo KnowledgeOS mirror (preferRemote:false so
 * no network). Cleans up after itself.
 *   node scripts/test_vault_json.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { readVaultJson } = await import(pathToFileURL(path.join(ROOT, "src", "lib", "vault.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

const dir = path.join(ROOT, "KnowledgeOS", "data");
const file = path.join(dir, "__test_artifact.json");
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(file, JSON.stringify({ at: "2026-06-06T08:00:00Z", items: [{ name: "Test Lead", fitScore: 91 }] }), "utf-8");

try {
  const data = await readVaultJson("data/__test_artifact.json", { preferRemote: false });
  check("reads + parses vault json", data && Array.isArray(data.items) && data.items.length === 1);
  check("fields intact", data?.items?.[0]?.name === "Test Lead" && data?.items?.[0]?.fitScore === 91);
  check("at field intact", data?.at === "2026-06-06T08:00:00Z");

  // missing file → null (not throw)
  const missing = await readVaultJson("data/__does_not_exist.json", { preferRemote: false });
  check("missing file → null", missing === null);

  // path traversal is neutralised by safeRel (no throw, no escape)
  const traversal = await readVaultJson("../../../etc/passwd", { preferRemote: false });
  check("traversal blocked → null", traversal === null);
} finally {
  try { fs.unlinkSync(file); } catch {}
}

console.log(`test_vault_json — ${pass} passed, ${fail} failed`);
if (failures.length) console.log("FAILURES:\n  " + failures.join("\n  "));
process.exit(fail ? 1 : 0);
