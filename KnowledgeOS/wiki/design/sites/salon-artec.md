---
title: Salon Artec — by Julie Ellebæk — Frisør i Skive
slug: salon-artec
kilde: https://salon-artec.vercel.app/Salon%20Artec.html
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
| `--teal-900` | `#0c2a27` | Meget dyb skovgrøn — primær mørk |
| `--teal-800` | `#0f3a35` | Sektionsbaggrunde (mørke) |
| `--teal-700` | `#13443d` | Kort-baggrunde |
| `--teal-600` | `#1a5048` | Hover-states |
| `--gold` | `#c9a35e` | Primær accent — guld |
| `--gold-soft` | `#d8b986` | Blød guld / hover |
| `--gold-deep` | `#a47f3e` | Dyb guld / skygger |
| `--cream` | `#f7f1e6` | Lys baggrund, kontrast til teal |

Teal + guld er en palet der ikke eksisterer i billige frisørkæder. Den koster tid at vælge og mod at bruge.

## Layout

- **Hero:** bg-image — CSS `background-image: url(...)` er den dominerende hero-type. Fotografi som total baggrund, tekst ovenpå.
- **Nav:** Sticky.
- **Sektioner:** 8 sections, 6 articles. Godt rymt med et klart hierarki.
- **Knapper:** `border-radius: 999px` (pill) og `50%` (runde) — bløde, organiske former.

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

## Effekter & animationer

- **Art-deco SVG frame-draw (`@keyframes drawLine`):** Hero-rammen tegnes via `stroke-dashoffset: 1200 → 0` over `2.2s cubic-bezier(.7,0,.2,1)`. Hjørne-ornamenter fader ind med `@keyframes fadeOrn` (opacity 0→0.8, `0.6s ease`, delay 2.2s). En cinematisk "unveil" der positionerer brandet som kunsthåndværk.
- **Portrait video window (`@keyframes windowIn`):** `opacity: 0; transform: translateX(-50%) scale(1.04)` → `opacity: 1; scale(1)` over `1.6s cubic-bezier(.2,.7,.2,1)`.
- **Cycling logo (`@keyframes logoCycle`):** Logo-overlay i hero cycler med fade+scale: `0% scale(.97) → 14% scale(1) opacity 1 → 84% opacity 0 scale(1.03)` — loop `7s ease-in-out infinite`, start delay 1.4s.
- **`@keyframes fadeUp`:** Generisk reveal (opacity 0→1, translateY→0), brugt på hero tag/CTA med delays 2.5–2.8s + `cubic-bezier(.2,.7,.2,1)`.
- **`.reveal` IntersectionObserver:** Elementer starter `opacity: 0; transform: translateY(24px)` og observes ind som `.reveal.in { opacity: 1; transform: none }`, `transition: 0.9s cubic-bezier(.2,.7,.2,1)`. Brugt konsekvent på alle sektions-blokke.
- **Galleri (horizontal scroll-snap, ingen lightbox):** `.gal-rail` med `scroll-snap-type: x mandatory` — cards `clamp(280px, 36vw, 460px)` med `aspect-ratio: 4/5`. Hover: `img { transform: scale(1.04); filter: saturate(1.05) }`, `transition: 1.4s cubic-bezier(.2,.7,.2,1)`. Gradient-overlay `linear-gradient(180deg, transparent 55%, rgba(12,42,39,.7) 100%)` vises altid. Ingen lightbox/modal — sidescroll er interaktionen.
- **Nav frosted-glass:** `backdrop-filter: blur(14px)`, `rgba(247,241,230,.92)`, `transition: .35s ease`.
- **Grain texture overlay:** `mix-blend-mode: overlay`, `opacity: .05` — SVG feTurbulence noise som subtil tekstur på hero.
- **`@keyframes pulse` (kontakt-ikon):** box-shadow puls `0 0 0 6px rgba(201,163,94,.25) → 12px transparent` — guldglød-animation på CTA-ikon.
- **Mobile drawer:** `transform: translateY(-100% → 0)`, `0.45s cubic-bezier(.7,0,.2,1)`.
- **Ingen parallax, ingen framer-motion, ingen AOS** — alt vanilla.

## Typografi (detaljeret)

- Display: **Cormorant Garamond** wght `400, 500, 600, 700` + italic `400, 500` · Body/UI: **DM Sans** opsz `9..40`, wght `300, 400, 500, 600, 700`
- H1: `clamp(48px, 9vw, 132px)`, `font-weight: 500`, `line-height: 1.02`, `letter-spacing: -0.015em`
- H2: `clamp(36px, 5.5vw, 76px)`, `line-height: 1.05`
- Lede/intro: Cormorant, `clamp(20px, 2.2vw, 26px)`, `font-weight: 400`, `line-height: 1.45`
- Eyebrows: DM Sans, `11px`, `letter-spacing: 0.28em`, uppercase — med guld-streg `::before` (34px × 1px, `var(--gold)`)
- Brødtekst: DM Sans 400, `16px`, `line-height: 1.55`
- Prisliste-navne og -priser: Cormorant 500, `22px` — elegant, ikke klinisk
- Signatur-swirl: Cormorant italic, `30px`, `var(--gold-deep)` — "Julie" i håndskriftslignende stil
