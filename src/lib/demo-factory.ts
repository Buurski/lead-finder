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
    --ease:cubic-bezier(.2,.7,.2,1);
  }
  *{box-sizing:border-box;margin:0}
  body{font-family:'${t.typography.body}',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
  h1,h2,h3{font-family:'${t.typography.display}',Georgia,serif;letter-spacing:-0.02em;line-height:1.1}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  header{position:sticky;top:0;background:color-mix(in srgb,var(--bg),transparent 12%);backdrop-filter:blur(8px) saturate(120%);border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 90%);z-index:10;transition:backdrop-filter .35s var(--ease),border-color .35s var(--ease)}
  header.scrolled{backdrop-filter:blur(12px) saturate(140%);border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 82%)}
  nav{display:flex;align-items:center;gap:24px;height:64px}
  .brand{font-family:'${t.typography.display}',serif;font-weight:600;font-size:20px}
  nav a{margin-left:auto;color:inherit;text-decoration:none;font-size:14px;opacity:.8}
  nav a+a{margin-left:24px}
  /* shared motion primitives */
  .btn{display:inline-block;background:var(--accent);color:#fff;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px;transition:opacity .25s var(--ease)}
  .btn .arr{display:inline-block;margin-left:6px;transition:transform .3s var(--ease)}
  .btn:hover .arr{transform:translateX(4px)}
  .btn-outline{display:inline-block;border:2px solid var(--accent);color:var(--accent);padding:10px 20px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px;transition:opacity .25s var(--ease)}
  /* scroll-reveal */
  .reveal{opacity:0;transform:translateY(20px);transition:opacity .8s var(--ease),transform .8s var(--ease);transition-delay:var(--d,0s)}
  .reveal.in{opacity:1;transform:none}
  @media(prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}}
  /* hover-lift cards */
  .lift{transition:transform .4s var(--ease),box-shadow .4s var(--ease)}
  .lift:hover{transform:translateY(-4px);box-shadow:0 24px 48px rgba(0,0,0,.12)}
  /* slow image hover-zoom */
  .zoom img,img.zoom{transition:transform 1.1s var(--ease)}
  .zoom:hover img,img.zoom:hover{transform:scale(1.05)}
  /* hero entrance keyframe */
  @keyframes rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
  /* hero p{font-size:19px;max-width:52ch;opacity:.82} */
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
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// buur-foto pattern: quiet TEXT-LED hero FIRST, then full-bleed gallery below.
// "Ingen billedgalleri-grid som startside" — the text introduces the photographer;
// the gallery follows as the main showcase section.
// MEDIUM-HIGH/crafted motion: word-by-word H1 reveal + polaroid rotated frames.
function renderGalleryBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `${name} — stille kunsthåndværker.`);
  const insp = t.inspiration;
  const imgs = (recon.images ?? []).slice(0, 8);
  const extra = recon.headings.slice(1).filter(Boolean);
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];

  // Word-by-word H1 reveal — buur-foto signature (MEDIUM-HIGH/crafted)
  const words = heroTitle.split(" ");
  const wordSpans = words
    .map((w, i) => `<span class="word-span" style="display:inline-block;margin-right:.25em;animation:rise 1.1s var(--ease) ${(0.1 + i * 0.12).toFixed(2)}s both">${w}</span>`)
    .join("");

  // Polaroid frames — buur-foto signature: 2 slightly-rotated images near hero
  const polaroidImgs = imgs.slice(0, 2);
  const rotations = ["-4deg", "3deg"];
  const polaroids = polaroidImgs.length
    ? polaroidImgs.map((u, i) =>
        `<div class="polaroid zoom" style="display:inline-block;background:#fff;padding:10px 10px 28px;box-shadow:0 8px 30px rgba(0,0,0,.12);transform:rotate(${rotations[i]});margin:0 12px">
          <img src="${esc(u)}" alt="${esc(name)}" style="width:160px;height:160px;object-fit:cover;display:block" loading="lazy" />
        </div>`).join("")
    : `<div class="polaroid" style="display:inline-block;background:#fff;padding:10px 10px 28px;box-shadow:0 8px 30px rgba(0,0,0,.12);transform:rotate(-4deg);margin:0 12px;width:180px;height:200px;background:color-mix(in srgb,var(--ink),transparent 90%)"></div>`;

  const galleryItems = imgs.length
    ? imgs.map((u, i) => `<div class="zoom" style="overflow:hidden"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy" style="width:100%;height:320px;object-fit:cover;display:block" /></div>`).join("")
    : ["Portræt", "Bryllup", "Familie", "Event", "Natur", "Studio"]
        .map((label) => `<div class="ph">${label}</div>`)
        .join("");

  return `<main data-layout="gallery">
<style>
/* foto: polaroid hover tilt */
.polaroid{transition:transform 1.2s var(--ease)}
.polaroid:hover{transform:rotate(0deg) scale(1.03)!important}
</style>
  <!-- buur-foto: quiet text hero leads, gallery follows -->
  <div class="wrap">
    <section class="hero">
      <h1 style="font-size:clamp(34px,6vw,62px);font-weight:600;max-width:14ch;line-height:1.05">${wordSpans}</h1>
      <p class="reveal" style="--d:.55s">${tagline}</p>
      ${snippets[0] ? `<p class="reveal" style="max-width:52ch;margin-top:10px;opacity:.72;--d:.7s">${esc(snippets[0])}</p>` : ""}
      <!-- polaroid frames — buur-foto signature: rotated near hero -->
      <div style="margin-top:28px;display:flex;align-items:flex-start;gap:0;flex-wrap:wrap">
        ${polaroids}
      </div>
      <div class="reveal" style="margin-top:28px;--d:.85s"><a class="btn" href="#book">Book session <span class="arr">→</span></a></div>
    </section>
  </div>

  <!-- full-bleed gallery below the text hero -->
  <div class="fullgallery">
    ${galleryItems}
  </div>

  <div class="wrap">
    <section class="block">
      <h2 class="reveal">Om fotografen</h2>
      <p class="reveal" style="max-width:60ch;margin-top:10px;font-size:17px;opacity:.85;--d:.1s">${tagline}</p>
      ${snippets[1] ? `<p class="reveal" style="max-width:60ch;margin-top:12px;opacity:.75;--d:.2s">${esc(snippets[1])}</p>` : ""}
    </section>

    <section class="block">
      <h2 class="reveal">Pakker &amp; priser</h2>
      <div class="grid">
        ${(extra.length ? extra : insp)
          .slice(0, 3)
          .map((item, idx) => `<div class="card lift reveal" style="--d:${idx * 0.12}s"><strong>${esc(item)}</strong><p style="margin-top:8px;font-size:14px;opacity:.7;">Kontakt for pris</p></div>`)
          .join("")}
      </div>
    </section>

    <section class="block" id="book">
      <h2 class="reveal">Book session</h2>
      <p class="reveal" style="margin-top:10px;opacity:.82;--d:.1s">Klar til at skabe noget smukt sammen? Tag fat i mig — jeg vender tilbage inden for 24 timer.</p>
      <div class="reveal" style="margin-top:22px;--d:.2s"><a class="btn" href="mailto:hej@${esc(name.toLowerCase().replace(/\s/g, ""))}.dk">Book session <span class="arr">→</span></a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: service (vvs / kt-vvs) -----------------------------------
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// kt-vvs pattern: sticky phone action bar + hero with "Ring nu" + akut callout;
// services grid; dækningsområde section; akut/vagt callout.
// MEDIUM-tech / MINIMAL motion: sticky phone bar, glassmorphism chips, quick reveals.
// Hover-lift on ref cards but modest. Lean, technical — NOT cinematic.
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
      <h1 style="animation:rise .7s var(--ease) .1s both">${heroTitle}</h1>
      <p style="animation:rise .8s var(--ease) .25s both">${tagline}</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;animation:rise .8s var(--ease) .4s both">
        <a class="btn" href="tel:+45">Ring nu <span class="arr">→</span></a>
        <a class="btn-outline" href="#kontakt">Kontakt</a>
      </div>
      <!-- akut callout — kt-vvs signature -->
      <div class="akut-callout reveal" style="--d:.5s">
        <strong>Akut hjælp?</strong> Vi rykker ud hurtigt — ring <a href="tel:+45" style="color:var(--accent)">nu</a> og beskriv problemet.
      </div>
    </section>

    <section class="block">
      <h2 class="reveal">Ydelser</h2>
      <!-- glassmorphism chips on service cards (MEDIUM-tech) -->
      <div class="services-grid">
        ${services.map((s, idx) => `<div class="service-item lift reveal" style="--d:${(idx * 0.1).toFixed(1)}s;backdrop-filter:blur(6px)"><strong>${esc(s)}</strong></div>`).join("")}
      </div>
    </section>

    <!-- dækningsområde — kt-vvs signature section -->
    <section class="block">
      <h2 class="reveal">D&aelig;kningsomr&aring;de</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;max-width:55ch;--d:.1s">Vi servicerer lokalområdet og omegn. Ring for at høre om vi dækker din adresse — vi rykker hurtigt ud.</p>
      <div class="grid" style="margin-top:22px">
        ${insp.slice(0, 2).map((i, idx) => `<div class="card lift reveal" style="--d:${(idx * 0.12).toFixed(2)}s">${esc(i)}</div>`).join("")}
      </div>
    </section>

    <!-- akut/vagt — kt-vvs signature section -->
    <section class="block">
      <h2 class="reveal">Akut &amp; vagt</h2>
      <div class="akut-callout reveal" style="--d:.1s">
        <strong>Vagttjeneste</strong> — vi kan rykke ud uden for normal arbejdstid. Ring på <a href="tel:+45" style="color:var(--accent);font-weight:700">+45 XX XX XX XX</a>.
      </div>
    </section>

    <section class="block" id="kontakt">
      <h2 class="reveal">Kontakt</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Har du spørgsmål eller skal vi i gang? Tag fat i os.</p>
      <div class="reveal" style="margin-top:18px;display:flex;gap:14px;flex-wrap:wrap;--d:.2s">
        <a class="btn" href="tel:+45">Ring nu <span class="arr">→</span></a>
        <a class="btn-outline" href="mailto:kontakt@${esc(name.toLowerCase().replace(/\s/g, ""))}.dk">Send besked</a>
      </div>
    </section>
  </div>
</main>`;
}

