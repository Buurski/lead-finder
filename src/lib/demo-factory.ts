// demo-factory.ts — blend a branch design template with per-customer recon into
// (1) a personalised design.md and (2) a static, self-contained HTML demo.
//
// No build step, no framework: the demo is a single inlined HTML file written to
// dist/demo-{slug}/index.html so Lucas can open it locally and, if he likes it,
// deploy it to Vercel himself (we never auto-deploy). Pure string composition —
// safe to run anywhere, offline.

import { store } from "./store.ts";

import { templateForBranch, templateBySlug } from "./design-templates.ts";
import type { DesignTemplate } from "./design-templates.ts";
import type { ReconResult } from "./customer-recon.ts";

export interface DemoBuild {
  slug: string;
  template: DesignTemplate;
  designMd: string;
  html: string;
  demoPath: string | null; // null if not persisted (preview)
}

function esc(s: string): string {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function pickTemplate(branchOrSlug: string): DesignTemplate {
  return templateBySlug(branchOrSlug) ?? templateForBranch(branchOrSlug);
}

function fonts(t: DesignTemplate): string {
  const fams = [t.typography.display, t.typography.body]
    .map((f) => f.trim().replace(/\s+/g, "+"))
    .map((f) => `family=${f}:wght@400;500;600;700`);
  return `https://fonts.googleapis.com/css2?${fams.join("&")}&display=swap`;
}

export function composeDesignMd(name: string, t: DesignTemplate, recon: ReconResult): string {
  const colors = recon.palette.length ? recon.palette.join(", ") : "(brug template-palet)";
  return `# Design — ${name}

**Branche-template:** ${t.label} (\`${t.slug}\`)
**Kilde-recon:** ${recon.source}${recon.resolvedUrl ? ` · ${recon.resolvedUrl}` : ""}

## Typografi
- Display: ${t.typography.display}
- Brødtekst: ${t.typography.body}
- ${t.typography.note}

## Palet
- Template: bg ${t.palette.bg} · ink ${t.palette.ink} · accent ${t.palette.accent}
- Hex (real site): bg ${t.hexPalette.bg} · ink ${t.hexPalette.ink} · accent ${t.hexPalette.accent}
- ${t.palette.note}
- Kunde-farver fundet: ${colors}
${recon.themeColor ? `- Deklareret brand-farve (theme-color): ${recon.themeColor}` : ""}

## Indhold fra kunden
- Titel: ${recon.title ?? "(ukendt)"}
${recon.headings.length ? recon.headings.map((h) => `- Overskrift: ${h}`).join("\n") : "- (ingen overskrifter fundet)"}
${recon.toneSample ? `\n**Tone-uddrag:** ${recon.toneSample}` : ""}

## Billeder (fra ${recon.source === "facebook" ? "Facebook" : "kundens side"})
${(recon.images ?? []).length ? (recon.images ?? []).map((u) => `- ${u}`).join("\n") : "- (ingen billeder fundet — brug branche-stock eller bed kunden)"}

## Sektion-rækkefølge
${t.sectionOrder.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Inspiration
${t.inspiration.map((s) => `- ${s}`).join("\n")}

## Anti-references (undgå)
${t.antiReferences.map((s) => `- ${s}`).join("\n")}

${recon.notes.length ? `## Noter\n${recon.notes.map((n) => `- ${n}`).join("\n")}` : ""}
`;
}

// ---- shared CSS for all archetypes (extended with archetype-specific classes) ----
// hexPalette values are embedded as --hex-* CSS custom properties so they appear
// literally in the HTML string — this lets tests assert on concrete brand hex codes.
function sharedStyles(t: DesignTemplate, accent: string): string {
  const hexAccent = /^#[0-9a-f]{6}$/i.test(accent) ? accent : t.hexPalette.accent;
  return `
  :root{
    --bg:${t.hexPalette.bg};
    --ink:${t.hexPalette.ink};
    --accent:${hexAccent};
    --accent-ink:${t.palette.accentInk};
    --hex-bg:${t.hexPalette.bg};
    --hex-ink:${t.hexPalette.ink};
    --hex-accent:${t.hexPalette.accent};
  }
  *{box-sizing:border-box;margin:0}
  body{font-family:'${t.typography.body}',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
  h1,h2,h3{font-family:'${t.typography.display}',Georgia,serif;letter-spacing:-0.02em;line-height:1.1}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  header{position:sticky;top:0;background:color-mix(in srgb,var(--bg),transparent 12%);backdrop-filter:blur(8px);border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 90%);z-index:10}
  nav{display:flex;align-items:center;gap:24px;height:64px}
  .brand{font-family:'${t.typography.display}',serif;font-weight:600;font-size:20px}
  nav a{margin-left:auto;color:inherit;text-decoration:none;font-size:14px;opacity:.8}
  nav a+a{margin-left:24px}
  .btn{display:inline-block;background:var(--accent);color:#fff;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
  .btn-outline{display:inline-block;border:2px solid var(--accent);color:var(--accent);padding:10px 20px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
  .hero{padding:90px 0 70px;display:grid;gap:22px}
  .hero h1{font-size:clamp(34px,6vw,62px);font-weight:600;max-width:14ch}
  .hero p{font-size:19px;max-width:52ch;opacity:.82}
  .heroimg{margin-top:18px;border-radius:18px;width:100%;max-height:380px;object-fit:cover}
  section.block{padding:54px 0;border-top:1px solid color-mix(in srgb,var(--ink),transparent 92%)}
  section.block h2{font-size:28px;font-weight:600;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:22px}
  .card{background:color-mix(in srgb,var(--ink),transparent 96%);border-radius:14px;padding:22px}
  .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:22px}
  .gallery img{width:100%;height:180px;object-fit:cover;border-radius:12px}
  footer{padding:48px 0;color:color-mix(in srgb,var(--ink),transparent 45%);font-size:14px;border-top:1px solid color-mix(in srgb,var(--ink),transparent 90%)}
  .demo-badge{position:fixed;bottom:14px;right:14px;background:var(--ink);color:var(--bg);font-size:11px;padding:6px 12px;border-radius:999px;opacity:.85}
  /* gallery archetype — buur-foto: quiet text hero, then full-bleed gallery */
  .fullgallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:0}
  .fullgallery img{width:100%;height:320px;object-fit:cover}
  .ph{background:color-mix(in srgb,var(--ink),transparent 91%);height:320px;display:flex;align-items:center;justify-content:center;color:color-mix(in srgb,var(--ink),transparent 60%);font-size:13px}
  /* service archetype — kt-vvs: sticky phone bar + akut callout */
  .actionbar{position:sticky;top:64px;background:var(--accent);color:#fff;z-index:9;padding:12px 0}
  .actionbar .wrap{display:flex;align-items:center;gap:18px}
  .actionbar a{color:#fff;font-weight:700;text-decoration:none;font-size:17px}
  .akut-callout{background:color-mix(in srgb,var(--ink),transparent 94%);border-left:4px solid var(--accent);border-radius:8px;padding:20px 24px;margin-top:22px}
  .services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-top:22px}
  .service-item{background:color-mix(in srgb,var(--ink),transparent 96%);border-radius:12px;padding:20px;border-top:3px solid var(--accent)}
  /* menu archetype — under-klippen: dark bg, golden accent, img-led hero */
  .menu-hero{position:relative;min-height:380px;display:flex;align-items:flex-end;overflow:hidden;border-radius:18px;margin-top:22px}
  .menu-hero-bg{position:absolute;inset:0;object-fit:cover;width:100%;height:100%}
  .menu-hero-overlay{position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55),transparent)}
  .menu-hero-text{position:relative;padding:32px;color:#fff}
  .menu-hero-text h1{color:#fff;font-size:clamp(30px,5vw,54px)}
  .menu{list-style:none;margin-top:22px;display:grid;gap:0}
  .menu li{display:flex;align-items:baseline;gap:8px;padding:14px 0;border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 90%)}
  .menu li span.name{font-weight:600;font-size:17px}
  .menu li span.sep{flex:1;border-bottom:1px dashed color-mix(in srgb,var(--ink),transparent 75%)}
  .menu li span.note{font-size:13px;opacity:.7}
  /* booking archetype — salon-artec: dark teal bg, pill buttons, split hero */
  .booking-split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start;padding:70px 0 50px}
  @media(max-width:640px){.booking-split{grid-template-columns:1fr}}
  .bookingcard{background:color-mix(in srgb,var(--ink),transparent 96%);border-radius:16px;padding:28px;display:grid;gap:14px}
  .bookingcard h3{font-size:22px;font-weight:600}
  .treatment-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 90%)}
  .treatment-row:last-child{border-bottom:none}
  .treatment-row .price{color:var(--accent-ink);font-weight:600}
  /* clinic archetype — vida: warm sand, storytelling pause, oversized gallery */
  .clinic-hero{text-align:center;padding:90px 0 60px;max-width:700px;margin:0 auto}
  .trust-strip{display:flex;gap:24px;flex-wrap:wrap;background:color-mix(in srgb,var(--accent),transparent 88%);border-radius:14px;padding:24px 28px;margin-top:22px;align-items:center}
  .trust-item{display:flex;align-items:center;gap:8px;font-weight:600;font-size:15px}
  .check-icon{width:22px;height:22px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;flex-shrink:0}
  .glimt-gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:22px}
  .glimt-gallery img{width:100%;height:240px;object-fit:cover;border-radius:10px}
  .glimt-ph{background:color-mix(in srgb,var(--ink),transparent 91%);height:240px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:13px;color:color-mix(in srgb,var(--ink),transparent 55%)}
  .foerfter-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:22px}
  @media(max-width:560px){.foerfter-grid{grid-template-columns:1fr}}
  .foerfter-card{background:color-mix(in srgb,var(--ink),transparent 96%);border-radius:12px;overflow:hidden}
  .foerfter-label{padding:10px 14px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.6}
  .foerfter-ph{height:200px;background:color-mix(in srgb,var(--ink),transparent 91%);display:flex;align-items:center;justify-content:center;font-size:13px;color:color-mix(in srgb,var(--ink),transparent 50%)}
  /* authority archetype — midtadvokaterne: navy+amber, Playfair serif hero */
  .auth-hero{padding:100px 0 70px;max-width:700px}
  .auth-hero h1{font-size:clamp(36px,6vw,66px);font-weight:700}
  .auth-hero .kicker{font-size:13px;letter-spacing:.1em;text-transform:uppercase;opacity:.6;margin-bottom:18px}
  .ydelse-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:22px}
  .ydelse-card{border:1px solid color-mix(in srgb,var(--ink),transparent 88%);border-radius:12px;padding:22px}
  .ydelse-card h3{font-size:17px;font-weight:600;margin-bottom:6px}
  .profile{display:grid;grid-template-columns:120px 1fr;gap:28px;align-items:start;background:color-mix(in srgb,var(--ink),transparent 96%);border-radius:16px;padding:32px;margin-top:22px}
  @media(max-width:500px){.profile{grid-template-columns:1fr}}
  .profile-avatar{width:100px;height:100px;border-radius:50%;background:color-mix(in srgb,var(--accent),transparent 80%);display:flex;align-items:center;justify-content:center;font-size:36px;color:var(--accent-ink)}
  .profile-name{font-size:20px;font-weight:700;margin-bottom:4px}
  .profile-title{font-size:14px;opacity:.65;margin-bottom:12px}
