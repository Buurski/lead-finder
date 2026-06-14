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

export function composeHtml(name: string, t: DesignTemplate, recon: ReconResult): string {
  const accent = recon.palette[0] && /^#[0-9a-f]{6}$/i.test(recon.palette[0]) ? recon.palette[0] : t.palette.accent;
  const heroTitle = esc(recon.headings[0] || recon.title || name);
  const tagline = esc(recon.toneSample?.slice(0, 140) || `Velkommen til ${name}.`);
  const sections = t.sectionOrder;
  const hero = recon.ogImage ? esc(recon.ogImage) : null;

  const navItems = ["Ydelser", "Galleri", "Om", "Kontakt"];

  return `<!doctype html>
<html lang="da">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(name)} — demo</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${fonts(t)}" />
<style>
  :root{ --bg:${t.palette.bg}; --ink:${t.palette.ink}; --accent:${accent}; --accent-ink:${t.palette.accentInk}; }
  *{box-sizing:border-box;margin:0}
  body{font-family:'${t.typography.body}',system-ui,sans-serif;background:var(--bg);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased}
  h1,h2,h3{font-family:'${t.typography.display}',Georgia,serif;letter-spacing:-0.02em;line-height:1.1}
  .wrap{max-width:1040px;margin:0 auto;padding:0 24px}
  header{position:sticky;top:0;background:color-mix(in oklab,var(--bg),transparent 12%);backdrop-filter:blur(8px);border-bottom:1px solid color-mix(in oklab,var(--ink),transparent 90%);z-index:10}
  nav{display:flex;align-items:center;gap:24px;height:64px}
  .brand{font-family:'${t.typography.display}',serif;font-weight:600;font-size:20px}
  nav a{margin-left:auto;color:inherit;text-decoration:none;font-size:14px;opacity:.8}
  nav a+a{margin-left:24px}
  .btn{display:inline-block;background:var(--accent);color:#fff;padding:12px 22px;border-radius:999px;font-weight:600;text-decoration:none;font-size:15px}
  .hero{padding:90px 0 70px;display:grid;gap:22px}
  .hero h1{font-size:clamp(34px,6vw,62px);font-weight:600;max-width:14ch}
  .hero p{font-size:19px;max-width:52ch;opacity:.82}
  .heroimg{margin-top:18px;border-radius:18px;width:100%;max-height:380px;object-fit:cover}
  section.block{padding:54px 0;border-top:1px solid color-mix(in oklab,var(--ink),transparent 92%)}
  section.block h2{font-size:28px;font-weight:600;margin-bottom:10px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px;margin-top:22px}
  .card{background:color-mix(in oklab,var(--ink),transparent 96%);border-radius:14px;padding:22px}
  .gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:22px}
  .gallery img{width:100%;height:180px;object-fit:cover;border-radius:12px}
  footer{padding:48px 0;color:color-mix(in oklab,var(--ink),transparent 45%);font-size:14px;border-top:1px solid color-mix(in oklab,var(--ink),transparent 90%)}
  .demo-badge{position:fixed;bottom:14px;right:14px;background:var(--ink);color:var(--bg);font-size:11px;padding:6px 12px;border-radius:999px;opacity:.85}
</style>
</head>
<body>
<header><div class="wrap"><nav>
  <span class="brand">${esc(name)}</span>
  ${navItems.map((n) => `<a href="#">${n}</a>`).join("")}
</nav></div></header>

<main class="wrap">
  <section class="hero">
    <h1>${heroTitle}</h1>
    <p>${tagline}</p>
    <div><a class="btn" href="#kontakt">Book / kontakt</a></div>
    ${hero ? `<img class="heroimg" src="${hero}" alt="${esc(name)}" />` : ""}
  </section>

  ${renderGallery(name, recon, hero)}
  ${renderSections(name, t, recon, sections.slice(1))}
</main>

<footer class="wrap" id="kontakt">
  <strong>${esc(name)}</strong> · demo bygget af Lucas. Kodet, ikke WordPress. Du ejer 100% af koden.
</footer>
<div class="demo-badge">DEMO · ${esc(t.label)}-template</div>
</body>
</html>`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Photo gallery from recon.images (Facebook profile/og photos or inline <img>
// from the customer's site). The hero image is excluded so it isn't repeated.
function renderGallery(name: string, recon: ReconResult, heroUrl: string | null): string {
  const imgs = (recon.images ?? []).filter((u) => u !== (heroUrl ? heroUrl.replace(/&amp;/g, "&") : null)).slice(0, 6);
  if (!imgs.length) return "";
  return `<section class="block">
    <h2>Galleri</h2>
    <div class="gallery">${imgs.map((u) => `<img src="${esc(u)}" alt="${esc(name)}" loading="lazy" />`).join("")}</div>
  </section>`;
}

// Real section content — never the old literal "Personligt indhold..." card.
// We draw from the customer's own recon (extra headings + tone sentences) first,
// then fall back to the branch template's inspiration (concrete, branch-relevant).
// A section with no usable card is skipped entirely (fewer sections > empty ones).
function renderSections(name: string, t: DesignTemplate, recon: ReconResult, sectionLabels: string[]): string {
  const snippets: string[] = [];
  for (const h of recon.headings.slice(1)) if (h && h.length > 3) snippets.push(h);
  if (recon.toneSample) {
    for (const sentence of recon.toneSample.split(/(?<=[.!?])\s+/)) {
      const s = sentence.trim();
      if (s.length >= 25 && s.length <= 160) snippets.push(s);
    }
  }
  const inspiration = [...t.inspiration];

  const blocks: string[] = [];
  for (const label of sectionLabels) {
    const cards: string[] = [];
    // 1) the section's own intent (always real + branch-relevant)
    cards.push(`<div class="card"><strong>${esc(capitalize(label))}</strong></div>`);
    // 2) a real customer snippet if we have one
    const snip = snippets.shift();
    if (snip) cards.push(`<div class="card">${esc(snip)}</div>`);
    // 3) else a concrete inspiration point from the branch template
    else {
      const insp = inspiration.shift();
      if (insp) cards.push(`<div class="card">${esc(insp)}</div>`);
    }
    blocks.push(`<section class="block">
    <h2>${esc(capitalize(label))}</h2>
    <div class="grid">${cards.join("")}</div>
  </section>`);
  }
  return blocks.join("\n");
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
    // Asset -> Blob on Vercel, dist/ locally. design.md -> doc store. The demo is
    // served by the /demo/[slug] route handler (which redirects to Blob in prod
    // or streams dist/<key> locally) — so demoPath is the stable in-app path.
    await store.putAsset(`demos/${slug}/index.html`, html, "text/html; charset=utf-8");
    await store.put(`demos/${slug}/design.md`, designMd);
    demoPath = "/demo/" + slug;
  }

  return { slug, template, designMd, html, demoPath };
}