// ---- archetype: menu (restaurant / under-klippen) -------------------------
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// under-klippen pattern: dark warm bg, img-tag hero, menu list, book-bord CTA,
// stemnings-image. Cormorant Garamond + Outfit. No menu PDF.
// MEDIUM motion: staggered hero entrance, full-bleed stemnings hero with gradient overlay,
// menu rows reveal on scroll, slow image zoom on gallery.
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
      <h1 style="animation:rise .8s var(--ease) .1s both">${heroTitle}</h1>
      <p style="animation:rise .8s var(--ease) .25s both">${tagline}</p>
      <div style="animation:rise .8s var(--ease) .4s both"><a class="btn" href="#bestil">Book bord <span class="arr">→</span></a></div>
    </section>
  </div>

  <!-- stemnings-image hero — under-klippen signature: full-bleed with dark gradient overlay -->
  <div style="padding:0 24px">
    <div class="menu-hero zoom">
      ${hero ? `<img class="menu-hero-bg" src="${hero}" alt="${esc(name)}" />` : `<div style="position:absolute;inset:0;background:color-mix(in srgb,var(--accent),var(--bg) 75%)"></div>`}
      <div class="menu-hero-overlay"></div>
      <div class="menu-hero-text" style="animation:rise .9s var(--ease) .55s both">
        <h1>${heroTitle}</h1>
        <p style="margin-top:10px;font-size:18px;opacity:.9;">${tagline}</p>
      </div>
    </div>
  </div>

  <div class="wrap">
    <section class="block">
      <h2 class="reveal">Menu</h2>
      <ul class="menu">
        ${menuItems
          .map(
            (item, idx) =>
              `<li class="reveal" style="--d:${(idx * 0.08).toFixed(2)}s"><span class="name">${esc(item)}</span><span class="sep"></span><span class="note">Dagens råvarer</span></li>`
          )
          .join("")}
      </ul>
    </section>

    <!-- book-bord CTA — under-klippen signature -->
    <section class="block" id="bestil">
      <h2 class="reveal">Book bord / Bestil</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Ring for at reservere bord, eller send os en besked — vi glæder os til at se dig.</p>
      <div class="reveal" style="margin-top:20px;display:flex;gap:14px;flex-wrap:wrap;--d:.2s">
        <a class="btn" href="tel:+45">Ring og reservér <span class="arr">→</span></a>
        <a class="btn-outline" href="#kontakt">Kontakt</a>
      </div>
    </section>

    ${
      imgs.length
        ? `<section class="block"><h2 class="reveal">Galleri</h2><div class="gallery">${imgs.map((u, i) => `<div class="zoom reveal" style="border-radius:12px;overflow:hidden;--d:${(i * 0.1).toFixed(1)}s"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy" style="width:100%;height:180px;object-fit:cover;display:block" /></div>`).join("")}</div></section>`
        : ""
    }

    <section class="block" id="kontakt">
      <h2 class="reveal">Find os</h2>
      <div class="grid">
        ${insp.slice(0, 2).map((i, idx) => `<div class="card lift reveal" style="--d:${(idx * 0.12).toFixed(2)}s">${esc(i)}</div>`).join("")}
        <div class="card lift reveal" style="--d:.24s"><strong>&Aring;bningstider</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Man–Fre: 11–22 · Lør–Søn: 12–23</p></div>
      </div>
    </section>
  </div>