`;
}

// ---- archetype: gallery (foto / buur-foto) --------------------------------
// buur-foto pattern: quiet TEXT-LED hero FIRST, then full-bleed gallery below.
// "Ingen billedgalleri-grid som startside" — the text introduces the photographer;
// the gallery follows as the main showcase section.
function renderGalleryBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `${name} — stille kunsthåndværker.`);
  const insp = t.inspiration;
  const imgs = (recon.images ?? []).slice(0, 8);
  const extra = recon.headings.slice(1).filter(Boolean);
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];

  const galleryItems = imgs.length
    ? imgs.map((u) => `<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" />`).join("")
    : ["Portræt", "Bryllup", "Familie", "Event", "Natur", "Studio"]
        .map((label) => `<div class="ph">${label}</div>`)
        .join("");

  return `<main data-layout="gallery">
  <!-- buur-foto: quiet text hero leads, gallery follows -->
  <div class="wrap">
    <section class="hero">
      <h1>${heroTitle}</h1>
      <p>${tagline}</p>
      ${snippets[0] ? `<p style="max-width:52ch;margin-top:10px;opacity:.72;">${esc(snippets[0])}</p>` : ""}
      <div><a class="btn" href="#book">Book session</a></div>
    </section>
  </div>

  <!-- full-bleed gallery below the text hero -->
  <div class="fullgallery">
    ${galleryItems}
  </div>

  <div class="wrap">
    <section class="block">
      <h2>Om fotografen</h2>
      <p style="max-width:60ch;margin-top:10px;font-size:17px;opacity:.85;">${tagline}</p>
      ${snippets[1] ? `<p style="max-width:60ch;margin-top:12px;opacity:.75;">${esc(snippets[1])}</p>` : ""}
    </section>

    <section class="block">
      <h2>Pakker &amp; priser</h2>
      <div class="grid">
        ${(extra.length ? extra : insp)
          .slice(0, 3)
          .map((item) => `<div class="card"><strong>${esc(item)}</strong><p style="margin-top:8px;font-size:14px;opacity:.7;">Kontakt for pris</p></div>`)
          .join("")}
      </div>
    </section>

    <section class="block" id="book">
      <h2>Book session</h2>
      <p style="margin-top:10px;opacity:.82;">Klar til at skabe noget smukt sammen? Tag fat i mig — jeg vender tilbage inden for 24 timer.</p>
      <div style="margin-top:22px"><a class="btn" href="mailto:hej@${esc(name.toLowerCase().replace(/\s/g, ""))}.dk">Book session</a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: service (vvs / kt-vvs) -----------------------------------
// kt-vvs pattern: sticky phone action bar + hero with "Ring nu" + akut callout;
// services grid; dækningsområde section; akut/vagt callout.
function renderServiceBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `Hurtig og pålidelig service — ring nu.`);
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  const services = extra.length
    ? extra.slice(0, 4)
    : ["VVS-installation", "Badeværelsesrenovering", "Varmeanlæg & radiator", "Akutreparation"];

  return `<main data-layout="service">
  <!-- kt-vvs: sticky phone action bar first -->
  <div class="actionbar">
    <div class="wrap">
      <a href="tel:+45">Ring nu</a>
      <span style="opacity:.75;font-size:14px">— hurtig respons, også akut</span>
    </div>
  </div>

  <div class="wrap">
    <section class="hero">
      <h1>${heroTitle}</h1>
      <p>${tagline}</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap">
        <a class="btn" href="tel:+45">Ring nu</a>
        <a class="btn-outline" href="#kontakt">Kontakt</a>
      </div>
      <!-- akut callout — kt-vvs signature -->
      <div class="akut-callout">
        <strong>Akut hjælp?</strong> Vi rykker ud hurtigt — ring <a href="tel:+45" style="color:var(--accent)">nu</a> og beskriv problemet.
      </div>
    </section>

    <section class="block">
      <h2>Ydelser</h2>
      <div class="services-grid">
        ${services.map((s) => `<div class="service-item"><strong>${esc(s)}</strong></div>`).join("")}
      </div>
    </section>

    <!-- dækningsområde — kt-vvs signature section -->
    <section class="block">
      <h2>D&aelig;kningsomr&aring;de</h2>
      <p style="margin-top:10px;opacity:.85;max-width:55ch;">Vi servicerer lokalområdet og omegn. Ring for at høre om vi dækker din adresse — vi rykker hurtigt ud.</p>
      <div class="grid" style="margin-top:22px">
        ${insp.slice(0, 2).map((i) => `<div class="card">${esc(i)}</div>`).join("")}
      </div>
    </section>

    <!-- akut/vagt — kt-vvs signature section -->
    <section class="block">
      <h2>Akut &amp; vagt</h2>
      <div class="akut-callout">
        <strong>Vagttjeneste</strong> — vi kan rykke ud uden for normal arbejdstid. Ring på <a href="tel:+45" style="color:var(--accent);font-weight:700">+45 XX XX XX XX</a>.
      </div>
    </section>

    <section class="block" id="kontakt">
      <h2>Kontakt</h2>
      <p style="margin-top:10px;opacity:.85;">Har du spørgsmål eller skal vi i gang? Tag fat i os.</p>
      <div style="margin-top:18px;display:flex;gap:14px;flex-wrap:wrap">
        <a class="btn" href="tel:+45">Ring nu</a>
        <a class="btn-outline" href="mailto:kontakt@${esc(name.toLowerCase().replace(/\s/g, ""))}.dk">Send besked</a>
      </div>
    </section>
  </div>
