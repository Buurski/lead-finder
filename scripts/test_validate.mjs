#!/usr/bin/env node
/*
 * test_validate.mjs — offline parts of the lead validation pass: branch-routing
 * confidence (the misfire fix) + probe-website's no-url path + isPublicEntity.
 * Network probes are not exercised here (kept deterministic).
 *
 *   node scripts/test_validate.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const { branchConfidence } = await import(libUrl("branch-confidence.ts"));
const { probeWebsite } = await import(libUrl("probe-website.ts"));
const { isPublicEntity } = await import(libUrl("qualify.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- branch confidence ---------------------------------------------------
{
  const r = branchConfidence({ name: "Salon Lumière", branch: "frisør og skønhed" });
  check("clear beauty -> skønhed", r.group === "skønhed");
  check("clear beauty is confident", r.confidence >= 0.6);
}
{
  const r = branchConfidence({ name: "Restaurant Nord", branch: "café og restaurant" });
  check("restaurant -> mad", r.group === "mad");
}
{
  const r = branchConfidence({ name: "Bryggens VVS", branch: "vvs og el" });
  check("vvs -> håndværk", r.group === "håndværk");
}
{
  // ambiguous / unknown -> neutral (the misfire guard)
  const r = branchConfidence({ name: "Forstas A/S", branch: "" });
  check("unknown branch -> neutral", r.group === "neutral");
  check("unknown branch low confidence", r.confidence < 0.6);
}
{
  // a café must NOT be routed to håndværk (the Billund Gastropub lesson)
  const r = branchConfidence({ name: "Billund Gastropub", branch: "café" });
  check("café never routed to håndværk", r.group !== "håndværk");
}

// ---- probe no-url path (deterministic, no network) -----------------------
{
  const r = await probeWebsite("");
  check("empty url -> no-url", r.status === "no-url");
}

// ---- public entity gate --------------------------------------------------
check("Tønder Kommune is public", isPublicEntity({ name: "Tønder Kommune", branch: "" }) === true);
check("sygehus in branch is public", isPublicEntity({ name: "X", branch: "sygehus" }) === true);
check("normal salon not public", isPublicEntity({ name: "Salon Lumière", branch: "frisør" }) === false);

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all validate checks ok");
console.log(`\ntest_validate — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