</main>`;
}

// ---- archetype: booking (salon / frisor) ----------------------------------
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// The animation KIT is shared polish; mood = customer data + branch palette/fonts.
// Two salons with different FB photos/colors must look clearly different.
//
// salon-artec (HIGH/cinematic): art-deco frame, gallery-rail scroll-snap,
//   grain glow, gold pulse on CTA. Dark teal bg, Cormorant Garamond, pill buttons.
// street-cut (MEDIUM-bold): masked line-reveal on H1 (translateY(115%)),
//   grayscale→color on cards. Bone bg, EB Garamond, leaner/urban.
// Both use split-hero with booking card, but look visually distinct.
function renderBookingBody(name: string, t: DesignTemplate, recon: ReconResult): string {
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 120) || `Velkommen til ${name}.`);
  const hero = recon.ogImage ? esc(recon.ogImage) : null;
  const insp = t.inspiration;
  const extra = recon.headings.slice(1).filter(Boolean);
  const isFrisor = t.slug === "frisor";
  // Salon: "Skønhed" kicker; frisor: "Klip & farve"
  const kicker = isFrisor ? "Klip &amp; farve" : "Sk&oslash;nhed";
  const treatments = extra.length
    ? extra.slice(0, 4)
    : isFrisor
      ? ["Klipning", "Farvning", "Balayage", "Skæg & trimning"]
      : ["Ansigtsbehandling", "Korpsmassage", "Voks / sugaring", "Negle & lak"];
  const imgs = (recon.images ?? [])
    .filter((u) => u !== (hero ? hero.replace(/&amp;/g, "&") : null))
    .slice(0, 4);
  const snippets = recon.toneSample
    ? recon.toneSample.split(/(?<=[.!?])\s+/).filter((s) => s.length >= 25 && s.length <= 160)
    : [];

  if (isFrisor) {
    // ── FRISOR (street-cut, MEDIUM-bold) ─────────────────────────────────
    // Signature: masked translateY(115%) line-reveal on H1, grayscale→color cards.
    // NO art-deco frame, NO gold pulse, NO gallery-rail.
    const wordSpans = heroTitle
      .split(" ")
      .map((w) => `<span class="reveal-word" style="display:inline-block;overflow:hidden;margin-right:.25em"><span class="reveal-inner" style="display:inline-block;transform:translateY(115%);opacity:0;transition:transform 700ms var(--ease),opacity 700ms var(--ease)">${w}</span></span>`)
      .join("");

    return `<main data-layout="booking">
