---
title: Vestfjends VVS — Lokal VVS-mester i Skive
slug: vestfjends-vvs
kilde: https://vestfjends.vercel.app/
branche: service / lokal håndværk / VVS
---

# Design — Vestfjends VVS

Vestfjends er den lokale, folkelige pol i demo-biblioteket. Mens KT VVS signalerer teknisk autoritet, er Vestfjends noget mere menneskeligt: "Vi kender huset. Vi kender området." Designet understøtter dette med en ren og nøgtern tilgang — Barlow og Barlow Condensed, dark navy, intet fancy.

## Typografi

Self-hosted via Next.js font-system (`@font-face`) — ingen Google Fonts fetch:

| Rolle | Familie |
|-------|---------|
| Primær (display + UI) | Barlow Condensed |
| Brødtekst | Barlow |

Barlow Condensed er smal og kompakt — det er en font der gør sig på bilskilte og lokale firmaer. Det er ikke designerens font; det er håndværkerens font.

## Palet

| CSS-var | Hex | Funktion |
|---------|-----|---------|
| `--surface` | `#f4f7fb` | Lys, lettere blå-grå baggrund |
| `--text-primary` | `#0a121a` | Primær tekst — dyb kold sort |
| `--text-muted` | `#4b545c` | Muted / sekundær |
| Nav/mørk section | `#091c2d` | Marineblå mørke zoner |
| Mellemlaget | `#192a3b` | Sekundær mørk |
| Overfladelag | `#263443` | Kortbaggrunde, mørk mode |

Koldt navy + lys grå-hvid. Det er det mest neutrale og "traditionelle" farvesæt i biblioteket — hverken kreativt eller teknologisk, bare trofast og lokalt.

## Layout

- **Hero:** text-only (ingen hero-foto i CSS; ingen `<img>` i toppen af body-HTML).
- **Nav:** IKKE sticky — scrolles væk med siden. Den eneste site i biblioteket uden sticky nav.
- **Sektioner:** 4 sections, 6 articles. Det korteste, mest kompakte layout.
- **Knapper:** `border-radius: 0` — 100% skarpe kanter. Funktionelt, ikke dekorativt.
- **Tel:** `+4597547600` synlig.

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

## Effekter & animationer

- **Hero-enter stagger:** `.hero-enter > *` — `opacity: 0` → `translateY(24px)` → `translateY(0)`. Varighed `720ms`, easing `cubic-bezier(0.16, 1, 0.3, 1)` (spring-agtig). Delays: 60ms / 200ms / 360ms / 520ms / 640ms for hvert barn.
- **Scroll-reveal (moderne browsers):** `.reveal` — `animation-timeline: view()` + `animation-range: entry entry 38%`. Same 600ms spring-easing. Fallback: `.io-reveal` via IntersectionObserver — `opacity 550ms + transform 550ms cubic-bezier(0.16, 1, 0.3, 1)`, start-state `scale(0.93) translateY(18px)`.
- **Video-parallax:** `@keyframes video-parallax` — `translateY(0)` → `translateY(-14%)`, linear, via `animation-timeline: view()`.
- **Hover:** `hover:opacity-75/80/90/100` (Tailwind-klasser) — standard `0.15s ease` via `transition-opacity`. Ingen transform-lift, ingen box-shadow-effekt, ingen farve-ændring på hover. Fuldstændig flat hover-model.
- **Ingen:** `backdrop-filter`, `clip-path`, custom cursor, marquee, parallax på hero-mockups, counter-animation, 3D tilt.
- Samlet tone: **én bevægelsessprog** — en enkelt spring-kurve (`cubic-bezier(0.16, 1, 0.3, 1)`) brugt på alt. Statisk baseline, fade-up reveal. Intet animeret dekorativt element.

## Typografi (detaljeret)

- **Display / headings:** Barlow Condensed — weight 700 + 800. Stor, kompakt, smal. `letter-spacing: tracking-tighter (−0.05em)` på hero-overskrift. Uppercase på kickers.
- **Brødtekst:** Barlow — weight 400 / 500 / 600 / 700. Self-hosted via Next.js `@font-face`. `font-size: 1rem`, `line-height: 1.6`.
- **Ingen serif, ingen mono-accent.** Én fontfamilie med én kondenseret display-variant.
- **Headings line-height:** `1.15` (sat globalt på h1–h4). `text-wrap: balance`.
- **p:** `text-wrap: pretty`, `max-width: 68ch`.
- **Kicker-stil:** Uppercase + `tracking-widest (0.1em)`, lille skriftstørrelse (text-xs/sm), amber-farve.
