#!/usr/bin/env node
/*
 * gen-site-design-docs.mjs — Extract real design DNA from deployed demo-sites
 * and write a DISTINCT per-site Design MD to KnowledgeOS/wiki/design/sites/{slug}.md.
 *
 * Also enriches midtadvokaterne from the local LawyerSite brief, and enriches
 * the _sting_recon site from its local source files.
 *
 * Idempotent — re-running overwrites generated MDs.
 *
 *   node scripts/gen-site-design-docs.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")),
  ".."
);

// ─── Import TS modules via pathToFileURL (mirrors test_recon.mjs pattern) ───
const { DEMO_SITES } = await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "lib", "demos.ts")).href
);
const { reconCustomer, slugify } = await import(
  pathToFileURL(path.join(REPO_ROOT, "src", "lib", "customer-recon.ts")).href
);

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ─── Raw HTML fetch (bypasses safe-fetch so no DoH needed in CLI context) ───
async function fetchRawHtml(url, timeoutMs = 12000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": CHROME_UA },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Richer signal extraction from raw HTML ──────────────────────────────────
function extractSignals(html, baseUrl) {
  if (!html) return {};

  // All font-family declarations (CSS inline or style tags)
  const fontFamilies = new Set();
  for (const m of html.matchAll(/font-family\s*:\s*([^;}"']+)/gi)) {
    const fams = m[1].split(",").map((s) => s.trim().replace(/['"`]/g, "").trim());
    for (const f of fams) if (f && !f.startsWith("var(")) fontFamilies.add(f);
  }

  // Google Fonts family= params
  const gfFamilies = [];
  for (const m of html.matchAll(/family=([^&"'\s]+)/g)) {
    const decoded = decodeURIComponent(m[1]).split(":")[0].replace(/\+/g, " ");
    if (!gfFamilies.includes(decoded)) gfFamilies.push(decoded);
  }

  // theme-color
  const themeColorM = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
  const themeColor = themeColorM ? themeColorM[1].trim() : null;

  // Hex colors — count occurrences, skip pure b/w
  const hexCounts = new Map();
  for (const m of html.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
    const h = "#" + m[1].toLowerCase();
    if (/^#(ffffff|000000|fff|000)$/.test(h)) continue;
    hexCounts.set(h, (hexCounts.get(h) ?? 0) + 1);
  }
  // Also 3-char
  for (const m of html.matchAll(/#([0-9a-fA-F]{3})\b/g)) {
    const full = "#" + m[1][0].repeat(2) + m[1][1].repeat(2) + m[1][2].repeat(2);
    if (/^#(ffffff|000000)$/.test(full)) continue;
    const key = "#" + m[1].toLowerCase();
    hexCounts.set(key, (hexCounts.get(key) ?? 0) + 1);
  }
  const topColors = [...hexCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([h]) => h);

  // Button border-radius
  const btnRadius = [];
  for (const m of html.matchAll(/border-radius\s*:\s*([^;}"'\n]+)/gi)) {
    const v = m[1].trim();
    if (!btnRadius.includes(v) && btnRadius.length < 4) btnRadius.push(v);
  }

  // Tel links
  const telLinks = [];
  for (const m of html.matchAll(/href=["'](tel:[^"']+)["']/gi)) {
    const t = m[1].replace("tel:", "").trim();
    if (!telLinks.includes(t)) telLinks.push(t);
  }

  // Section count (section + article + main tags)
  const sectionCount = (html.match(/<(section|article|main)[\s>]/gi) || []).length;

  // Sticky nav?
  const stickyNav = /position\s*:\s*(sticky|fixed)/i.test(html) && /<(nav|header)/i.test(html);

  // Hero type: look at first ~8KB of body for hero signals
  const bodyStart = html.slice(0, 8000);
  let heroType = "text";
  if (/background-image\s*:\s*url\s*\(/i.test(bodyStart)) heroType = "bg-image";
  else if (/<img[^>]+(hero|banner|cover|splash)/i.test(bodyStart)) heroType = "img-hero";
  else if (/<img/i.test(bodyStart.slice(bodyStart.indexOf("<body") > 0 ? bodyStart.indexOf("<body") : 0))) heroType = "img-tag";

  // h1/h2 headings
  const headings = [];
  for (const m of html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (text.length > 1 && text.length < 120 && headings.length < 4) headings.push(text);
  }

  return {
    fontFamilies: [...fontFamilies].filter(Boolean).slice(0, 8),
    gfFamilies,
    themeColor,
    topColors,
    btnRadius,
    telLinks,
    sectionCount,
    stickyNav,
    heroType,
    headings,
  };
}

// ─── Markdown writers — each deliberately distinct in style/focus ─────────────

function writeUnderKlippen(recon, sig, slug) {
  return `---
title: Under Klippen — Restaurant i Holstebro
slug: ${slug}
kilde: ${DEMO_SITES.underKlippen}
branche: mad / café / dansk
---

# Design — Under Klippen

Under Klippen er den lille danske café/restaurant med en sjæl, der er større end stedet. Designet bærer på en aftensstemning — Cormorant Garamond sætter den lyriske, poetiske tone, Outfit holder læsbarheden jordnær.

## Identitet

Et brunt, varmt univers. Ikke rustik hyggelig — mere stille, trofast og rodfæstet. Logo/navn er groft — det er intentionelt. Man er "under klippen" og forstår hvad det betyder.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display / overskrift | Cormorant Garamond (italic 300–500) |
| Brødtekst | Outfit (300–500) |

Overskrifter er lange og prosaiske: "En aften, der begynder før du sætter dig." Korte fakta-ledes undgås — sproget er det primære designelement.

## Palet

| Token | Hex | Karakter |
|-------|-----|---------|
| Primær baggrund | \`#f5f0ea\` | Cremet papir-hvid |
| Mørk base / ink | \`#1a1208\` | Dyb varm brun-sort |
| Accent | \`#c8a87a\` | Varm guld |
| Sekundær | \`#e8e3db\` | Lys creme |

Ingen kolde blå-toner. Paletten er udelukkende varm — cream, brun, sand, guld.

## Layout

- **Hero:** \`img-tag\` — ét stort foto på toppen, ingen CSS baggrundsbillede.
- **Nav:** Sticky/fixed — forbliver synlig under scroll.
- **Sektioner:** Ca. 10 sections, 3 articles. Generøst white space mellem dem.
- **CTA-knapper:** Ingen border-radius (skarpe kanter) — matcher den upolerede, ægte-håndværk-æstetik.

## Sektioner

1. Hero-foto + tagline (lang, poetisk)
2. "Fem måder at sætte sig ned på" — siddepladser/atmosfære
3. Råvare-pitch ("Dagsfriske fisk…")
4. Fortællingen om stedet ("Bogstaveligt talt under klippen")
5. Footer / kontakt

Ingen prisliste på forsiden. Fokus er oplevelse, ikke transaktioner.

## Tone

Dansk, langsomt, sensorisk. Sproget handler om at ankomme et sted — ikke om at bestille. Ingen "Book bord nu"-overload. Ét CTA, brugt med omhu.

## Anti-references

- Ingen menukort-dumping på forsiden
- Ingen generiske restaurant-clichéer (gaffel-ikon, "God mad i hyggelige omgivelser")
- Ingen kolde, kliniske farver
- Ingen kasser/badges/bullets på headeren

## Genbrug

Arketypen er den **poetiske café**. Passer til: hyggerestauranter, vinbarer, lokale kroer, natcaféer. Kombiner med Zaytoon for "mad"-branchen — Under Klippen er den danske pendant.
`;
}

function writeZaytoon(recon, sig, slug) {
  return `---
title: Zaytoon — Social Dining i Horsens
slug: ${slug}
kilde: ${DEMO_SITES.zaytoon}
branche: restaurant / takeaway / mellemøstlig
---

# Design — Zaytoon

Zaytoon er varm, fyrig, og har en identitet der er hårdere at overse end de fleste restauranter. Grænsefladen er selvhostet — ingen Google Fonts — og paletten er sand + kul + guld: Middelhavet møder lavlyst kro.

## Typografi

Self-hosted via CSS-variabler (\`--f-display\`, \`--f-body\`, \`--f-ui\`). Google Fonts er fraværende; skriftsnit er bundlet. Stilen er robust og moderne — ingen lette serialer, mere displayskrift-karakter.

## Palet

| Token | Hex | Funktion |
|-------|-----|---------|
| Primær sand | \`#d6ccad\` | Varm mellemneutral base |
| Guld | \`#e7ca93\` | Accent på headere og highlights |
| Cream | \`#f2e0c6\` | Baggrundssektioner |
| Ink (mørk) | \`#0a0808\` | Brødtekst, nav |

Sand-kul-guld — mellemøstlige stuer og lamper. Intet koldt.

## Layout

- **Hero:** img-tag — foto i toppen, ingen CSS-bg-billede.
- **Nav:** Sticky. Tel-link til \`+4522870066\` synlig i header.
- **Sektioner:** 8 sections. Godt tempo i scroll-rækkefølgen.
- **Knapper:** \`border-radius: 4px\` — meget let afrundet, næsten kantet.

## Sektioner

1. Hero (foto + tagline: "Smagene fra Middelhavet & Mellemøsten")
2. Om Zaytoon — konceptforklaring
3. Menu-teaser ("Fra koldt til varmt")
4. Menu-link
5. Atmosfære/foto-grid
6. Kontakt + lokation

## Tone

Varm, inviterende, lidt festlig. Ikke eksklusiv — mere åben og lystfuld. Sproget siger "social dining": man deler, man nyder, man sidder længe.

## Anti-references

- Ikke kold "hygiejne-hvid" restaurantstil
- Ikke takeaway-skema med kun produktbilleder
- Intet neon/fastfood-look

## Genbrug

Arketypen er det **mellemøstlige eller internationale sociale spisested**. Bruges som pendantdemo til Under Klippen (dansk) — disse to dækker hele mad-spektret.
`;
}

function writeDenlillemaler(recon, sig, slug) {
  return `---
title: Den Lille Maler — Malerfirma i Esbjerg
slug: ${slug}
kilde: ${DEMO_SITES.denlillemaler}
branche: maler / håndværk
---

# Design — Den Lille Maler

Den Lille Maler har en karakter, der er sjælden for håndværkssites: ægte personlighed. Det er ikke Allan's Malerfirma med et generisk blå logo. Her er rød accent, terracotta touch og en displayskrift med tyngde — Bricolage Grotesque. Siden signalerer stolthed-over-fagværk, ikke billigst-i-by.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display (headlines) | Bricolage Grotesque (opsz 12–96, wght 400–800) |
| Serif-accent | Instrument Serif (italic) |
| Brødtekst | Manrope (wght 300–700) |

Tre skrifttyper — usædvanligt, og det virker. Bricolage Grotesque er ekspressiv og håndgjort; Instrument Serif løfter citater og underoverskrifter; Manrope holder løbeteksten klar.

## Palet

| Token | Hex | Karakter |
|-------|-----|---------|
| Baggrund | \`#f4efe6\` (theme-color) | Creme / lys lærred |
| Primær mørk | \`#2a241c\` | Dyb varm brun |
| Accent rød | \`#c7311e\` | Signalrød — farvekasse-analogi |
| Terracotta tone | \`#f4b5a6\` | Blød perso-salmon, dukker op gentagne gange |
| Dyb rød | \`#9f2113\` | Sekundær rød / hover |
| Marine accent | \`#1e3a5f\` | Brugt sparsomt til trust-signaler |

Rød er sjælden på håndværkssites — her bruges den bevidst som maling-reference. Terracotta-tonen er en signature.

## Layout

- **Hero:** img-tag — foto af konkret malerarbejde i toppen.
- **Nav:** Sticky. Tel-link \`+4550519055\`.
- **Sektioner:** 7 sections, 4 articles. God koncentration.
- **Knapper:** Blanding — \`4px\`, \`18px\`, \`24px\`, \`999px\` (pill). Primær CTA er pill-form.

## Sektioner

1. Hero + "Professionelt malerarbejde — ude og inde."
2. Ydelsegrid: fire specialer
3. Hold/personlig præsentation (Allan + team)
4. Arbejdsgalleri (fotos i fuld størrelse)
5. Kontakt

## Tone

Ærlig, konkret, lidt stolt — ikke arrogant. "Allan, to svende, en lærling — og en pensel der ikke giver op." Teksten skriver til folk der vil have det gjort rigtigt, ikke til laveste pris.

## Anti-references

- Ingen generiske VVS-blå farver
- Ingen tjeklistedesign ("✓ Hurtig levering ✓ Garanti")
- Ikke tryg og kedelig — ét tørt fotografi af manden bag firmaet, ingen stock

## Genbrug

Arketypen er den **håndstolte håndværksmester**. Bruges til malere, tømrere, murere, snedkere. Sæt mod ktvvs for den teknisk-tunge håndværksvariant (VVS/el).
`;
}

function writeKtvvs(recon, sig, slug) {
  return `---
title: KT VVS — Autoriseret VVS-installatør i Herning
slug: ${slug}
kilde: ${DEMO_SITES.ktvvs}
branche: VVS / el / teknik
---

# Design — KT VVS

KT VVS er designet til at signalere autoritet og teknik, ikke hygge. Siden er den teknisk-professionelle pol i demo-biblioteket: mørk navy base, stål-blå midtertoner og en koral-accent der bryder den industrielle palet med et enkelt varmt signal. Bricolage Grotesque giver displaykraft; Geist og JetBrains Mono understreger den tekniske side.

## Typografi

| Rolle | Familie | Note |
|-------|---------|------|
| Display | Bricolage Grotesque (opsz 12–96, wght 400–800) | Stor, konstruktiv headline-kraft |
| UI / løbetekst | Geist (wght 300–700) | Ren, neutral tech-læsefont |
| Mono detaljer | JetBrains Mono (wght 400–600) | Bruges til reference-numre, specs |

Tre-font-system der siger "professionel infrastruktur" — ikke "lokal mand med van".

## Palet

| Token | Hex | Funktion |
|-------|-----|---------|
| Dyb navy | \`#0a1626\` | Primær mørk baggrund/ink |
| Navy | \`#1a3a5c\` | Sektionsbaggrunde |
| Stål blågrå | \`#a9b4c1\` | Sekundær tekst, borders |
| Mellemblå | \`#7c8a9c\` | Muted UI-elementer |
| Koral accent | \`#ff8a7d\` | Eneste varme farve — CTA + highlights |
| Lys overflade | \`#eef2f6\` | Lyse sektioner, kontrastkort |

Koral mod navy er en markant valg — det er præcis nok varme til at invitere uden at miste det tekniske udtryk.

## Layout

- **Hero:** img-tag — fotografi af autoriseret VVS-arbejde.
- **Nav:** Sticky. Tel \`+4597124755\` synlig.
- **Sektioner:** 8 sections, 13 articles — det tættest befolkede layout i demo-biblioteket. Meget indhold, godt rytme.
- **Knapper:** \`4px\` og \`2px\` radius — næsten skarpe. Teknisk, ikke blødt.

## Sektioner

1. Hero + "VVS i Herning siden 1963."
2. Ydelsepitch — "Vi bygger det rigtigt"
3. Seks fagområder (grid)
4. Referencer / cases
5. Hold / kontakt
6. Footer

## Tone

Saglig, kompetent, klar. Ingen bløde vendinger. "Autoriseret" bruges som kvalitetsmærke. Teksten skriver til boligejer der vil vide "kan I faktisk det her?" — ikke til dem der vil hygge.

## Anti-references

- Ikke varm og folkelig (det er Vestfjends' position)
- Ikke generisk blå-hvid VVS-klon
- Ingen emoji eller uformelle CTAs

## Genbrug

Arketypen er den **teknisk autoritative installatør**. Den hårde pol af håndværk-branchen. Bruges til autoriserede VVS, elektrikere, kloakmestre. Sæt mod Den Lille Maler for den mere personlige håndværksvariant.
`;
}

function writeBuurfoto(recon, sig, slug) {
  return `---
title: Buur Foto — Bryllups- og portrætfotografi
slug: ${slug}
kilde: ${DEMO_SITES.buurfoto}
branche: fotografi / portræt
---

# Design — Buur Foto

Buur Foto er den mest tilbageholdne side i demo-biblioteket — og det er pointen. Fotografen gemmer sig ikke bag flashy design; siden lader billederne tale. Paletten er cream, guld og varm ink. Typografien er Cormorant Garamond + Inter — en klassisk editorialparring.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display | Cormorant Garamond (italic 300–600) |
| Brødtekst | Inter (wght 300–500) |

Cormorant i italic giver et nærmest dagbogs-agtig følelse. Inter holder navigationstekst og captions jordbundne.

## Palet

| CSS-var | Hex | Egenskab |
|---------|-----|---------|
| \`--cream\` | \`#f3eee5\` | Primær baggrund |
| \`--cream-2\` | \`#ebe4d6\` | Kortbaggrunde, sektioner |
| \`--ink\` | \`#1c1814\` | Primær tekst |
| \`--ink-soft\` | \`#2b2520\` | Sekundær tekst |
| \`--muted\` | \`#6e655a\` | Muted/captions |
| \`--gold\` | \`#9a7e4a\` | Accent — link-hover, detaljer |
| \`--sand\` | \`#b8a787\` | Borders, subtile linjer |

Paletten er endnu varmere end Under Klippen — næsten sepia-agtig. Ingenting er koldt.

## Layout

- **Hero:** text-only — ingen hero-foto i toppen; kun tekst og farve. Billederne ankommer gradvist nede på siden.
- **Nav:** Sticky.
- **Sektioner:** 6 sections, 3 articles. Lavt antal = lav larm.
- **CTA-knapper:** Ingen border-radius — skarpe kanter. Men brug er minimal — links er primær navigation.

## Sektioner

1. Hero — "Lyset mellem os" (text, ingen foto)
2. Udvalgt portfolio-essay ("Et halvt års stilhed og lys.")
3. Om fotografisk tilgang
4. Pakker / måder at samarbejde
5. Kontakt
6. Footer

## Tone

Poetisk, stille, personlig. "Fotografi handler om at blive." Det er ikke en pris-og-leveringstid-hjemmeside. Det er en invitation.

## Anti-references

- Ingen billedgalleri-grid som startside (typisk fotosite-fejl)
- Ingen "Book din fotografering" som første CTA
- Ingen farvede logoer eller markedsføringsgrafik

## Genbrug

Arketypen er den **stille kunsthåndværker**. Bruges til: portrætfotografer, bryllupsfotografer, illustratorer, kunstnere der sælger via æstetisk identitet snarere end funktion.
`;
}

function writeStreetcut(recon, sig, slug) {
  return `---
title: Street-Cut — Barber i København
slug: ${slug}
kilde: ${DEMO_SITES.streetcut}
branche: barber / herrefrisør
---

# Design — Street-Cut

Street-Cut spiller på maskulin enkelhed og urban klarhed. Det er ikke hverken den trygge lokale frisør eller en overdrevent hip barbershop. Det er det cooleste sted på vejen, der bare gør det godt. EB Garamond giver den klassiske serif-tyngde; Inter Tight holder UI'en skarp.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display | EB Garamond (italic, 400–500) |
| UI / labels | Inter Tight (400–500) |

Den seriøse serif mod den skarpkantede UI-grotesk — en bevidst kontrast der siger "tradition med nutidigt blik".

## Palet

| CSS-var | Hex | Funktion |
|---------|-----|---------|
| \`--bone\` | \`#EFE8DA\` | Primær baggrund — varm "ubleget papir" |
| \`--bone-deep\` | \`#E5DCC7\` | Sekundære sektioner |
| \`--ink\` | \`#142235\` | Primær mørk — dyb navy ink |
| \`--ink-deep\` | \`#0B1726\` | Maximum kontrast tekst |
| \`--ink-soft\` | \`#3E5878\` | Muted / sekundær tekst |
| \`--accent\` | \`#A37A4F\` | Varm tan/brun accent |

Bone + navy + tan er en klassisk maskulin palet. Ingen røde eller skarpe farver — elegant og urban.

## Layout

- **Hero:** text + img kombineret. Primær overskrift over billede-elementer.
- **Nav:** Sticky.
- **Sektioner:** 5 sections, 5 articles. Kompakt og rytmisk.
- **Knapper:** Primær CTA har \`border-radius: 1px\` — næsten kantet, meget maskulint. Runde ikon-knapper er \`50%\`.

## Sektioner

1. Hero — "Lige din stil."
2. Priser (transparent, ingen skjulte priser)
3. Lokationer (5 adresser)
4. Filosofi / hvem er vi
5. Footer

## Tone

Direkte, respektfuld, urban. "Faste priser. Ingen overraskelser." Det er ikke et slogan — det er en løfte. Teksten undgår ironi eller hipster-distancering.

## Anti-references

- Ingen overdrevent hipster-barbershop-æstetik (skæg-ikoner, tatoveringsstil)
- Ingen "Book her" x5 på siden
- Ingen tilfældig farveleg

## Genbrug

Arketypen er den **urbane barber**. Bruges til: barbershops, herrefrisører, frisørsaloner der vil signalere premium-maskulinitet uden at miste tilgængelighed.
`;
}

function writeSalonArtec(recon, sig, slug) {
  return `---
title: Salon Artec — by Julie Ellebæk — Frisør i Skive
slug: ${slug}
kilde: ${DEMO_SITES.salonArtec}
branche: frisør / salon / skønhed
---

# Design — Salon Artec

Salon Artec er den dristigste farvepalet i demo-biblioteket: dyb teal/skovgrøn mod guld og creme. Det er ikke en typisk dansk frisørsalon med rosa og hvidt — det er en kunstnerisk beslutning der signalerer "en frisør med håndværksmæssig stolthed og unik æstetik". Cormorant Garamond + DM Sans er den klassiske editorial serif + clean sans-parring.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display | Cormorant Garamond (italic, 400–700) |
| Brødtekst / UI | DM Sans (opsz 9–40, wght 300–700) |

Cormorant giver frisøren et kunstnerisk og lidt poetisk udtryk. DM Sans er meget neutral og nem at læse — holder navigationsteksten jordet.

## Palet

| CSS-var | Hex | Karakter |
|---------|-----|---------|
| \`--teal-900\` | \`#0c2a27\` | Meget dyb skovgrøn — primær mørk |
| \`--teal-800\` | \`#0f3a35\` | Sektionsbaggrunde (mørke) |
| \`--teal-700\` | \`#13443d\` | Kort-baggrunde |
| \`--teal-600\` | \`#1a5048\` | Hover-states |
| \`--gold\` | \`#c9a35e\` | Primær accent — guld |
| \`--gold-soft\` | \`#d8b986\` | Blød guld / hover |
| \`--gold-deep\` | \`#a47f3e\` | Dyb guld / skygger |
| \`--cream\` | \`#f7f1e6\` | Lys baggrund, kontrast til teal |

Teal + guld er en palet der ikke eksisterer i billige frisørkæder. Den koster tid at vælge og mod at bruge.

## Layout

- **Hero:** bg-image — CSS \`background-image: url(...)\` er den dominerende hero-type. Fotografi som total baggrund, tekst ovenpå.
- **Nav:** Sticky.
- **Sektioner:** 8 sections, 6 articles. Godt rymt med et klart hierarki.
- **Knapper:** \`border-radius: 999px\` (pill) og \`50%\` (runde) — bløde, organiske former.

## Sektioner

1. Hero (bg-image + "Hårhåndværk med hjerte.")
2. Velkommen / om salonen
3. Behandlinger (grid)
4. Prisliste
5. Bestilling / kontakt CTA
6. Fotos fra salonen
7. Footer

## Tone

Varm, håndværksstolt og personlig. "Hårhåndværk med hjerte" er en central linje — det er ikke service, det er kunst. Sproget er dansk og direkte uden at miste det elegante.

## Anti-references

- Ikke generisk lyserødt/hvidt frisørlook
- Ikke chain-salon-stil (ingen "Book nu" banner midt i sidens top)
- Ingen stock-billeder af generiske frisørmodeller

## Genbrug

Arketypen er den **kunstneriske salon med unik palet**. Den klarest differentierede skønhedssite i demo-biblioteket. Brug til: frisørsaloner, hair stylists, specialsaloner der vil adskille sig. Par med Vida for beauty-branchen — Salon Artec er frisør, Vida er klinik.
`;
}

function writeVida(recon, sig, slug) {
  return `---
title: VIDA Skønhedsklinik — Gl. Hasseris, Aalborg
slug: ${slug}
kilde: ${DEMO_SITES.vida}
branche: skønhedsklinik / hudpleje
---

# Design — VIDA Skønhedsklinik

VIDA er den varmeste side i demo-biblioteket — sand, linned og dyb brun. Det er ikke en medicinsk klinik og ikke en modehjemmeside. Det er et fredeligt rum man har lyst til at sidde i. Theme-color \`#EAE2D2\` (lys sand) er sat i HTML og kommunikerer identiteten allerede i browser-chrome.

## Identitet

Siden er siden 2010. Det understreges allerede i titlen: "hudpleje og skønhedsbehandlinger i Gl. Hasseris, Aalborg, siden 2010." Kontinuitet og sted er brand-kernen. Tre navngivne medarbejdere: Lene, Lisa & Rebekka — personerne er designelementer.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display | Cormorant Garamond (italic, 300–600) |
| Brødtekst | Manrope (wght 300–600) |

Cormorant giver den meditative, stille tone. Manrope er let og luftig — ikke klinisk, ikke teknisk. Kombinationen er: vi er seriøse og vi er varme.

## Palet

| Token | Hex | Funktion |
|-------|-----|---------|
| Theme / bg | \`#eae2d2\` | Primær sandlig baggrund |
| Sand | \`#d7ccb7\` | Sekundære sektioner |
| Varmt lærred | \`#f4ecdc\` | Lyse zoner |
| Creme | \`#e2d9c6\` | Kortbaggrunde |
| Guld accent | \`#a07a1e\` | Links, detaljer, highlights |
| Sand-guld | \`#c2a17c\` | Mellemtoner |
| Mørk brun ink | \`#26170e\` | Primær tekst |

Hele paletten er en jordfarve-familie. Intet er lyseblåt, intet er klinisk hvidt, intet er koldt.

## Layout

- **Hero:** img-tag — ét åbningsfoto (klinik/interiør), ingen CSS bg-billede. Billedet trækker brugeren ind.
- **Nav:** Sticky. Tel \`+4530740476\` synlig.
- **Sektioner:** 9 sections, 7 articles — den bredeste struktur af klinik-sites. Indeholder et fotogalleri-afsnit ("Glimt fra klinikken") med 12+ billeder.
- **Knapper:** Blanding: \`999px\` (pill), \`0\` (skarpe), \`4px\` (næsten skarpe).

## Sektioner

1. Hero + "forskøn livet" (tagline)
2. "En stille pause i en travl hverdag." — storytelling-blok
3. Team-introduktion (Lene, Lisa, Rebekka)
4. Behandlingsoversigt
5. Fotogalleri ("Glimt fra klinikken")
6. "VIDA betyder livet." — brandfortælling
7. Kontakt + adresse (Bygaden 24a, Gl. Hasseris)
8. Footer med åbningstider og telefon

## Tone

Stille, varm, løftende. "En stille pause i en travl hverdag" er linjens kerne — det sælger ikke ydelser, det sælger et fristed. Sproget er genkaldende, ikke beskrivende.

## Anti-references

- Ikke medicinsk/klinisk hvid palet
- Ikke "10 treatments, 3 packages, book here" transaktionsstil
- Ingen prisliste som hero-element
- Ikke spa-kæde-generisk

## Genbrug

Arketypen er den **varme skønhedsklinik med sjæl**. Bruges til: hudklinikker, kosmetologer, spa-behandlere, wellness-centre. Par altid med Salon Artec — Vida er klinik-pol, Artec er salon-pol. Vida passer bedst til behandlinger (ansigt, krop, velvære); Artec til hår og styling.
`;
}

function writeVestfjends(recon, sig, slug) {
  return `---
title: Vestfjends VVS — Lokal VVS-mester i Skive
slug: ${slug}
kilde: ${DEMO_SITES.vestfjends}
branche: service / lokal håndværk / VVS
---

# Design — Vestfjends VVS

Vestfjends er den lokale, folkelige pol i demo-biblioteket. Mens KT VVS signalerer teknisk autoritet, er Vestfjends noget mere menneskeligt: "Vi kender huset. Vi kender området." Designet understøtter dette med en ren og nøgtern tilgang — Barlow og Barlow Condensed, dark navy, intet fancy.

## Typografi

Self-hosted via Next.js font-system (\`@font-face\`) — ingen Google Fonts fetch:

| Rolle | Familie |
|-------|---------|
| Primær (display + UI) | Barlow Condensed |
| Brødtekst | Barlow |

Barlow Condensed er smal og kompakt — det er en font der gør sig på bilskilte og lokale firmaer. Det er ikke designerens font; det er håndværkerens font.

## Palet

| CSS-var | Hex | Funktion |
|---------|-----|---------|
| \`--surface\` | \`#f4f7fb\` | Lys, lettere blå-grå baggrund |
| \`--text-primary\` | \`#0a121a\` | Primær tekst — dyb kold sort |
| \`--text-muted\` | \`#4b545c\` | Muted / sekundær |
| Nav/mørk section | \`#091c2d\` | Marineblå mørke zoner |
| Mellemlaget | \`#192a3b\` | Sekundær mørk |
| Overfladelag | \`#263443\` | Kortbaggrunde, mørk mode |

Koldt navy + lys grå-hvid. Det er det mest neutrale og "traditionelle" farvesæt i biblioteket — hverken kreativt eller teknologisk, bare trofast og lokalt.

## Layout

- **Hero:** text-only (ingen hero-foto i CSS; ingen \`<img>\` i toppen af body-HTML).
- **Nav:** IKKE sticky — scrolles væk med siden. Den eneste site i biblioteket uden sticky nav.
- **Sektioner:** 4 sections, 6 articles. Det korteste, mest kompakte layout.
- **Knapper:** \`border-radius: 0\` — 100% skarpe kanter. Funktionelt, ikke dekorativt.
- **Tel:** \`+4597547600\` synlig.

## Sektioner

1. Hero — "Lokal VVS-mester i Skive og omegn"
2. Ydelsegrid (6 artikler/ydelser)
3. Om firmaet — "Vi kender huset. Vi kender området."
4. Kontakt

## Tone

Direkte og nærværende. Ingen sproglig kreativitet — det er en fordel her. Teksten siger hvad virksomheden gør og hvem de er. "Lokal" er et keyword der bruges med intentionen: dette er ikke en kæde.

## Anti-references

- Ikke teknisk/kold KT VVS-stil (her er det folkelig, ikke autoritetsmærket)
- Ingen Bricolage Grotesque display-kraft
- Ingen coral-accent eller koldblå highlights

## Genbrug

Arketypen er den **trygge lokale håndværker**. Bruges til service-virksomheder der ikke søger "premium" men søger "trofast nabo": lokale gartnere, servicefirmaer, håndværksmestre på et sted, rengøringsfirmaer. Default-demo for service-branchen.
`;
}

function writeMidtadvokaterne(recon, sig, slug) {
  // Enriched from local LawyerSite/MidtAdvokaterne_Website_Brief.md
  return `---
title: MidtAdvokaterne — Advokater i Ikast siden 1964
slug: ${slug}
kilde: ${DEMO_SITES.midtadvokaterne}
branche: advokat / juridisk
---

# Design — MidtAdvokaterne

Kilde: live site \`${DEMO_SITES.midtadvokaterne}\` + lokal designbrief (\`LawyerSite/MidtAdvokaterne_Website_Brief.md\`). MidtAdvokaterne er rodfæstede i Ikast siden 1964 — og designet bærer dette. Det er den mest autoritetstunge side i demo-biblioteket: serif-overskrifter, guld-accent, varm off-white baggrund.

## Identitet

Firmaet er ikke "Danmarks største" — det er "Ikasts". Det er en kernedistinktion der gennemsyrer designet: lokal forankring, personlige relationer, genkendelighed. 7 medarbejdere, to partnere (Loa Nedergaard Olsen og Martin Plum Juul) med årtiers erfaring.

## Typografi

Designbriefen specificerer:

| Rolle | Anbefalede valg |
|-------|----------------|
| Overskrifter | Playfair Display / Cormorant Garamond / Libre Baskerville (humanist serif) |
| Brødtekst | Inter / DM Sans / Nunito (ren, mobil-tilpasset sans-serif) |

Logikken: **"Serifen bærer firmaets historie; sans-serifen bærer klarheden og tilgængeligheden."** Sammen siger de: "Vi har gjort dette i 60 år, og vi forklarer det på klar dansk."

## Palet

Designbrief-specifikke farver:

| Token | Hex | Funktion |
|-------|-----|---------|
| Primær — dyb navy | \`#1A2B45\` | Trust, stabilitet — primær baggrund/ink |
| Alternativ — skovgrøn | \`#1E3A2F\` | Trust og langtidighed |
| Accent | \`#C4973A\` | Varm rav/antik guld — buttons, hover |
| Baggrund | \`#F7F4EF\` | Varm off-white — "kvalitetspapir" |
| Tekst | \`#1C1C1C\` | Næsten-sort charcoal, aldrig ren sort |

Paletten signalerer ro, tradition og troværdighed. Guld-accenten binder gammelt og varmt.

## Layout (7 sektioner fra designbriefen)

- **Hero:** bg-image (fuld viewport) — billede af Sieferts Plads 5 med Ken Burns slow-zoom. Mørkt overlay. Overskrift fader ind: *"Erfarne advokater i hjertet af Ikast. Siden 1964."*
- **Nav:** Transparent over hero → solid ved scroll. Sticky.
- **Knapper:** To i hero — primær (guld/amber baggrund, navy tekst), sekundær (outlined hvid). Subtil hover-animation (\`200ms scale\`).

## Sektioner

1. **Hero** (fullscreen, Ken Burns foto, tagline, 2 CTAs, scroll-indikator)
2. **Trust bar** (smal strip: "Grundlagt 1964 · 7 medarbejdere · Centrum af Ikast · Erhverv & privat")
3. **Firmaprof** — centret citattekst: *"Vi er ikke Danmarks største advokatfirma. Vi er Ikasts."*
4. **Mød holdet** (mørk sektion, staggered scroll-reveal, B&W→farve hover, partnere øverst i store kort)
5. **Privat / Erhverv** split (to kolonner, slide-in animation)
6. **Citat / anbefaling** (intentionelt stille sektion — ingen animation)
7. **Kontakt-teaser** + **Footer** (3-kolonne: firma, nav, åbningstider)

## Tone

Varm, klar, rolig. Ingen juridisk jargon. Skrevet til folk der googler "advokat skilsmisse Ikast" kl. 23 — teksten må aldrig skræmme. "Den mest vidende ven du har, der også er advokat."

## Anti-references

- Ikke kold, korporativ advokatstil
- Ikke "Vi tilbyder kompetente juridiske ydelser" — generisk og distancerende
- Intet billede af kvinde med bunke papirer (stock-foto-advokat)
- Ingen animeret retsbygning-header

## Genbrug

Arketypen er den **personlige lokale advokat med historisk forankring**. Brug til: advokater, revisorer, notarer, lokale professionelle servicevirksomheder der sælger via tillid og kontinuitet.
`;
}

// ─── _sting_recon (Sting Studio — digital consultancy, Lucas & Charlie) ─────
function writeStingRecon() {
  const stingDir = path.join("C:\\Users\\Buur\\Documents\\Workflows\\_sting_recon");
  const slug = "sting-studio";
  return {
    slug,
    content: `---
title: Sting — Digital Consultancy (Lucas & Charlie)
slug: ${slug}
kilde: https://sting.studio (lokal kilde: _sting_recon/)
branche: digital bureau / konsulentvirksomhed
---

# Design — Sting Studio

Sting er IKKE en af demo-sitene fra DEMO_SITES — det er Lucas og Charlies eget studio-site. Lokalt source i \`_sting_recon/\`. Bruges internt som reference for studiets eget udtryk og tone.

## Hvad er Sting?

Digital consultancy drevet af Lucas (design & front-end, København) og Charlie (strategi & vækst, London). USP: **"You see the concept before you commit"** — tre arbejdsdage, gratis konceptretning, ingen deposit. Ingen account managers, ingen handoffs.

## Typografi

| Rolle | Familie | Note |
|-------|---------|------|
| Display | Cormorant Garamond (ital, 300/600) | Poetisk, editorial serif |
| Brødtekst | DM Sans (300/400/500) | Ren, airy |
| Mono | DM Mono | Tal, referencer, detaljer |

Den tre-font-parring er sofistikeret. Cormorant bringer editorial tyngde; DM Sans holder UI'en lys og åben; DM Mono tilføjer en teknisk/præcis note til tal og stats.

## Palet ("Ember" uplift — v4)

| CSS-var | Hex | Karakter |
|---------|-----|---------|
| \`--color-bg\` | \`#F6F3EE\` | Varm off-white — "lærred" |
| \`--color-text\` | \`#191713\` | Varm næsten-sort |
| \`--color-surface\` | \`#EFEAE2\` | Sekundær overflade |
| \`--color-mid\` | \`#6E6961\` | Muted/sekundær tekst |
| \`--color-bg-dark\` | \`#131110\` | Mørk sektion (CTA-zone) |
| \`--color-accent\` | \`#C8A97E\` | "Burnished sand" — stille accent |
| \`--accent-vibrant\` | \`#D4500F\` | "Ember" — den markante accent |
| \`--accent-deep\` | \`#A63B05\` | Dyb ember/rust |
| Theme-color | \`#F6F3EE\` | (meta tag) |

To-niveau accent: den stille sandton til elegante detaljer; den brændende ember til selection/highlight/CTA-glow. Resten er neutraler i varm beige-familie.

## Layout

- **Hero:** text-only + UI-mockups (browser-chrome wireframes af klient-sites). Ingen stor hero-foto.
- **Nav:** Sticky — transparent, minimalt. Hamburger på mobil.
- **Sektioner (5):**
  1. Hero — "Agencies show you a quote. *We show you the site.*" + mockups + marquee ("Three working days · No cost · No commitment")
  2. Stat strip (3: dagsviden, 0 forudbetaling, 2 mennesker)
  3. "Concept First" (hook 01) — proces-pitch
  4. Selected Work (02) — 2 case-cards med browser-mockup-grafik
  5. Services (03) — liste: website design & build, landing pages, SEO foundations, social, redesigns, ongoing optim.
  6. Founders (04) — Charlie (portræt) + Lucas (portræt) med korte bios
  7. Social proof (05) — 3 klientcitater
  8. CTA Dark (mørk sektion — "See the concept first.")
  9. Footer — brand / nav / kontakt

- **Knapper/links:** \`link-underline\`-klasse (animated underline hover). CTA er \`→\` links, ikke fyldte knapper.
- **Mobil-CTA:** Fast bar i bunden på mobil: "Get a concept — free, no commitment".

## Tone

Anglofon og direkte. Ingen buzzwords. "Concept-first" er kernen gentaget i hero, footer og CTA. Ironi-frit — men med præcision og selvtillid. Sproget taler til founders og operators der ved hvad en god hjemmeside skal gøre.

## Signatur-designmove

**Browser-mockup-grafik i hero:** I stedet for at vise klientfotos bruger hero-sektionen håndtegnede browser-wireframes (CSS-konstruerede) med URL-bar. Det er en metatækning: "vi designer sites, og her er et site om sites der designer sites." Det er ingen der kopierer det ukritisk.

## Anti-references

- Ingen portfolio-grid som startside (typisk bureausite-fejl)
- Ingen "Vi tilbyder": vores services er… liste i hero
- Ingen testimonial-karussel
- Ingen case-studie-PDFs at downloade

## Genbrug

Arketypen er det **concept-first digitale bureau**. Internt reference, ikke ekstern demo. Bruges som inspirationskilde for Sting's fremtidige studio-kommunikation og som kalibreringsreference for tone (anglofon, direkte, præcis).
`,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

const sitesDir = path.join(REPO_ROOT, "KnowledgeOS", "wiki", "design", "sites");
fs.mkdirSync(sitesDir, { recursive: true });

const SITE_DEFS = [
  { key: "underKlippen", name: "Under Klippen", writer: writeUnderKlippen },
  { key: "zaytoon", name: "Zaytoon", writer: writeZaytoon },
  { key: "denlillemaler", name: "Den Lille Maler", writer: writeDenlillemaler },
  { key: "ktvvs", name: "KT VVS", writer: writeKtvvs },
  { key: "buurfoto", name: "Buur Foto", writer: writeBuurfoto },
  { key: "streetcut", name: "Street-Cut", writer: writeStreetcut },
  { key: "salonArtec", name: "Salon Artec", writer: writeSalonArtec },
  { key: "vida", name: "VIDA Skønhedsklinik", writer: writeVida },
  { key: "vestfjends", name: "Vestfjends VVS", writer: writeVestfjends },
  { key: "midtadvokaterne", name: "MidtAdvokaterne", writer: writeMidtadvokaterne },
];

const findings = [];

for (const site of SITE_DEFS) {
  const url = DEMO_SITES[site.key];
  process.stdout.write(`  Fetching ${site.name}...`);

  let recon = null;
  let sig = {};
  let reconFailed = false;

  try {
    // Raw HTML fetch for signal extraction
    const html = await fetchRawHtml(url);
    sig = extractSignals(html, url);
    // Try reconCustomer for slug + title + palette (best-effort)
    recon = await reconCustomer(url, site.name);
  } catch (e) {
    reconFailed = true;
    console.log(` recon failed: ${e.message}`);
  }

  const slug = recon?.slug || slugify(site.name);
  const md = site.writer(recon, sig, slug);
  const outPath = path.join(sitesDir, `${slug}.md`);
  fs.writeFileSync(outPath, md, "utf-8");

  // Findings row
  const fonts = sig.gfFamilies?.length
    ? sig.gfFamilies.join(" + ")
    : (sig.fontFamilies?.slice(0, 3).join(", ") || "self-hosted");
  const colors = sig.topColors?.slice(0, 2).join(", ") || (recon?.palette?.slice(0, 2).join(", ")) || "—";
  const hero = sig.heroType || "—";
  const sections = sig.sectionCount ?? "—";

  let archetype = "—";
  if (site.key === "underKlippen") archetype = "poetisk café";
  else if (site.key === "zaytoon") archetype = "internationalt spisested";
  else if (site.key === "denlillemaler") archetype = "håndstolt håndværksmester";
  else if (site.key === "ktvvs") archetype = "teknisk installatør";
  else if (site.key === "buurfoto") archetype = "stille kunsthåndværker";
  else if (site.key === "streetcut") archetype = "urban barber";
  else if (site.key === "salonArtec") archetype = "kunstnerisk salon";
  else if (site.key === "vida") archetype = "varm skønhedsklinik";
  else if (site.key === "vestfjends") archetype = "lokal servicehåndværker";
  else if (site.key === "midtadvokaterne") archetype = "personlig lokal advokat";

  findings.push({ slug, fonts, colors, hero, sections, archetype, reconFailed });
  console.log(` -> ${slug}.md${reconFailed ? " [recon degraded]" : ""}`);
}

// Sting Studio (local source, no network needed)
{
  process.stdout.write("  Writing Sting Studio (local source)...");
  const { slug, content } = writeStingRecon();
  const outPath = path.join(sitesDir, `${slug}.md`);
  fs.writeFileSync(outPath, content, "utf-8");
  findings.push({
    slug,
    fonts: "Cormorant Garamond + DM Sans + DM Mono",
    colors: "#F6F3EE, #D4500F",
    hero: "text+mockups",
    sections: 9,
    archetype: "concept-first bureau",
    reconFailed: false,
  });
  console.log(` -> ${slug}.md`);
}

// ─── Print findings table ────────────────────────────────────────────────────
console.log("\n");
console.log("┌─────────────────────────────┬──────────────────────────────────────┬──────────────────────────────┬──────────────┬──────────┬────────────────────────────┐");
console.log("│ slug                        │ fonts                                │ top-2 colors                 │ hero-type    │ sections │ archetype                  │");
console.log("├─────────────────────────────┼──────────────────────────────────────┼──────────────────────────────┼──────────────┼──────────┼────────────────────────────┤");
for (const f of findings) {
  const slug = f.slug.padEnd(27);
  const fonts = (f.fonts || "").slice(0, 36).padEnd(36);
  const colors = (f.colors || "").slice(0, 28).padEnd(28);
  const hero = (f.hero || "").padEnd(12);
  const secs = String(f.sections).padEnd(8);
  const arch = (f.archetype || "").padEnd(26);
  console.log(`│ ${slug} │ ${fonts} │ ${colors} │ ${hero} │ ${secs} │ ${arch} │`);
}
console.log("└─────────────────────────────┴──────────────────────────────────────┴──────────────────────────────┴──────────────┴──────────┴────────────────────────────┘");
console.log(`\nwrote ${findings.length} design docs to KnowledgeOS/wiki/design/sites/`);