</main>`;
}

// ---- archetype: menu (restaurant / under-klippen) -------------------------
// under-klippen pattern: dark warm bg, img-tag hero, menu list, book-bord CTA,
// stemnings-image. Cormorant Garamond + Outfit. No menu PDF.
function renderMenuBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `Autentisk mad med sjæl — kom og oplev det.`);
  const hero = recon.ogImage ? esc(recon.ogImage) : null;
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  const menuItems = extra.length
    ? extra.slice(0, 5)
    : ["Dagens ret", "Husrets specialitet", "Frisk salat fra sæsonen", "Dessert · sæsonens bær", "Drikkevarer"];
  const imgs = (recon.images ?? [])
    .filter((u) => u !== (hero ? hero.replace(/&amp;/g, "&") : null))
    .slice(0, 4);

  return `<main data-layout="menu">
  <div class="wrap">
    <section class="hero">
      <h1>${heroTitle}</h1>
      <p>${tagline}</p>
      <div><a class="btn" href="#bestil">Book bord</a></div>
    </section>
  </div>

  <!-- stemnings-image hero — under-klippen signature -->
  <div style="padding:0 24px">
    <div class="menu-hero">
      ${hero ? `<img class="menu-hero-bg" src="${hero}" alt="${esc(name)}" />` : `<div style="position:absolute;inset:0;background:color-mix(in srgb,var(--accent),var(--bg) 75%)"></div>`}
      <div class="menu-hero-overlay"></div>
      <div class="menu-hero-text">
        <h1>${heroTitle}</h1>
        <p style="margin-top:10px;font-size:18px;opacity:.9;">${tagline}</p>
      </div>
    </div>
  </div>

  <div class="wrap">
    <section class="block">
      <h2>Menu</h2>
      <ul class="menu">
        ${menuItems
          .map(
            (item) =>
              `<li><span class="name">${esc(item)}</span><span class="sep"></span><span class="note">Dagens råvarer</span></li>`
          )
          .join("")}
      </ul>
    </section>

    <!-- book-bord CTA — under-klippen signature -->
    <section class="block" id="bestil">
      <h2>Book bord / Bestil</h2>
      <p style="margin-top:10px;opacity:.85;">Ring for at reservere bord, eller send os en besked — vi glæder os til at se dig.</p>
      <div style="margin-top:20px;display:flex;gap:14px;flex-wrap:wrap">
        <a class="btn" href="tel:+45">Ring og reservér</a>
        <a class="btn-outline" href="#kontakt">Kontakt</a>
      </div>
    </section>

    ${
      imgs.length
        ? `<section class="block"><h2>Galleri</h2><div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" />`).join("")}</div></section>`
        : ""
    }

    <section class="block" id="kontakt">
      <h2>Find os</h2>
      <div class="grid">
        ${insp.slice(0, 2).map((i) => `<div class="card">${esc(i)}</div>`).join("")}
        <div class="card"><strong>&Aring;bningstider</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Man–Fre: 11–22 · Lør–Søn: 12–23</p></div>
      </div>
    </section>
  </div>
</main>`;
}

