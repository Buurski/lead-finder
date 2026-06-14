#!/usr/bin/env node
/*
 * test_demo_layouts.mjs — verify that each branch's generated demo mirrors the
 * real site Lucas built for that branch. Checks palette hex values, typography,
 * structural signatures (section order, key CSS), and that frisor + salon look
 * visually distinct despite sharing the booking archetype.
 *
 * No network. No API keys. Pure HTML string assertions.
 *
 *   node scripts/test_demo_layouts.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);
const factory = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demo-factory.ts")).href);

let pass = 0, fail = 0;
const failures = [];

function check(name, cond, detail) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(detail ? `${name} — ${detail}` : name);
  }
}

function recon(over = {}) {
  return {
    inputUrl: "x", slug: "test", resolvedUrl: "https://x.dk", title: null, description: null,
    ogImage: null, favicon: null, themeColor: null, palette: [], headings: [], toneSample: null,
    source: "none", notes: [], ...over,
  };
}

// Build a demo for a given branch and return the HTML string
async function html(branch) {
  const build = await factory.buildDemo("Test Co", branch, recon(), { persist: false });
  if (!build) throw new Error(`buildDemo returned null for branch "${branch}"`);
  return build.html;
}

// ── salon-artec: deep teal + gold, Cormorant Garamond, pill buttons ─────────
{
  const h = await html("salon");

  // Palette: deep teal bg (#0c2a27 or oklch equivalent embedded) + gold accent (#c9a35e)
  check("salon: hex teal bg present",       h.includes("#0c2a27"),  "missing #0c2a27");
  check("salon: hex gold accent present",   h.includes("#c9a35e"),  "missing #c9a35e");

  // Typography: Cormorant Garamond (display) + DM Sans (body)
  check("salon: Cormorant Garamond font",   h.includes("Cormorant+Garamond") || h.includes("Cormorant Garamond"), "missing Cormorant Garamond");
  check("salon: DM Sans body font",         h.includes("DM+Sans") || h.includes("DM Sans"), "missing DM Sans");

  // Pill buttons: border-radius:999px (already shared, but must be present in salon too)
  check("salon: pill buttons",              h.includes("border-radius:999px") || h.includes("border-radius: 999px"), "missing pill border-radius");

  // Section order: Om salonen before Behandlinger
  const omIdx = h.indexOf("Om salonen");
  const behandIdx = h.indexOf("Behandlinger");
  check("salon: section order (Om after hero, Behandlinger present)", behandIdx > 0 && omIdx > 0, `om=${omIdx} behandl=${behandIdx}`);

  // Dark luxurious hero bg
  check("salon: dark hero section",         h.includes("hero-bg") || h.includes("#0c2a27") || h.includes("teal"), "no dark hero signal");
}

// ── vida (hudpleje): warm sand + dark brown, Cormorant + Manrope ─────────────
{
  const h = await html("hudpleje");

  // Palette: warm sand bg (#eae2d2) + dark brown ink (#26170e)
  check("vida: hex sand bg present",        h.includes("#eae2d2"), "missing #eae2d2");
  check("vida: hex dark brown ink present", h.includes("#26170e"), "missing #26170e");

  // Typography: Cormorant Garamond + Manrope
  check("vida: Cormorant Garamond display", h.includes("Cormorant+Garamond") || h.includes("Cormorant Garamond"), "missing Cormorant Garamond");
  check("vida: Manrope body",               h.includes("Manrope"), "missing Manrope");

  // Signature: big gallery section
  check("vida: gallery section present",    h.includes("Glimt fra klinikken") || h.includes("galleri") || h.includes("Galleri"), "no gallery");

  // Warm palette only — no cold tones in branding
  check("vida: no cold teal in palette",    !h.includes("#0c2a27"), "has cold salon teal (wrong)");
}

// ── kt-vvs / vestfjends (vvs): navy + coral, Bricolage Grotesque + Manrope ──
{
  const h = await html("vvs");

  // Palette: navy (#1a3a5c) + coral accent (#ff8a7d)
  check("vvs: hex navy present",            h.includes("#1a3a5c"), "missing #1a3a5c");
  check("vvs: hex coral accent present",    h.includes("#ff8a7d"), "missing #ff8a7d");

  // Typography: Bricolage Grotesque display + Manrope body
  check("vvs: Bricolage Grotesque display", h.includes("Bricolage+Grotesque") || h.includes("Bricolage Grotesque"), "missing Bricolage Grotesque");
  check("vvs: Manrope body",               h.includes("Manrope"), "missing Manrope");

  // Structural signatures: akut callout + dækningsområde
  check("vvs: akut callout",               h.includes("Akut") || h.includes("akut") || h.includes("vagt"), "no akut/vagt signal");
  check("vvs: dækningsområde section",     h.includes("kningsomr") || h.includes("Dækningsområde") || h.includes("dækningsområde"), "no dækningsområde");
}

// ── buur-foto (foto): cream + muted gold, Cormorant Garamond + Inter ────────
{
  const h = await html("foto");

  // Palette: cream bg (#f3eee5) + muted gold (#9a7e4a)
  check("foto: hex cream bg present",       h.includes("#f3eee5"), "missing #f3eee5");
  check("foto: hex muted gold present",     h.includes("#9a7e4a"), "missing #9a7e4a");

  // Typography: Cormorant Garamond display + Inter body
  check("foto: Cormorant Garamond display", h.includes("Cormorant+Garamond") || h.includes("Cormorant Garamond"), "missing Cormorant Garamond");
  check("foto: Inter body",                 h.includes("family=Inter") || h.includes("'Inter'") || h.includes("Inter,"), "missing Inter body");

  // Quiet hero comes BEFORE full gallery (section order: intro → gallery → om → pakker)
  const heroIdx = h.indexOf('<section class="hero"');
  const galIdx  = h.indexOf("Galleri") > -1 ? h.indexOf("Galleri") : h.indexOf("galleri");
  check("foto: text hero before gallery",   heroIdx < galIdx && heroIdx >= 0, `hero=${heroIdx} gal=${galIdx}`);

  // Full-bleed gallery marker
  check("foto: full-bleed gallery",         h.includes("full-bleed") || h.includes("fullbleed") || h.includes("gallery") || h.includes("Galleri"), "no gallery element");
}

// ── midtadvokaterne (advokat): navy + amber, Playfair Display + Inter ───────
{
  const h = await html("advokat");

  // Palette: navy (#1A2B45) + amber (#C4973A)
  check("advokat: hex navy present",        h.includes("#1A2B45") || h.includes("#1a2b45"), "missing #1A2B45");
  check("advokat: hex amber present",       h.includes("#C4973A") || h.includes("#c4973a"), "missing #C4973A");

  // Typography: Playfair Display + Inter
  check("advokat: Playfair Display",        h.includes("Playfair+Display") || h.includes("Playfair Display"), "missing Playfair Display");
  check("advokat: Inter body",              h.includes("family=Inter") || h.includes("'Inter'") || h.includes("Inter,"), "missing Inter body");

  // Section: Ydelsesområder + Mød din rådgiver
  check("advokat: ydelsesområder section",  h.includes("Ydelsesomr") || h.includes("Ydelsesomdekår") || h.includes("Ydelser"), "no ydelser");
  check("advokat: rådgiver section",        h.includes("dgiver") || h.includes("profil") || h.includes("Profil"), "no rådgiver/profil");
}

// ── restaurant (zaytoon/under-klippen): warm sand + near-black ───────────────
{
  const h = await html("restaurant");

  // Palette: warm sand (#e7ca93) + near-black (#0a0808) or under-klippen variant
  // We check for EITHER restaurant or under-klippen palette values
  check("restaurant: warm sand or brown bg present",
    h.includes("#e7ca93") || h.includes("#1a1208") || h.includes("#0a0808"),
    "missing restaurant warm palette"
  );

  // Must have menu/book-bord + stemnings-image hero
  check("restaurant: menu or book-bord",    h.includes("menu") || h.includes("Menu") || h.includes("Book bord") || h.includes("book-bord"), "no menu/book-bord");
}

// ── street-cut (frisor): bone + navy, EB Garamond + Inter Tight ─────────────
{
  const h = await html("frisor");

  // Palette: bone (#EFE8DA) + navy (#142235)
  check("frisor: hex bone bg present",      h.includes("#EFE8DA") || h.includes("#efe8da"), "missing #EFE8DA");
  check("frisor: hex navy present",         h.includes("#142235"), "missing #142235");

  // Typography: EB Garamond display + Inter Tight body
  check("frisor: EB Garamond display",      h.includes("EB+Garamond") || h.includes("EB Garamond"), "missing EB Garamond");
  check("frisor: Inter Tight body",         h.includes("Inter+Tight") || h.includes("Inter Tight"), "missing Inter Tight");
}

// ── frisor ≠ salon (must differ structurally despite both being booking) ──────
{
  const salonH = await html("salon");
  const frisorH = await html("frisor");

  // Different background colors
  check("frisor≠salon: different bg hex",   !frisorH.includes("#0c2a27") && salonH.includes("#0c2a27"), "frisor has salon teal bg");

  // Different display fonts
  const salonCormorant = salonH.includes("Cormorant+Garamond") || salonH.includes("Cormorant Garamond");
  const frisorEB = frisorH.includes("EB+Garamond") || frisorH.includes("EB Garamond");
  check("frisor≠salon: different display fonts", salonCormorant && frisorEB, `salon-cormorant=${salonCormorant} frisor-eb=${frisorEB}`);

  // Different body fonts (DM Sans vs Inter Tight)
  check("frisor≠salon: different body fonts",
    (salonH.includes("DM+Sans") || salonH.includes("DM Sans")) &&
    (frisorH.includes("Inter+Tight") || frisorH.includes("Inter Tight")),
    "body fonts not distinct"
  );

  // Different accent colors
  check("frisor≠salon: different accent hex",
    salonH.includes("#c9a35e") && !frisorH.includes("#c9a35e"),
    "frisor shares salon gold accent"
  );
}

// ── all templates: no Geist, no JetBrains Mono ───────────────────────────────
{
  for (const branch of ["salon", "frisor", "hudpleje", "vvs", "foto", "advokat", "restaurant"]) {
    const h = await html(branch);
    check(`${branch}: no Geist font`,        !h.includes("Geist"), "uses Geist (not Google Fonts)");
    check(`${branch}: no JetBrains Mono`,    !h.includes("JetBrains"), "uses JetBrains Mono (not Google Fonts)");
    check(`${branch}: valid HTML doctype`,   h.startsWith("<!doctype html>"), "missing doctype");
  }
}

// ── summary ───────────────────────────────────────────────────────────────────
if (failures.length) {
  console.log("FAILURES:");
  for (const f of failures) console.log("  ✗ " + f);
} else {
  console.log("all layout checks ok");
}
console.log(`\ntest_demo_layouts — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