<style>
/* frisor: masked line-reveal — word spans slide up from clip */
.reveal-inner.is-visible{transform:translateY(0)!important;opacity:1!important}
/* frisor: grayscale→color on gallery cards (MEDIUM-bold urban) */
.gray-card img{filter:grayscale(100%);transition:filter .9s var(--ease)}
.gray-card:hover img{filter:grayscale(0%)}
</style>
  <div class="wrap">
    <div class="booking-split">
      <!-- left: hero text — frisor: masked line-reveal H1 -->
      <div>
        <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:14px">${kicker}</p>
        <h1 style="font-size:clamp(32px,5vw,58px);font-weight:600;max-width:12ch;line-height:1.05">${wordSpans}</h1>
        <p class="reveal" style="font-size:18px;max-width:48ch;opacity:.82;margin-top:16px;--d:.2s">${tagline}</p>
        ${snippets[0] ? `<p class="reveal" style="margin-top:12px;max-width:48ch;opacity:.7;--d:.35s">${esc(snippets[0])}</p>` : ""}
        <div class="reveal" style="margin-top:28px;display:flex;gap:14px;flex-wrap:wrap;--d:.45s">
          <a class="btn" href="#book">Book tid <span class="arr">→</span></a>
          <a class="btn-outline" href="#behandlinger">Se behandlinger</a>
        </div>
      </div>
      <!-- right: booking card with treatment list -->
      <div class="bookingcard lift" id="behandlinger">
        <h3>Behandlinger</h3>
        ${treatments
          .map((tr) => `<div class="treatment-row"><span>${esc(tr)}</span><span class="price">fra —</span></div>`)
          .join("")}
        <a class="btn" href="#book" style="text-align:center;margin-top:8px">Book online <span class="arr">→</span></a>
      </div>
    </div>

    <!-- Om salonen -->
    <section class="block">
      <h2 class="reveal">Om salonen</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i, idx) => `<div class="card lift reveal" style="--d:${idx * 0.1}s"><p style="font-size:15px;">${esc(i)}</p></div>`)
          .join("")}
        ${snippets[1] ? `<div class="card lift reveal" style="--d:.2s"><p style="font-size:15px;">${esc(snippets[1])}</p></div>` : ""}
      </div>
    </section>

    ${imgs.length
      ? `<section class="block"><h2 class="reveal">Galleri</h2><div class="gallery">${imgs.map((u, i) => `<div class="gray-card zoom" style="border-radius:12px;overflow:hidden"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy" /></div>`).join("")}</div></section>`
      : ""}

    <section class="block">
      <h2 class="reveal">Anmeldelser</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i, idx) => `<div class="card lift reveal" style="--d:${idx * 0.12}s"><p style="font-size:15px;font-style:italic">"${esc(i)}"</p></div>`)
          .join("")}
        <div class="card lift reveal" style="--d:.24s"><strong>&#9733;&#9733;&#9733;&#9733;&#9733;</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Google-anmeldelse</p></div>
      </div>
    </section>

    <section class="block" id="book">
      <h2 class="reveal">Book tid</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Ring eller send os en besked for at booke — vi svarer hurtigt.</p>
      <div class="reveal" style="margin-top:18px;--d:.2s"><a class="btn" href="tel:+45">Ring og book <span class="arr">→</span></a></div>
    </section>
  </div>
