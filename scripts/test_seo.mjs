#!/usr/bin/env node
/*
 * test_seo.mjs — offline tests for the pure SEO helpers (src/lib/seo.ts):
 * schema.org scanning + client tier resolution. No network.
 *
 *   node scripts/test_seo.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const seo = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "seo.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- scanSchema ----------------------------------------------------------
const localBiz = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"Salon X"}</script>
</head></html>`;
{
  const r = seo.scanSchema(localBiz);
  check("schema found", r.found === true);
  check("schema type LocalBusiness", r.types.includes("LocalBusiness"));
  check("schema count 1", r.count === 1);
}

{
  const r = seo.scanSchema("<html><body>ingen schema her</body></html>");
  check("no schema -> found false", r.found === false && r.count === 0);
}

{
  // @graph + array of types
  const graph = `<script type="application/ld+json">{"@graph":[{"@type":"Restaurant"},{"@type":["Organization","LocalBusiness"]}]}</script>`;
  const r = seo.scanSchema(graph);
  check("graph: Restaurant", r.types.includes("Restaurant"));
  check("graph: Organization", r.types.includes("Organization"));
  check("graph: dedupes LocalBusiness", r.types.filter((t) => t === "LocalBusiness").length === 1);
}

{
  const r = seo.scanSchema(`<script type="application/ld+json">{ bad json </script>`);
  check("malformed -> marked uparsbar", r.types.includes("(uparsbar)"));
}

// ---- tierForClient -------------------------------------------------------
check("VIDA -> tier_full", seo.tierForClient("VIDA") === "tier_full");
check("vida lowercase -> tier_full", seo.tierForClient("vida frisør") === "tier_full");
check("other -> tier_basic", seo.tierForClient("Salon Artec") === "tier_basic");

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all seo checks ok");
console.log(`\ntest_seo — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