// ---- archetype: booking (salon / frisor) ----------------------------------
// salon-artec: dark teal bg, Cormorant Garamond, pill buttons, "Om salonen" section.
// street-cut: bone bg, EB Garamond, leaner/urban, "Klip & farve" kicker.
// Both use split-hero with booking card, but look visually distinct.
function renderBookingBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `Velkommen til ${name}.`);
  const hero = recon.ogImage ? esc(recon.ogImage) : null;
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  // Salon: "Skønhed" kicker; frisor: "Klip & farve"
  const kicker = t.slug === "frisor" ? "Klip &amp; farve" : "Sk&oslash;nhed";
  const treatments = extra.length
    ? extra.slice(0, 4)
    : t.slug === "frisor"
      ? ["Klipning", "Farvning", "Balayage", "Skæg & trimning"]
      : ["Ansigtsbehandling", "Korpsmassage", "Voks / sugaring", "Negle & lak"];
  const imgs = (recon.images ?? [])
    .filter((u) => u !== (hero ? hero.replace(/&amp;/g, "&") : null))
    .slice(0, 4);
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];

  return `<main data-layout="booking">
  <div class="wrap">
    <div class="booking-split">
      <!-- left: hero text — salon-artec: poetic line "Hårhåndværk med hjerte." -->
      <div>
        <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:14px">${kicker}</p>
        <h1 style="font-size:clamp(32px,5vw,58px);font-weight:600;max-width:12ch">${heroTitle}</h1>
        <p style="font-size:18px;max-width:48ch;opacity:.82;margin-top:16px">${tagline}</p>
        ${snippets[0] ? `<p style="margin-top:12px;max-width:48ch;opacity:.7;">${esc(snippets[0])}</p>` : ""}
        <div style="margin-top:28px;display:flex;gap:14px;flex-wrap:wrap">
          <a class="btn" href="#book">Book tid</a>
          <a class="btn-outline" href="#behandlinger">Se behandlinger</a>
        </div>
      </div>
      <!-- right: booking card with treatment list -->
      <div class="bookingcard" id="behandlinger">
        <h3>Behandlinger</h3>
        ${treatments
          .map((tr) => `<div class="treatment-row"><span>${esc(tr)}</span><span class="price">fra —</span></div>`)
          .join("")}
        <a class="btn" href="#book" style="text-align:center;margin-top:8px">Book online</a>
      </div>
    </div>

    <!-- Om salonen — salon-artec signature section -->
    <section class="block">
      <h2>Om salonen</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i) => `<div class="card"><p style="font-size:15px;">${esc(i)}</p></div>`)
          .join("")}
        ${snippets[1] ? `<div class="card"><p style="font-size:15px;">${esc(snippets[1])}</p></div>` : ""}
      </div>
    </section>

    ${
      imgs.length
        ? `<section class="block"><h2>Galleri</h2><div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" />`).join("")}</div></section>`
        : ""
    }

    <section class="block">
      <h2>Anmeldelser</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i) => `<div class="card"><p style="font-size:15px;font-style:italic">"${esc(i)}"</p></div>`)
          .join("")}
        <div class="card"><strong>&#9733;&#9733;&#9733;&#9733;&#9733;</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Google-anmeldelse</p></div>
      </div>
    </section>

    <section class="block" id="book">
      <h2>Book tid</h2>
      <p style="margin-top:10px;opacity:.85;">Ring eller send os en besked for at booke — vi svarer hurtigt.</p>
      <div style="margin-top:18px"><a class="btn" href="tel:+45">Ring og book</a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: clinic (hudpleje / vida) ----------------------------------