<script>
// frisor: trigger masked line-reveal after paint
(function(){
  var inners=document.querySelectorAll(".reveal-inner");
  if(!inners.length)return;
  setTimeout(function(){
    inners.forEach(function(el,i){
      setTimeout(function(){el.classList.add("is-visible");},80+i*80);
    });
  },60);
})();
</script>
</main>`;
  }

  // ── SALON (salon-artec, HIGH/cinematic) ─────────────────────────────────
  // Signature: art-deco corner frame, gallery-rail scroll-snap, gold pulse on CTA.
  // NO masked line-reveal (that's frisor's signature).
  const galleryRailItems = imgs.length
    ? imgs.map((u) => `<div class="art-deco-rail-card zoom" style="flex:0 0 clamp(280px,36vw,420px);aspect-ratio:4/5;border-radius:14px;overflow:hidden;scroll-snap-align:start"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover" /></div>`).join("")
    : ["Behandling", "Resultat", "Atelier", "Atmosfære"]
        .map((l) => `<div style="flex:0 0 clamp(280px,36vw,420px);aspect-ratio:4/5;border-radius:14px;overflow:hidden;scroll-snap-align:start;background:color-mix(in srgb,var(--ink),transparent 88%);display:flex;align-items:center;justify-content:center;font-size:13px;opacity:.6">${l}</div>`)
        .join("");

  return `<main data-layout="booking">
<style>
/* salon-artec: art-deco SVG corner frame fade-in */
@keyframes fadeOrn{from{opacity:0;transform:scale(.95)}to{opacity:.85;transform:none}}
.art-deco-frame{position:absolute;inset:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.art-deco-frame::before,.art-deco-frame::after{content:"";position:absolute;width:40px;height:40px;border-style:solid;border-color:var(--accent);opacity:0;animation:fadeOrn .6s var(--ease) 1.4s forwards}
.art-deco-frame::before{top:12px;left:12px;border-width:2px 0 0 2px}
.art-deco-frame::after{bottom:12px;right:12px;border-width:0 2px 2px 0}
/* gallery-rail: horizontal scroll-snap */
.gallery-rail{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.gallery-rail::-webkit-scrollbar{display:none}
/* art-deco gradient vignette on rail cards */
.art-deco-rail-card{position:relative}
.art-deco-rail-card::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(12,42,39,.65) 100%);pointer-events:none}
/* gold pulse on CTA contact icon */
@keyframes gold-pulse{0%,100%{box-shadow:0 0 0 0 rgba(201,163,94,.4)}60%{box-shadow:0 0 0 10px transparent}}
.pulse-cta{animation:gold-pulse 2.4s ease-in-out infinite}
</style>
  <div class="wrap">
    <div class="booking-split" style="position:relative">
      <!-- left: hero text — salon-artec: cinematic, poetic "Hårhåndværk med hjerte." -->
      <div style="position:relative">
        <div class="art-deco-frame"></div>
        <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:14px;animation:rise .7s var(--ease) .1s both">${kicker}</p>
        <h1 style="font-size:clamp(32px,5vw,58px);font-weight:600;max-width:12ch;animation:rise .9s var(--ease) .25s both">${heroTitle}</h1>
        <p style="font-size:18px;max-width:48ch;opacity:.82;margin-top:16px;animation:rise .9s var(--ease) .4s both">${tagline}</p>
        ${snippets[0] ? `<p style="margin-top:12px;max-width:48ch;opacity:.7;animation:rise .9s var(--ease) .55s both">${esc(snippets[0])}</p>` : ""}
        <div style="margin-top:28px;display:flex;gap:14px;flex-wrap:wrap;animation:rise .9s var(--ease) .65s both">
          <a class="btn pulse-cta" href="#book">Book tid <span class="arr">→</span></a>
          <a class="btn-outline" href="#behandlinger">Se behandlinger</a>
        </div>
      </div>
      <!-- right: booking card with treatment list -->
      <div class="bookingcard lift" id="behandlinger">
        <h3>Behandlinger</h3>
        ${treatments
          .map((tr) => `<div class="treatment-row"><span>${esc(tr)}</span><span class="price">fra —</span></div>`)
          .join("")}
        <a class="btn" href="#book" style="text-align:center;margin-top:8px">Book online <span class="arr">→</span></a>
      </div>
    </div>

    <!-- Om salonen — salon-artec signature section -->
    <section class="block">
      <h2 class="reveal">Om salonen</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i, idx) => `<div class="card lift reveal" style="--d:${idx * 0.12}s"><p style="font-size:15px;">${esc(i)}</p></div>`)
          .join("")}
        ${snippets[1] ? `<div class="card lift reveal" style="--d:.24s"><p style="font-size:15px;">${esc(snippets[1])}</p></div>` : ""}
      </div>
    </section>

    <!-- salon-artec signature: horizontal gallery-rail with scroll-snap -->
    <section class="block">
      <h2 class="reveal">Galleri</h2>
      <div class="gallery-rail reveal" style="--d:.1s">
        ${galleryRailItems}
      </div>
    </section>

    <section class="block">
      <h2 class="reveal">Anmeldelser</h2>
      <div class="grid">
        ${insp
          .slice(0, 2)
          .map((i, idx) => `<div class="card lift reveal" style="--d:${idx * 0.12}s"><p style="font-size:15px;font-style:italic">"${esc(i)}"</p></div>`)
          .join("")}
        <div class="card lift reveal" style="--d:.24s"><strong>&#9733;&#9733;&#9733;&#9733;&#9733;</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Google-anmeldelse</p></div>
      </div>
    </section>

    <section class="block" id="book">
      <h2 class="reveal">Book tid</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Ring eller send os en besked for at booke — vi svarer hurtigt.</p>
      <div class="reveal" style="margin-top:18px;--d:.2s"><a class="btn pulse-cta" href="tel:+45">Ring og book <span class="arr">→</span></a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: clinic (hudpleje / vida) ----------------------------------
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// vida pattern: calm hero, storytelling pause block, behandlingsoversigt,
// BIG gallery "Glimt fra klinikken" (the largest section), brand story, kontakt.
// Warm palette only — no cold tones. HIGH/calm-luxury motion budget.
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
  const heroImg = recon.ogImage ? esc(recon.ogImage) : null;

  return `<main data-layout="clinic">
