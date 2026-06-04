#!/usr/bin/env node
/*
 * test_vault.mjs — offline tests for src/lib/vault.ts pure helpers + the
 * local-first read against the in-repo KnowledgeOS/ mirror. No network needed
 * (remote fallback is never reached because the seeded notes exist locally).
 *
 *   node scripts/test_vault.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
process.chdir(REPO_ROOT); // vault reads relative to cwd
const vault = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "vault.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- parseFrontmatter ----------------------------------------------------
{
  const { frontmatter, body } = vault.parseFrontmatter(`---\ntitle: Hej\ndomain: vida.dk\n---\n\n# Krop\ntekst`);
  check("fm title", frontmatter.title === "Hej");
  check("fm domain", frontmatter.domain === "vida.dk");
  check("body after fm", body.includes("# Krop"));
}
{
  const { frontmatter, body } = vault.parseFrontmatter(`ingen frontmatter her`);
  check("no fm -> empty obj", Object.keys(frontmatter).length === 0);
  check("no fm -> body is whole", body === "ingen frontmatter her");
}
{
  // quoted values stripped
  const { frontmatter } = vault.parseFrontmatter(`---\ntitle: "Med citat"\n---\nx`);
  check("fm strips quotes", frontmatter.title === "Med citat");
}

// ---- local-first read (seeded notes exist) ------------------------------
{
  const note = await vault.readVaultNote("context/priser");
  check("priser note ok", note.ok === true);
  check("priser note is local", note.source === "local");
  check("priser frontmatter title", note.frontmatter.title === "Priser");
}
{
  const missing = await vault.readVaultNote("does/not/exist-xyz");
  check("missing note ok:false", missing.ok === false);
  check("missing note source none", missing.source === "none");
}

// ---- path traversal guard -----------------------------------------------
{
  const evil = await vault.readVaultNote("../../package");
  check("traversal blocked (not ok)", evil.ok === false);
}

// ---- listVault finds the seeded tree ------------------------------------
{
  const { source, entries } = await vault.listVault("");
  check("listVault local", source === "local");
  check("listVault finds design docs", entries.some((e) => e.pathRel.includes("wiki/design/")));
  check("listVault finds roadmap", entries.some((e) => e.pathRel.includes("roadmap-naeste-skridt")));
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all vault checks ok");
console.log(`\ntest_vault — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
