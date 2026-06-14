#!/usr/bin/env node
/*
 * test_demo_layouts.mjs — verify that composeHtml produces genuinely distinct
 * HTML structures per layout archetype, not just colour-swapped clones.
 * No network / no API key required.
 *
 *   node scripts/test_demo_layouts.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);

const factory = await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demo-factory.ts")).href
);
const templates = await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "lib", "design-templates.ts")).href
);

const { composeHtml } = factory;
const { templateBySlug } = templates;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(name);
  }
}

// Minimal empty recon stub matching ReconResult (all nullable → null, arrays empty)
const stub = {
  inputUrl: "https://x.dk",
  slug: "x",
  resolvedUrl: null,
  title: null,
  description: null,
  ogImage: null,
  favicon: null,
  themeColor: null,
  palette: [],
  headings: [],
  toneSample: null,
  images: [],
  source: "none",
  notes: [],
};

// ---- layout marker checks -----------------------------------------------

const foto = templateBySlug("foto");
const fotoHtml = composeHtml("X", foto, stub);
check('foto contains data-layout="gallery"', fotoHtml.includes('data-layout="gallery"'));

const vvs = templateBySlug("vvs");
const vvsHtml = composeHtml("X", vvs, stub);
check('vvs contains data-layout="service"', vvsHtml.includes('data-layout="service"'));
check('vvs contains tel: href (Ring CTA)', vvsHtml.includes("tel:") && vvsHtml.includes("Ring"));

const restaurant = templateBySlug("restaurant");
const restHtml = composeHtml("X", restaurant, stub);
check('restaurant contains data-layout="menu"', restHtml.includes('data-layout="menu"'));

const salon = templateBySlug("salon");
const salonHtml = composeHtml("X", salon, stub);
check('salon contains data-layout="booking"', salonHtml.includes('data-layout="booking"'));

const hudpleje = templateBySlug("hudpleje");
const hudHtml = composeHtml("X", hudpleje, stub);
check('hudpleje contains data-layout="clinic"', hudHtml.includes('data-layout="clinic"'));

const advokat = templateBySlug("advokat");
const advHtml = composeHtml("X", advokat, stub);
check('advokat contains data-layout="authority"', advHtml.includes('data-layout="authority"'));

// ---- structural differentiation beyond colours --------------------------
function stripColors(html) {
  return html.replace(/oklch\([^)]*\)|#[0-9a-fA-F]{3,6}/g, "");
}

const salonStripped = stripColors(salonHtml);
const vvsStripped = stripColors(vvsHtml);
check(
  "salon and vvs skeletons differ beyond colour (not just palette swap)",
  salonStripped !== vvsStripped
);

// ---- layout-specific content markers ------------------------------------
check(
  "gallery layout has .fullgallery or gallery placeholder class",
  fotoHtml.includes("fullgallery") || fotoHtml.includes("gallery-placeholder")
);

check(
  "service layout has akut or vagt callout",
  vvsHtml.toLowerCase().includes("akut") || vvsHtml.toLowerCase().includes("vagt")
);

check(
  "menu layout has .menu list element",
  restHtml.includes('class="menu"') || restHtml.includes("menu")
);

check(
  "booking layout has .bookingcard element",
  salonHtml.includes("bookingcard")
);

check(
  "clinic layout has certificer trust strip",
  hudHtml.toLowerCase().includes("certificer")
);

check(
  "authority layout has .profile block",
  advHtml.includes('class="profile"') || advHtml.includes('"profile"')
);

// ---- summary -------------------------------------------------------------
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
} else {
  console.log("all demo-layout checks ok");
}
console.log(`\ntest_demo_layouts — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