<style>
/* clinic (vida): Ken Burns slow zoom on hero lead image — HIGH/calm-luxury */
@keyframes kenburns{0%{transform:scale(1)}100%{transform:scale(1.06)}}
.kenburns-img{animation:kenburns 7s ease-in-out infinite alternate}
/* clinic: warm radial glow behind hero wordline */
.clinic-glow::before{content:"";position:absolute;inset:0;background:radial-gradient(closest-side,rgba(199,162,74,.08),transparent);pointer-events:none}
/* clinic: treat-cards use .lift (already shared) */
</style>
  <div class="wrap">
    <!-- vida: calm centered hero + "forskøn livet" + Ken Burns hero image -->
    <div class="clinic-hero" style="position:relative">
      <p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.55;margin-bottom:16px;animation:rise .7s var(--ease) .1s both">Klinik &amp; behandling</p>
      <h1 style="font-size:clamp(34px,6vw,60px);font-weight:600;animation:rise .9s var(--ease) .25s both">${heroTitle}</h1>
      <p style="font-size:18px;opacity:.82;margin-top:16px;max-width:54ch;animation:rise .9s var(--ease) .4s both">${tagline}</p>
      <div style="margin-top:28px;animation:rise .9s var(--ease) .55s both"><a class="btn" href="#book">Book tid <span class="arr">→</span></a></div>
      ${heroImg ? `<div style="margin-top:32px;border-radius:18px;overflow:hidden;max-height:380px"><img class="kenburns-img zoom" src="${heroImg}" alt="${esc(name)}" style="width:100%;height:360px;object-fit:cover;display:block" /></div>` : ""}
    </div>

    <!-- vida: storytelling pause block — "En stille pause i en travl hverdag." -->
    <section class="block" style="text-align:center">
      <p class="reveal" style="font-size:22px;font-style:italic;max-width:60ch;margin:0 auto;opacity:.85;">${snippets[0] ? esc(snippets[0]) : "En stille pause i en travl hverdag."}</p>
    </section>

    <!-- vida: behandlinger — treat-cards with .lift -->
    <section class="block">
      <h2 class="reveal">Behandlinger</h2>
      <div class="grid">
        ${treatments
          .map(
            (tr, idx) =>
              `<div class="card lift reveal" style="--d:${idx * 0.1}s"><strong>${esc(tr)}</strong><p style="margin-top:6px;font-size:14px;opacity:.7;">Kontakt for priser og tider</p></div>`
          )
          .join("")}
      </div>
    </section>

    <!-- trust strip -->
    <section class="block">
      <h2 class="reveal">Tryghed &amp; kvalitet</h2>
      <div class="trust-strip reveal" style="--d:.1s">
        <div class="trust-item"><div class="check-icon">&#10003;</div> Certificeret &amp; tryg behandling</div>
        <div class="trust-item"><div class="check-icon">&#10003;</div> Godkendte produkter</div>
        <div class="trust-item"><div class="check-icon">&#10003;</div> Fortrolig &amp; professionel</div>
        ${insp[0] ? `<div class="trust-item"><div class="check-icon">&#10003;</div> ${esc(insp[0])}</div>` : ""}
      </div>
    </section>

    <!-- vida signature: BIG gallery — "Glimt fra klinikken" (the largest section) -->
    <section class="block">
      <h2 class="reveal">Glimt fra klinikken</h2>
      <div class="glimt-gallery">
        ${imgs.length
          ? imgs.map((u, i) => `<div class="zoom reveal" style="border-radius:10px;overflow:hidden;--d:${i * 0.08}s"><img src="${esc(u)}" alt="${esc(name)}" loading="lazy" style="width:100%;height:240px;object-fit:cover;display:block" /></div>`).join("")
          : ["Behandlingsrum", "Velkomst", "Detalje", "Atmosfære", "Produkt", "Klinik"].map((l, i) => `<div class="glimt-ph reveal" style="--d:${i * 0.08}s">${l}</div>`).join("")
        }
      </div>
    </section>

    <!-- vida: brand story block -->
    <section class="block" style="text-align:center">
      <p class="reveal" style="font-size:20px;font-style:italic;max-width:55ch;margin:0 auto;opacity:.8;">${snippets[1] ? esc(snippets[1]) : `${esc(name)} — skønhed med sjæl.`}</p>
    </section>

    <section class="block" id="book">
      <h2 class="reveal">Kontakt &amp; book tid</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Vi glæder os til at modtage dig. Ring eller skriv for at booke tid.</p>
      <div class="reveal" style="margin-top:18px;--d:.2s"><a class="btn" href="tel:+45">Ring og book <span class="arr">→</span></a></div>
    </section>
  </div>
