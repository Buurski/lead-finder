#!/usr/bin/env node
/*
 * test_recon.mjs — offline tests for customer-recon.ts (slugify + the no-URL
 * recon path) and the demo factory (template blend + HTML output). No network.
 *
 *   node scripts/test_recon.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const recon = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "customer-recon.ts")).href);
const factory = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demo-factory.ts")).href);
const templates = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "design-templates.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- slugify -------------------------------------------------------------
check("slug lowercases + dashes", recon.slugify("Salon Lumière") === "salon-lumiere");
check("slug danish chars", recon.slugify("Bø & Grøn Ål") === "boe-groen-aal");
check("slug strips symbols", recon.slugify("A/B   C!!") === "a-b-c");
check("slug empty -> kunde", recon.slugify("") === "kunde");

// ---- template routing ----------------------------------------------------
check("frisør -> frisor template", templates.templateForBranch("frisør").slug === "frisor");
check("restaurant -> restaurant template", templates.templateForBranch("café og restaurant").slug === "restaurant");
check("vvs -> vvs template", templates.templateForBranch("vvs og el").slug === "vvs");
check("unknown -> default template", templates.templateForBranch("ukendt branche xyz").slug === templates.DESIGN_TEMPLATES[0].slug);

// ---- recon with no URL (offline base result) ----------------------------
{
  const r = await recon.reconCustomer("", "Salon Lumière");
  check("recon no-url slug", r.slug === "salon-lumiere");
  check("recon no-url source none", r.source === "none");
  check("recon no-url has note", r.notes.length > 0);
  check("recon no-url palette empty", Array.isArray(r.palette) && r.palette.length === 0);
}

// ---- demo factory blends template + recon -------------------------------
{
  const r = await recon.reconCustomer("", "Bryggens VVS");
  const build = await factory.buildDemo("Bryggens VVS", "vvs", r, { persist: false });
  check("factory picks vvs template", build.template.slug === "vvs");
  check("factory designMd mentions name", build.designMd.includes("Bryggens VVS"));
  check("factory html is a full document", build.html.startsWith("<!doctype html>") && build.html.includes("</html>"));
  check("factory html has hero + name", build.html.includes("hero") && build.html.includes("Bryggens VVS"));
  check("factory not persisted -> demoPath null", build.demoPath === null);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all recon checks ok");
console.log(`\ntest_recon — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
