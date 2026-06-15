---
title: Street-Cut — Barber i København
slug: street-cut
kilde: https://streetcut.vercel.app/
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
| `--bone` | `#EFE8DA` | Primær baggrund — varm "ubleget papir" |
| `--bone-deep` | `#E5DCC7` | Sekundære sektioner |
| `--ink` | `#142235` | Primær mørk — dyb navy ink |
| `--ink-deep` | `#0B1726` | Maximum kontrast tekst |
| `--ink-soft` | `#3E5878` | Muted / sekundær tekst |
| `--accent` | `#A37A4F` | Varm tan/brun accent |

Bone + navy + tan er en klassisk maskulin palet. Ingen røde eller skarpe farver — elegant og urban.

## Layout

- **Hero:** text + img kombineret. Primær overskrift over billede-elementer.
- **Nav:** Sticky.
- **Sektioner:** 5 sections, 5 articles. Kompakt og rytmisk.
- **Knapper:** Primær CTA har `border-radius: 1px` — næsten kantet, meget maskulint. Runde ikon-knapper er `50%`.

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

## Effekter & animationer

- **Hero tekst-reveal (reveal-line):** H1-ord er pakket i `.reveal-line > .inner` med `transform: translateY(115%); opacity: 0`. JS tilføjer class `.is-typed` efter load → `transition: transform 700ms var(--ease), opacity 700ms var(--ease)` (easing: `cubic-bezier(0.22, 1, 0.36, 1)` — den globale `--ease`). Staggered delay 120ms + 80ms per linje.
- **Hero image wipe:** To billeder (`#hero-image`, `#hero-image-2`) starter med et `::after`-overlay der dækker billedet (`transform: scaleX(1)`) og slides af: `transition: transform 1100ms var(--ease), delay 320ms` (primær) + `1000ms, delay 900ms` (inset-billede). Resultatet er en biografagtig reveal-wipe.
- **Hero parallax (JS rAF):** `getBoundingClientRect()` + `requestAnimationFrame` beregner scroll-progress og sætter `img.style.transform = 'translate3d(0, ${progress * -8}px, 0) scale(1.03)'` — meget subtil, max ~8px drift.
- **Magnetic CTAs:** Knapper responderer på musekursorens proximity (RADIUS-baseret) og translateX/Y sig mod markøren via rAF — unik detalje der giver liv til siden.
- **Fade-up (IntersectionObserver):** Elementer med `.fade-up` (`opacity: 0; transform: translateY(20px)`) observes og `.in` tilføjes — `transition: opacity 700ms, transform 700ms var(--ease)`.
- **Nav frosted-glass:** `blur(14px) saturate(140%)`, `background: rgba(239,232,218,.72)`, `transition: 400ms var(--ease)`.
- **Link wipe-underline:** `::after scaleX(0 → 1)`, `transform-origin: left`, `300ms var(--ease)`. Omvendt variant `.is-static`: wiper forsvinder ved hover.
- **Salon card hover:** `transition: transform 900ms, filter 900ms var(--ease)` → `scale(1.06)`.
- **`mix-blend-mode: difference`** på et element (kursortekst-effekt) — eneste site med blend mode.
- **Ingen lightbox** — billeder vises direkte, ingen modal.
- **Ingen framer-motion/AOS** — alt vanilla CSS + custom JS.

## Typografi (detaljeret)

- Display: **EB Garamond** wght `400, 500` + italic `400` · UI/Body: **Inter Tight** wght `400, 500`
- H1 hero: `clamp(64px, 11vw, 144px)`, `font-weight: 400`, `line-height: 0.94`, `letter-spacing: -0.024em`
- Underoverskrifter: Garamond, `letter-spacing: -0.018em` til `-0.028em` — konsekvent negativ tracking på serif display
- Eyebrows: Inter Tight, `11px`, `font-weight: 500`, `letter-spacing: 0.18em`, uppercase
- Brødtekst: Inter Tight 400, `17px`, `line-height: 1.5`
- CTA-knapper: Inter Tight 500, `13px`, `letter-spacing: 0.02em`
- Ingen italic-detaljer i krop — al kursiv er Garamond og udelukkende i display-roller