</main>`;
}

// ---- archetype: authority (advokat / midtadvokaterne) ---------------------
// PRINCIPLE: personalisation comes from customer recon (images, palette, tone).
// midtadvokaterne pattern: Playfair Display serif hero + ydelsesområder grid +
// "Mød din rådgiver" personal block + kontakt.
// RESTRAINED/gravitas motion: fade-up only (no zoom, no tilt, no continuous anim),
// slow 600–900ms easeOut; portraits grayscale→color on hover;
// ONE intentionally static block (testimonial/trust); Ken Burns only on hero bg.
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
  const heroImg = recon.ogImage ? esc(recon.ogImage) : null;

  return `<main data-layout="authority">
<style>
/* authority (advokat): RESTRAINED — fade-up only, 600–900ms easeOut, NO scale hover on cards */
/* portrait grayscale→color on hover — gravitas signature */
.portrait-card img{filter:grayscale(100%);transition:filter .6s ease}
.portrait-card:hover img{filter:grayscale(0%)}
/* authority: slow Ken Burns on hero bg image only (not cards) */
@keyframes kenburns-auth{0%{transform:scale(1) translate(0,0)}100%{transform:scale(1.08) translate(-2%,-1%)}}
.auth-kenburns{animation:kenburns-auth 14s ease-in-out infinite alternate}
/* authority: intentionally static testimonial block — no animation class */
.static-block .reveal{opacity:1!important;transform:none!important;transition:none!important}
</style>
  <div class="wrap">
    <!-- midtadvokaterne: Playfair-led serif hero with kicker -->
    <div class="auth-hero" style="position:relative">
      ${heroImg ? `<div style="position:absolute;inset:0;border-radius:18px;overflow:hidden;z-index:-1;opacity:.18"><img class="auth-kenburns" src="${heroImg}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" /></div>` : ""}
      <p class="kicker" style="animation:rise .6s ease .1s both">R&aring;dgivning &amp; juridisk bistand</p>
      <h1 style="animation:rise .8s ease .22s both">${heroTitle}</h1>
      <p style="font-size:19px;opacity:.82;margin-top:18px;max-width:54ch;animation:rise .9s ease .38s both">${tagline}</p>
      ${snippets[0] ? `<p style="margin-top:12px;opacity:.7;max-width:54ch;animation:rise .9s ease .52s both">${esc(snippets[0])}</p>` : ""}
      <div style="margin-top:28px;display:flex;gap:14px;flex-wrap:wrap;animation:rise .9s ease .65s both">
        <a class="btn" href="#kontakt">Book m&oslash;de <span class="arr">→</span></a>
        <a class="btn-outline" href="#ydelser">Ydelsesomr&aring;der</a>
      </div>
    </div>

    <!-- midtadvokaterne: Ydelsesområder grid — fade-up only, no lift/zoom -->
    <section class="block" id="ydelser">
      <h2 class="reveal">Ydelsesomr&aring;der</h2>
      <div class="ydelse-grid">
        ${ydelser
          .map(
            (y, idx) =>
              `<div class="ydelse-card reveal" style="--d:${(idx * 0.08).toFixed(2)}s"><h3>${esc(y)}</h3><p style="font-size:14px;opacity:.65;margin-top:4px">Kontakt for n&aelig;rmere information</p></div>`
          )
          .join("")}
      </div>
    </section>

    <!-- midtadvokaterne: "Mød din rådgiver" — grayscale→color portrait hover -->
    <section class="block" id="profil">
      <h2 class="reveal">M&oslash;d din r&aring;dgiver</h2>
      <div class="profile portrait-card reveal" style="--d:.1s">
        <div class="profile-avatar" style="filter:grayscale(100%);transition:filter .6s ease">&#9878;</div>
        <div>
          <p class="profile-name">${esc(name)}</p>
          <p class="profile-title">${esc(t.label)}</p>
          <p style="font-size:15px;opacity:.8;max-width:52ch">${insp[0] ? esc(insp[0]) : "Personlig r&aring;dgivning med fokus p&aring; dine behov og det bedst mulige resultat."}</p>
        </div>
      </div>
    </section>

    <!-- intentionally STATIC block — no animation (gravitas design decision) -->
    <section class="block static-block" style="text-align:center">
      <p style="font-size:19px;font-style:italic;max-width:60ch;margin:0 auto;opacity:.8;">${snippets[1] ? esc(snippets[1]) : `"Den mest vidende ven du har, der ogs&aring; er advokat."`}</p>
    </section>

    <!-- kontakt block -->
    <section class="block" id="kontakt">
      <h2 class="reveal">Kontakt &amp; book m&oslash;de</h2>
      <p class="reveal" style="margin-top:10px;opacity:.85;--d:.1s">Ring eller skriv for at aftale et uforpligtende m&oslash;de.</p>
      <div class="reveal" style="margin-top:18px;display:flex;gap:14px;flex-wrap:wrap;--d:.2s">
        <a class="btn" href="tel:+45">Ring <span class="arr">→</span></a>
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