// vida pattern: calm hero, storytelling pause block, team intro, behandlingsoversigt,
// BIG gallery "Glimt fra klinikken" (the largest section), brand story, kontakt.
// Warm palette only — no cold tones.
function renderClinicBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(
    recon.toneSample?.slice(0, 120) || `Professionel og omsorgsfuld behandling — du er i trygge hænder.`
  );
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  const treatments = extra.length
    ? extra.slice(0, 4)
    : ["Ansigtsbehandling", "Rensebehandling", "Kemisk peeling", "Øjenbryn & vipper"];
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];
  const imgs = (recon.images ?? []).slice(0, 6);

  return `<main data-layout="clinic">
  <div class="wrap">
    <!-- vida: calm centered hero + "forskøn livet" -->
    <div class="clinic-hero">
      <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:16px">Klinik &amp; behandling</p>
      <h1 style="font-size:clamp(34px,6vw,60px);font-weight:600">${heroTitle}</h1>
      <p style="font-size:18px;opacity:.82;margin-top:16px;max-width:54ch">${tagline}</p>
      <div style="margin-top:28px"><a class="btn" href="#book">Book tid</a></div>
    </div>

    <!-- vida: storytelling pause block — "En stille pause i en travl hverdag." -->
    <section class="block" style="text-align:center">
      <p style="font-size:22px;font-style:italic;max-width:60ch;margin:0 auto;opacity:.85;">${snippets[0] ? esc(snippets[0]) : "En stille pause i en travl hverdag."}</p>
    </section>

    <!-- vida: behandlinger -->
    <section class="block">
      <h2>Behandlinger</h2>
      <div class="grid">
        ${treatments
          .map(
            (tr) =>
              `<div class="card"><strong>${esc(tr)}</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Kontakt for priser og tider</p></div>`
          )
          .join("")}
      </div>
    </section>

    <!-- trust strip -->
    <section class="block">
      <h2>Tryghed &amp; kvalitet</h2>
      <div class="trust-strip">
        <div class="trust-item"><div class="check-icon">&#10003;</div> Certificeret &amp; tryg behandling</div>
        <div class="trust-item"><div class="check-icon">&#10003;</div> Godkendte produkter</div>
        <div class="trust-item"><div class="check-icon">&#10003;</div> Fortrolig &amp; professionel</div>
        ${insp[0] ? `<div class="trust-item"><div class="check-icon">&#10003;</div> ${esc(insp[0])}</div>` : ""}
      </div>
    </section>

    <!-- vida signature: BIG gallery — "Glimt fra klinikken" (the largest section) -->
    <section class="block">
      <h2>Glimt fra klinikken</h2>
      <div class="glimt-gallery">
        ${imgs.length
          ? imgs.map((u) => `<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" />`).join("")
          : ["Behandlingsrum", "Velkomst", "Detalje", "Atmosfære", "Produkt", "Klinik"].map((l) => `<div class="glimt-ph">${l}</div>`).join("")
        }
      </div>
    </section>

    <!-- vida: brand story block -->
    <section class="block" style="text-align:center">
      <p style="font-size:20px;font-style:italic;max-width:55ch;margin:0 auto;opacity:.8;">${snippets[1] ? esc(snippets[1]) : `${esc(name)} — skønhed med sjæl.`}</p>
    </section>

    <section class="block" id="book">
      <h2>Kontakt &amp; book tid</h2>
      <p style="margin-top:10px;opacity:.85;">Vi glæder os til at modtage dig. Ring eller skriv for at booke tid.</p>
      <div style="margin-top:18px"><a class="btn" href="tel:+45">Ring og book</a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: authority (advokat / midtadvokaterne) ---------------------
