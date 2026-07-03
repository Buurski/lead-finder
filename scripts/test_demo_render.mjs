#!/usr/bin/env node
/*
 * test_demo_render.mjs — the demo factory must never emit the literal
 * "Personligt indhold..." placeholder, must use real recon data when present,
 * and must refuse to build a hollow demo when requireMinData is set. No network.
 *
 *   node scripts/test_demo_render.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const factory = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demo-factory.ts")).href);
const demos = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demos.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

function recon(over = {}) {
  return {
    inputUrl: "x", slug: "test", resolvedUrl: "https://x.dk", title: null, description: null,
    ogImage: null, favicon: null, themeColor: null, palette: [], headings: [], toneSample: null,
    source: "website", notes: [], ...over,
  };
}

const full = recon({
  title: "Salon Lumière", description: "Balayage og bryllupsstyling i hjertet af Aarhus.",
  ogImage: "https://x.dk/hero.jpg", themeColor: "#b8860b", palette: ["#b8860b", "#3a2f2f"],
  headings: ["Salon Lumière", "Vores behandlinger", "Mød holdet"],
  toneSample: "Vi har specialiseret os i balayage og bryllupsstyling gennem mange år. Hos os er du i trygge hænder.",
});
const medium = recon({ title: "Bryggens VVS", headings: ["Bryggens VVS", "Vagtservice"], palette: ["#2b6cb0"] });
const low = recon({ source: "none", resolvedUrl: null });

// ---- no literal placeholder, ever ---------------------------------------
for (const [label, r] of [["full", full], ["medium", medium], ["low", low]]) {
  const build = await factory.buildDemo("Test " + label, "salon", r, { persist: false });
  check(`[${label}] build produced`, !!build);
  check(`[${label}] no 'Personligt indhold' placeholder`, !build.html.includes("Personligt indhold"));
  check(`[${label}] is a full HTML doc`, build.html.startsWith("<!doctype html>"));
}

// ---- full recon data appears in the demo --------------------------------
{
  const build = await factory.buildDemo("Salon Lumière", "salon", full, { persist: false });
  check("full: customer heading used", build.html.includes("Vores behandlinger") || build.html.includes("Mød holdet"));
  check("full: tone sentence used", build.html.includes("balayage og bryllupsstyling"));
}

// ---- completeness + min-data guard --------------------------------------
{
  check("completeness full > 0.5", factory.reconCompleteness(full) > 0.5);
  check("completeness low === 0", factory.reconCompleteness(low) === 0);
  // requireMinData refuses a thin *fetched* recon, but allows a no-URL template build
  const thinFetched = recon({ source: "website" }); // fetched but empty
  const refused = await factory.buildDemo("Thin Co", "salon", thinFetched, { persist: false, requireMinData: true });
  check("requireMinData refuses thin fetched recon (null)", refused === null);
  const templateOnly = await factory.buildDemo("NoUrl Co", "salon", low, { persist: false, requireMinData: true });
  check("requireMinData still allows no-URL template build", templateOnly !== null);
}

// ---- pickDemos routing: bar/grill/pub → food demos, not service default ----
// (pickDemoPair blev til pickDemos 2026-06-23: CLINIC giver bevidst 1 demo.)
{
  const isFood = (pair) => pair.every((d) => /zaytoon|under-klippen/.test(d.url));
  check("Bar → food demos (not vestfjends)", isFood(demos.pickDemos("Bar", "Andy's")) && !demos.pickDemos("Bar", "Andy's").some((d) => /vestfjends/.test(d.url)));
  check("Grill → food demos", isFood(demos.pickDemos("Grill", "Byens Grill")));
  check("Pub → food demos", isFood(demos.pickDemos("Pub", "The Old Pub")));
  check("Bodega → food demos", isFood(demos.pickDemos("Bodega", "Hjørnets Bodega")));
  // regressions: barber still barber, beauty still beauty (word-boundary \bbar\b)
  check("Barber still → streetcut (not food)", demos.pickDemos("Barber", "Tony's Barbershop").some((d) => /streetcut/.test(d.url)));
  check("Frisør still → salon", demos.pickDemos("Frisør", "Salon X").some((d) => /salon-artec/.test(d.url)));
  // CLINIC = bevidst single-demo (vida) — 1-2 demos er kontrakten
  const clinic = demos.pickDemos("Hudpleje", "Klinik Ro");
  check("Clinic → single vida demo", clinic.length === 1 && /vida/.test(clinic[0].url));
  check("pickDemos always returns 1-2 demos", [demos.pickDemos("Bar", "A"), demos.pickDemos("Frisør", "B"), clinic].every((p) => p.length >= 1 && p.length <= 2));
  // Professionelle rådgivere → midtadvokaterne (2026-07-03, tynd non-food dækning)
  check("Advokat → midtadvokaterne", demos.pickDemos("Advokat", "Advokathuset Midt").some((d) => /midtadvokaterne/.test(d.url)));
  check("Revisor → midtadvokaterne", demos.pickDemos("Revisor", "Tal & Regnskab").some((d) => /midtadvokaterne/.test(d.url)));
  check("Ejendomsmægler → midtadvokaterne", demos.pickDemos("Ejendomsmægler", "Bolig Midt").some((d) => /midtadvokaterne/.test(d.url)));
  check("Advokat er ikke i medicinsk-rute (2 demos)", demos.pickDemos("Advokat", "Advokathuset Midt").length === 2);
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all demo-render checks ok");
console.log(`\ntest_demo_render — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
