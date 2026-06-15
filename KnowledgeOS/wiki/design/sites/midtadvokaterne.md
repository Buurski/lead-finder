---
title: MidtAdvokaterne — Advokater i Ikast siden 1964
slug: midtadvokaterne
kilde: https://midtadvokaterne-dttc.vercel.app/
branche: advokat / juridisk
---

# Design — MidtAdvokaterne

Kilde: live site `https://midtadvokaterne-dttc.vercel.app/` + lokal designbrief (`LawyerSite/MidtAdvokaterne_Website_Brief.md`). MidtAdvokaterne er rodfæstede i Ikast siden 1964 — og designet bærer dette. Det er den mest autoritetstunge side i demo-biblioteket: serif-overskrifter, guld-accent, varm off-white baggrund.

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
| Primær — dyb navy | `#1A2B45` | Trust, stabilitet — primær baggrund/ink |
| Alternativ — skovgrøn | `#1E3A2F` | Trust og langtidighed |
| Accent | `#C4973A` | Varm rav/antik guld — buttons, hover |
| Baggrund | `#F7F4EF` | Varm off-white — "kvalitetspapir" |
| Tekst | `#1C1C1C` | Næsten-sort charcoal, aldrig ren sort |

Paletten signalerer ro, tradition og troværdighed. Guld-accenten binder gammelt og varmt.

## Layout (7 sektioner fra designbriefen)

- **Hero:** bg-image (fuld viewport) — billede af Sieferts Plads 5 med Ken Burns slow-zoom. Mørkt overlay. Overskrift fader ind: *"Erfarne advokater i hjertet af Ikast. Siden 1964."*
- **Nav:** Transparent over hero → solid ved scroll. Sticky.
- **Knapper:** To i hero — primær (guld/amber baggrund, navy tekst), sekundær (outlined hvid). Subtil hover-animation (`200ms scale`).

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

## Effekter & animationer

Kilde: lokal `LawyerSite/` (Next.js + Framer Motion via `motion/react`). Live-site kan være placeholder; kildekoden er autoritativ.

- **Hero entrance (on mount):** `motion.p/span` — `opacity: 0, y: 24` → `opacity: 1, y: 0`. Varighed 600–650ms, `ease: "easeOut"`. Stagger via `delay`: 0ms / 100ms / 220ms / 400ms / 550ms. Scroll-indikator (`animate-bounce`) — Tailwind bounce på ned-pil SVG.
- **Ken Burns (hero baggrundsbillede):** `@keyframes kenBurns` — `scale(1) translate(0,0)` → `scale(1.08) translate(-2%, -1%)` → tilbage. Varighed **14s**, `ease-in-out infinite`. Kun på compositor-thread (`transform`).
- **whileInView scroll-reveal:** Alle sektionsoverskrifter + `.pop-up`-teamkort — `opacity: 0, y: 24` → `opacity: 1, y: 0`. 500ms `easeOut`. `viewport: once: true`.
- **Team card stagger:** `staggerChildren: 0.12s`. Hvert kort: `y: 32` → `0`, 500ms easeOut.
- **pop-up (globals.css):** `@keyframes popUp` — `opacity:0, translateY(80px) scale(0.97)` → `opacity:1, translateY(0) scale(1)`. Varighed **1.1s**, `cubic-bezier(0.16, 1, 0.3, 1)` (spring). Delay 0.4s.
- **BuildingSection parallax:** `useScroll` + `useTransform` — billedet bevæger sig `y: [60px, -60px]` mens sektionen scrolles igennem. Overlay-opacity fader fra `0.75 → 0.45`. Subtil `scale: [1.04, 1]` ved entry.
- **Hover (teamkort):** `grayscale(100%) → grayscale(0%)`, `transition-[filter] duration-300`. Ingen transform-lift.
- **Hover (knapper):** `hover:bg-amber/90 transition-colors` — 150ms. Ingen skala-ændring.
- **Testimonial-sektion:** Intentionelt statisk — ingen animation (design-beslutning: ro og ro).
- **Ingen:** marquee, 3D tilt, custom cursor, counter-animation, clip-path.
- Samlet tone: **bevægelse som respekt-signal** — lidt langsommere end gennemsnittet (600–1100ms vs typiske 300ms). Spring-kurven bruges sparsomt. Stilhed i testimonial er bevidst.

## Typografi (detaljeret)

- **Display + body + alt (ét font):** Plus Jakarta Sans — weights 300 / 400 / 500 / 600 / 700 / 800. Indlæst via `next/font/google`, CSS-variabel `--font-jakarta`. Ingen serif, ingen mono.
- **CSS-theme (globals.css):** `--font-heading` og `--font-body` peger begge på `var(--font-jakarta)` — det er altså én font der løfter begge roller. Designbriefen nævner Playfair/Cormorant som alternativ; implementeringen valgte Plus Jakarta Sans til begge.
- **Hero H1:** `font-light (300)` på "Juridisk" + `font-bold (700)` på "rådgivning." — to linjer, forskellig vægt, `clamp(3.2rem, 7vw, 5.75rem)`, `leading-none`.
- **Sektionsoverskrifter:** `text-3xl md:text-5xl`, font-heading (Jakarta), `text-navy`.
- **Kickers:** `text-xs uppercase tracking-[0.2em] text-amber` — 10px, stor spacing, amber-farve.
- **Brødtekst:** `text-base font-light text-white/65` i hero; `text-lg text-text/80 leading-relaxed` i body-sektioner.
- **Skillelinje:** `w-16 h-px bg-amber mx-auto` — dekorativ amber-linje mellem kicker og overskrift. Signaturmove.
- **Testimonial-citat:** `font-heading text-7xl text-amber` på åbningscitationstegn (dekorativt); `text-2xl md:text-3xl text-off-white leading-relaxed` på tekst.
- **letter-spacing særtræk:** Ingen negativ tracking på overskrifter. Kickers har `tracking-[0.2–0.38em]` — meget åbent. Brødtekst: standard.