// Shared inline script: IntersectionObserver for .reveal, scroll frosted-nav, .arr nudge.
// Defensive guards so it works standalone in both iframe srcDoc and /demo/[slug] contexts.
const MOTION_SCRIPT = `<script>
(function(){
  // Scroll-reveal via IntersectionObserver
  if(typeof IntersectionObserver!=="undefined"&&document.querySelectorAll){
    var io=new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){e.target.classList.add("in");io.unobserve(e.target);}
      });
    },{threshold:0.12});
    document.querySelectorAll(".reveal").forEach(function(el){io.observe(el);});
  }
  // Frosted nav on scroll — adds .scrolled after 8px
  var hdr=document.querySelector("header");
  if(hdr){
    window.addEventListener("scroll",function(){
      hdr.classList.toggle("scrolled",window.scrollY>8);
    },{passive:true});
  }
})();
</script>`;

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
${MOTION_SCRIPT}
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
    // Always expose the stable /demo/[slug] route (resolves to Blob URL on Vercel,
    // reads dist/ locally) — never the raw /_assets pseudo-URL, which has no route.
    await store.putAsset(`demos/${slug}/index.html`, html, "text/html; charset=utf-8");
    await store.put(`demos/${slug}/design.md`, designMd);
    demoPath = `/demo/${slug}`;
  }

  return { slug, template, designMd, html, demoPath };
}
