---
title: VIDA Skønhedsklinik — Gl. Hasseris, Aalborg
slug: vida-skoenhedsklinik
kilde: https://vida-ten-gamma.vercel.app/
branche: skønhedsklinik / hudpleje
---

# Design — VIDA Skønhedsklinik

VIDA er den varmeste side i demo-biblioteket — sand, linned og dyb brun. Det er ikke en medicinsk klinik og ikke en modehjemmeside. Det er et fredeligt rum man har lyst til at sidde i. Theme-color `#EAE2D2` (lys sand) er sat i HTML og kommunikerer identiteten allerede i browser-chrome.

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
| Theme / bg | `#eae2d2` | Primær sandlig baggrund |
| Sand | `#d7ccb7` | Sekundære sektioner |
| Varmt lærred | `#f4ecdc` | Lyse zoner |
| Creme | `#e2d9c6` | Kortbaggrunde |
| Guld accent | `#a07a1e` | Links, detaljer, highlights |
| Sand-guld | `#c2a17c` | Mellemtoner |
| Mørk brun ink | `#26170e` | Primær tekst |

Hele paletten er en jordfarve-familie. Intet er lyseblåt, intet er klinisk hvidt, intet er koldt.

## Layout

- **Hero:** img-tag — ét åbningsfoto (klinik/interiør), ingen CSS bg-billede. Billedet trækker brugeren ind.
- **Nav:** Sticky. Tel `+4530740476` synlig.
- **Sektioner:** 9 sections, 7 articles — den bredeste struktur af klinik-sites. Indeholder et fotogalleri-afsnit ("Glimt fra klinikken") med 12+ billeder.
- **Knapper:** Blanding: `999px` (pill), `0` (skarpe), `4px` (næsten skarpe).

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

## Effekter & animationer

- **Morphing wordmark (signatureffekt):** "VIDA"-logoet er et fast `.morph`-element der scroll-animeres fra hero-centerposition (stor skrifttype `clamp(88px, 19vw, 220px)`) ned til nav-størrelse (`30px`) via JS `will-change: transform` + position-interpolation. Easing styret via CSS `transition: 0.4s ease` på enkelt-egenskaber. Unikt for Vida — ingen andre sites har dette.
- **`@keyframes rise`:** Hero-elementer (`.hero-sub`, `.hero-eyebrow`, `.hero-cta`, `.hero-scroll`) animeres ind med `opacity: 0; transform: translateY(14px) → none`, `1.1s cubic-bezier(.2,.7,.2,1)`, staggered delays 0.35/0.55/0.75/1.1s.
- **`@keyframes slideDown`:** Scroll-indikatorens linje har et `::after`-element der slides ned: `translateY(0 → 96px)`, `2.4s infinite` — subtil bevægelsesinvitation.
- **Manifest word-lines reveal:** `.word-line` elementer (`opacity: 0; transform: translateY(14px)`) animeres ind med `transition: 0.9s ease` via IntersectionObserver, staggered `transition-delay: 0.05/0.22/0.39s`.
- **Showcase slideshow (4 slides, ingen lightbox):** `.show-slide` med `opacity: 0/1 transition: 1.4s ease`; aktiv slide `.on` + Ken Burns: `img { transform: scale(1) → scale(1.06); transition: transform 6.5s linear }`. Slide-caption fader ind med `0.8s ease, delay 0.4s`. Dot-navigering med width-animation (22px→36px).
- **Stemning drift-carousel (`@keyframes drift`):** `transform: translateX(0 → -50%)`, `80s linear infinite` — pauser ved hover. Figur-billeder har `transition: transform 1.4s ease` + `scale(1.05)` ved hover.
- **Behandlings-kort hover:** `translate(-4px) + box-shadow 0 30px 60px`, `transition: 0.5s ease`; billede: `scale(1.06), 1.4s ease`.
- **`.reveal` IntersectionObserver:** `opacity: 0; transform: translateY(20px) → none`, `0.9s ease`. Bruges på alle sektions-elementer under fold.
- **Nav frosted-glass:** `backdrop-filter: blur(14px) saturate(140%)`, `rgba(234,226,210,.82)`, `transition: 0.4s ease`.
- **Subtile radiale glow-gradienter i hero:** `::before` og `::after` med `radial-gradient(closest-side, rgba(199,162,74,.08)...)` — varme gyldenbrune pletter bag wordmark.
- **Ingen parallax, ingen framer-motion, ingen AOS, ingen lightbox** — alt vanilla CSS + JS.

## Typografi (detaljeret)

- Display: **Cormorant Garamond** wght `300, 400, 500, 600` + italic `300, 400` · Body: **Manrope** wght `300, 400, 500, 600`
- Wordmark/hero-anker: Cormorant 300, `clamp(88px, 19vw, 220px)`, `letter-spacing: 0.42em`, uppercase — det dominerende typografiske element på siden
- H2 manifest: Cormorant 400, `72px`, `letter-spacing: 0.005em` — rolig, ikke aggressiv
- `.h-1` generisk: `clamp(40px, 5.6vw, 84px)`, Cormorant 400
- Eyebrows: Manrope 500, `11px`, `letter-spacing: 0.32em`, uppercase — med guld-dot `::before` (5px cirkel)
- Brødtekst: Manrope 400, `16px`, `line-height: 1.65`
- Lede: Manrope 400, `clamp(17px, 1.35vw, 20px)`, `line-height: 1.7`
- Hero-sub (tagline "forskøn livet"): Cormorant italic 300, `clamp(22px, 2.5vw, 34px)`, `letter-spacing: 0.01em`
- Nav-links: Manrope 400, `13px`, `letter-spacing: 0.04em` — meget tæt, diskret
