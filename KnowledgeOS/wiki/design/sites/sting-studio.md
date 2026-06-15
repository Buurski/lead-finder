---
title: Sting — Digital Consultancy (Lucas & Charlie)
slug: sting-studio
kilde: https://sting.studio (lokal kilde: _sting_recon/)
branche: digital bureau / konsulentvirksomhed
---

# Design — Sting Studio

Sting er IKKE en af demo-sitene fra DEMO_SITES — det er Lucas og Charlies eget studio-site. Lokalt source i `_sting_recon/`. Bruges internt som reference for studiets eget udtryk og tone.

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
| `--color-bg` | `#F6F3EE` | Varm off-white — "lærred" |
| `--color-text` | `#191713` | Varm næsten-sort |
| `--color-surface` | `#EFEAE2` | Sekundær overflade |
| `--color-mid` | `#6E6961` | Muted/sekundær tekst |
| `--color-bg-dark` | `#131110` | Mørk sektion (CTA-zone) |
| `--color-accent` | `#C8A97E` | "Burnished sand" — stille accent |
| `--accent-vibrant` | `#D4500F` | "Ember" — den markante accent |
| `--accent-deep` | `#A63B05` | Dyb ember/rust |
| Theme-color | `#F6F3EE` | (meta tag) |

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

- **Knapper/links:** `link-underline`-klasse (animated underline hover). CTA er `→` links, ikke fyldte knapper.
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

## Effekter & animationer

Ren CSS + vanilla JS (ingen framework). Kilde: `_sting_recon/css/style.css` (v4 "Ember") + `js/main.js`.

**@keyframes:**
- `marquee` — `translateX(0)` → `translateX(-50%)`, 50s linear infinite. Pauses on hover. Scroll-velocity driver `skewX(var(--skew))` via JS-loop (maks ±10°).
- `statusPulse` — grøn pulserende `box-shadow` på status-badge, 2.5s ease infinite.
- `ctaDrift` — CTA-sektion baggrundstekst "STING" drifter `translateX(0)` → `translateX(-3vw)`, 18s ease-in-out infinite alternate.
- `pageFadeIn` — body `opacity: 0` → `1`, 280ms ease-out on load.

**Transitions (CSS):**
- `.link-underline::before` (ember underline sweep): `scaleX(0→1)`, `transform-origin: right→left`, **450ms `cubic-bezier(0.22, 1, 0.36, 1)`**.
- `.nav__cta::before` (ink fill): `translateY(101%→0)`, **350ms** same easing.
- `.reveal` (scroll-reveal): `opacity + translateY(22px)`, **700ms `cubic-bezier(0.22, 1, 0.36, 1)`**.
- `.split-lines .line-in` (hero headline masked reveal): `translateY(110%→0)`, **1000ms** same easing. Delay 110ms/220ms på linje 2/3.
- `.work-card` lift: `translateY(-6px)`, **500ms** easing.
- `.work-card__image` shadow lift: `box-shadow` → `0 20px 48px rgba(...)`, 500ms.
- `.services__name` slide: `translateX(12px)`, 450ms.
- `.pipeline-step__body` accordion: `grid-template-rows: 0fr → 1fr`, **550ms**.
- `.cursor-ring` expand: width/height/margin, 320ms.
- `.founder__portrait` desaturate→color: `grayscale(100%→0%)`, 600ms.
- `.footer__logo span` bounce: `translateY(±6px)`, 450ms, staggered 40ms delays.
- `.nav` shrink on scroll: `padding` 350ms.
- Page transitions: JS sætter `body opacity: 0` på click, 160ms, navigate på 180ms.

**JS-drevne effekter:**
- Custom cursor: dot (7px ember) + lagging ring (34px, lerp 0.16). Udvider til 48px på links, 64px (fyldt ember + "View"-label) på work-billeder. Cursor-dot skalerer 2.2× ved mousedown.
- Magnetic pull: `.nav__cta, .form-submit, .filter-btn` — `translate(dx×0.28, dy×0.28)`, spring-snap på `mouseleave` via `cubic-bezier(0.22, 1, 0.36, 1)` 420ms.
- 3D tilt: work-billeder — `perspective(900px) rotateX/Y(±5deg)` + `radial-gradient` glare overlay via `--gx/--gy` CSS vars, 180ms ease-out.
- Hero mockup parallax: main rate `−0.045`, secondary `−0.085` (translateY via `el.style.translate`).
- Counter-animation: `easeOutExpo`, 1400ms.
- rAF loop: progress bar + nav condense + marquee skew + parallax — alle i én loop.

**Gradienter/blur:**
- `backdrop-filter: blur(12px)` på nav + mobile-CTA. Rgba 88% opacity.
- Hero `::before`: `radial-gradient` ember glow (rgba 14% opacity), `60vw` cirkel, øverst højre.
- CTA dark `::before`: `radial-gradient ellipse` ember glow `rgba(212,80,15,0.22)` fra bunden.
- Progress bar: `linear-gradient(90deg, #A63B05, #D4500F)`.
- Noise grain: `body::after` SVG-turbulence, opacity 0.04, fixed.
- `.tilt::after`: spotlight `radial-gradient` fra `--gx/--gy`, opacity 0 → 1 on hover.

## Typografi (detaljeret)

- **Display:** Cormorant Garamond — weights 300 (light italic) + 600 (semibold + semibold italic). Google Fonts `wght@0,300;0,600;1,300;1,600`. Bruges til: hero H1, section headings (hook, services, CTA), proof-card quotes, founders-note, stat-strip nums, hook-num (XL italic ghost), footer wordmark, page-header-titles.
- **Body:** DM Sans — weights 300 / 400 / 500. Google Fonts `wght@300;400;500`. Bruges til: brødtekst, nav-links, kickers, badges, labels, form-fields.
- **Mono:** DM Mono (ingen weight-variant specificeret — regulær 400). Bruges til: section-num counter (`01 /`, `02 /`...), url-bar i mockups, process-dashboard-labels, footer live-clocks, cursor-ring label, status-badge.
- **Hero H1 typografi:** `clamp(60px, 8vw, 112px)`, `font-weight: 600`, `line-height: 1.04`, `letter-spacing: -0.02em`. Italic `<em>` bruger weight 300 i ember-farve.
- **letter-spacing særtræk:** Nav-links + kickers: `letter-spacing: 0.04–0.12em` uppercase. Section-labels: `0.1em`. Mono-referencer: `0.12em`. Hero-headline: `−0.02em` (negativ tracking — markant). Aldrig negativ tracking på brødtekst.
- **Uppercase:** Nav-links, section-labels, kickers, stat-strip labels, service-arrows — konsekvent lille uppercase med spacing.
- **Fonthjerne:** Cormorant til alt "poetisk/grand"; DM Sans til alt "brugerflade/klar"; DM Mono til alt "præcist/teknisk". Tre separate semantiske lag.