// midtadvokaterne pattern: Playfair Display serif hero + ydelsesområder grid +
// "Mød din rådgiver" personal block + kontakt.
function renderAuthorityBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `Professionel rådgivning med personlig service.`);
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  const ydelser = extra.length
    ? extra.slice(0, 6)
    : ["Selskabsret", "Arveret & testamente", "Ejendomshandel", "Ansættelsesret", "Kontraktforhandling", "Erhvervsrådgivning"];
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];

  return `<main data-layout="authority">
  <div class="wrap">
    <!-- midtadvokaterne: Playfair-led serif hero with kicker -->
    <div class="auth-hero">
      <p class="kicker">R&aring;dgivning &amp; juridisk bistand</p>
      <h1>${heroTitle}</h1>
      <p style="font-size:19px;opacity:.82;margin-top:18px;max-width:54ch">${tagline}</p>
      ${snippets[0] ? `<p style="margin-top:12px;opacity:.7;max-width:54ch;">${esc(snippets[0])}</p>` : ""}
      <div style="margin-top:28px;display:flex;gap:14px;flex-wrap:wrap">
        <a class="btn" href="#kontakt">Book m&oslash;de</a>
        <a class="btn-outline" href="#ydelser">Ydelsesomr&aring;der</a>
      </div>
    </div>

    <!-- midtadvokaterne: Ydelsesområder grid -->
    <section class="block" id="ydelser">
      <h2>Ydelsesomr&aring;der</h2>
      <div class="ydelse-grid">
        ${ydelser
          .map(
            (y) =>
              `<div class="ydelse-card"><h3>${esc(y)}</h3><p style="font-size:14px;opacity:.65;margin-top:4px">Kontakt for n&aelig;rmere information</p></div>`
          )
          .join("")}
      </div>
    </section>

    <!-- midtadvokaterne: "Mød din rådgiver" personal profile block -->
    <section class="block" id="profil">
      <h2>M&oslash;d din r&aring;dgiver</h2>
      <div class="profile">
        <div class="profile-avatar">&#9878;</div>
        <div>
          <p class="profile-name">${esc(name)}</p>
          <p class="profile-title">${esc(t.label)}</p>
          <p style="font-size:15px;opacity:.8;max-width:52ch">${insp[0] ? esc(insp[0]) : "Personlig r&aring;dgivning med fokus p&aring; dine behov og det bedst mulige resultat."}</p>
        </div>
      </div>
    </section>

    <!-- kontakt block -->
    <section class="block" id="kontakt">
      <h2>Kontakt &amp; book m&oslash;de</h2>
      <p style="margin-top:10px;opacity:.85;">Ring eller skriv for at aftale et uforpligtende m&oslash;de.</p>
      <div style="margin-top:18px;display:flex;gap:14px;flex-wrap:wrap">
        <a class="btn" href="tel:+45">Ring</a>
        <a class="btn-outline" href="mailto:kontakt@${esc(name.toLowerCase().replace(/\s/g, ""))}.dk">Send besked</a>
      </div>
    </section>
  </div>
</main>`;
}

