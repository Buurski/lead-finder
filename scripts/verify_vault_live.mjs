#!/usr/bin/env node
/*
 * verify_vault_live.mjs — confirm the GitHub vault is reachable with the token in
 * .env.local, and that a remote-only note (not in the local mirror) loads from
 * "remote". Read-only. Prints a short report.
 *
 *   node scripts/verify_vault_live.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(REPO_ROOT);

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of fs.readFileSync(path.join(REPO_ROOT, f), "utf-8").split(/\r?\n/)) {
      const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  } catch { /* optional */ }
}

const vault = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "vault.ts")).href);

const live = await vaultLiveSafe();
async function vaultLiveSafe() {
  try { return await vault.vaultLiveCheck(); } catch (e) { return { live: false, reason: "error", detail: String(e) }; }
}

console.log(`\nVault live-check: ${live.live ? "LIVE ✅" : "not live"} (${live.reason}) — ${live.detail}`);

// Try a few notes that are NOT in the local mirror, to exercise the remote path.
for (const rel of ["claude", "soul", "context/about_business", "wiki/os/system-vision"]) {
  const note = await vault.readVaultNote(rel);
  console.log(`  ${rel.padEnd(28)} -> ok=${note.ok} source=${note.source}${note.frontmatter?.title ? ` title="${note.frontmatter.title}"` : ""}`);
}
console.log("");