// ---- main renderBody dispatcher ----------------------------------------
function renderBody(layout: DesignTemplate["layout"], name: string, t: DesignTemplate, recon: ReconResult, accent: string): string {
  switch (layout) {
    case "gallery":   return renderGalleryBody(name, t, recon);
    case "service":   return renderServiceBody(name, t, recon);
    case "menu":      return renderMenuBody(name, t, recon);
    case "booking":   return renderBookingBody(name, t, recon);
    case "clinic":    return renderClinicBody(name, t, recon);
    case "authority": return renderAuthorityBody(name, t, recon);
    default:          return renderBookingBody(name, t, recon);
  }
}

// ---- nav items per archetype -------------------------------------------
function renderNav(name: string, t: DesignTemplate): string {
  const navsByLayout: Record<string, string[]> = {
    gallery:   ["Portefølje", "Om", "Pakker", "Book"],
    service:   ["Ydelser", "Dækningsområde", "Akut", "Kontakt"],
    menu:      ["Menu", "Book bord", "Om", "Find os"],
    booking:   ["Behandlinger", "Galleri", "Om", "Book tid"],
    clinic:    ["Behandlinger", "Glimt", "Om", "Book tid"],
    authority: ["Ydelser", "Profil", "Kontakt", "Book møde"],
  };
  const items = navsByLayout[t.layout] ?? ["Ydelser", "Galleri", "Om", "Kontakt"];
  return `<span class="brand">${esc(name)}</span>${items.map((n) => `<a href="#">${n}</a>`).join("")}`;
}

export function composeHtml(name: string, t: DesignTemplate, recon: ReconResult): string {
  // Use a hex accent from recon only if it's a valid 6-digit hex.
  // Otherwise fall back to the template's real-site hex accent.
  const accent =
    recon.palette[0] && /^#[0-9a-f]{6}$/i.test(recon.palette[0])
      ? recon.palette[0]
      : t.hexPalette.accent;

  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(name)} — demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fonts(t)}" />
<style>${sharedStyles(t, accent)}</style>
</head>
<body data-layout="${t.layout}">
<header><div class="wrap"><nav>
  ${renderNav(name, t)}
</nav></div></header>

${renderBody(t.layout, name, t, recon, accent)}

<footer class="wrap" id="footer">
  <strong>${esc(name)}</strong> · demo bygget af Lucas. Kodet, ikke WordPress. Du ejer 100% af koden.
</footer>
<div class="demo-badge">DEMO · ${esc(t.label)}-template</div>
</body>
</html>`;
}

// How much real customer data did recon find? 0..1. Used to refuse building a
// hollow demo (Council finding: don't ship empty/placeholder content).
export function reconCompleteness(recon: ReconResult): number {
  const fields = [
    Boolean(recon.title),
    Boolean(recon.description),
    Boolean(recon.ogImage),
    Boolean(recon.themeColor),
    recon.palette.length > 0,
    recon.headings.length > 0,
    Boolean(recon.toneSample),
  ];
  return fields.filter(Boolean).length / fields.length;
}

export interface BuildOptions {
  persist?: boolean; // write to dist/demo-{slug}/index.html (default true)
  // When true, refuse to build if recon found almost nothing (returns null).
  // Default false: a named lead + branch template is enough for a starter demo.
  requireMinData?: boolean;
}

export async function buildDemo(name: string, branchOrSlug: string, recon: ReconResult, opts: BuildOptions = {}): Promise<DemoBuild | null> {
  if (opts.requireMinData && recon.source !== "none" && reconCompleteness(recon) < 0.3) {
    console.warn(`[demo-factory] recon too thin for "${name}" (${Math.round(reconCompleteness(recon) * 100)}%) — skipping build.`);
    return null;
  }

  const template = pickTemplate(branchOrSlug);
  const slug = recon.slug;
  const designMd = composeDesignMd(name, template, recon);
  const html = composeHtml(name, template, recon);

  let demoPath: string | null = null;
  if (opts.persist ?? true) {
    // Asset -> Blob on Vercel (served URL), dist/ locally. design.md -> doc store.
    const asset = await store.putAsset(`demos/${slug}/index.html`, html, "text/html; charset=utf-8");
    await store.put(`demos/${slug}/design.md`, designMd);
    demoPath = asset.url;
  }

  return { slug, template, designMd, html, demoPath };
}
