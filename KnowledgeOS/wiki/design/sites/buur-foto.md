---
title: Buur Foto — Bryllups- og portrætfotografi
slug: buur-foto
kilde: https://buurfoto.vercel.app/
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
| `--cream` | `#f3eee5` | Primær baggrund |
| `--cream-2` | `#ebe4d6` | Kortbaggrunde, sektioner |
| `--ink` | `#1c1814` | Primær tekst |
| `--ink-soft` | `#2b2520` | Sekundær tekst |
| `--muted` | `#6e655a` | Muted/captions |
| `--gold` | `#9a7e4a` | Accent — link-hover, detaljer |
| `--sand` | `#b8a787` | Borders, subtile linjer |

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

## Effekter & animationer

- **Ord-for-ord hero-reveal:** H1-titlen er opdelt i `.word`-spans med `opacity: 0; transform: translateY(22px)` — class `.in` tilføjes med staggered JS-delay. Easing: `cubic-bezier(.2,.7,.2,1)`, varighed `1.1s`. En blød, organisk opkomst.
- **Floating polaroid-frames:** Fire absolutt-positionerede `.float`-elementer med CSS `rotate(-7deg)` til `rotate(8deg)` — hvide baggrunde + bred padding-bund imiterer Polaroid-print. Hover: `transition: transform 1.2s cubic-bezier(.2,.7,.2,1)`. Mobile: `@keyframes peek-in` (opacity 0→1, `1.2s cubic-bezier(.2,.7,.2,1)`) med delays 0.35–0.65s, floats peeker ind fra hjørnerne.
- **Nav frosted-glass scroll:** `transition: background-color .4s ease, padding .4s ease`. På scroll: `backdrop-filter: blur(8px)` + cream-baggrund med 0.92 alpha.
- **Scroll-drip indicator:** `@keyframes drip` (scaleY 0→1→translateY 48px + opacity, `2.4s ease-in-out infinite`) på en gradient-linje nedad — peger brugeren videre.
- **Tile/service hover:** billeder har `transition: transform 1.4s cubic-bezier(.2,.7,.2,1), filter .8s ease`; `:hover img { transform: scale(1.05) }`. Caption-label fader ind: `opacity 0 → 1, transform translateY(8px) → 0, 0.5s ease`.
- **Nav link wipe-underline:** `::after` med `right: 100% → right: 0`, varighed `0.35s ease`.
- **Ingen lightbox/gallery JS** — billeder vises inline, ingen modal/fancybox.
- **Ingen framer-motion eller AOS** — alt er vanilla CSS transitions + en lille JS scroll-listener.
- Gradients: `linear-gradient(to bottom, var(--sand), transparent)` på drip-indikatoren. Ingen komplekse radiale gradienter.

## Typografi (detaljeret)

- Display: **Cormorant Garamond** wght `300, 400, 500, 600` + italic `300, 400, 500` · Body: **Inter** wght `300, 400, 500`
- H1 hero: `clamp(58px, 9.5vw, 158px)`, `font-weight: 300`, `line-height: 0.95`, `letter-spacing: -0.015em`
- Logo: Cormorant 500, `letter-spacing: 0.32em`, `text-transform: uppercase` — klassisk seriffet logo-monogram
- Eyebrows/labels: Inter, `font-size: 11px`, `letter-spacing: 0.34em`, uppercase — konsekvent brugt til sektions-kickers
- Navlinks: Inter, `11.5px`, `letter-spacing: 0.22em`, uppercase
- Brødtekst: Inter 300, `15px`, `line-height: 1.6`
- Italic-guld: H1 bruger `<em>` i guld (`var(--gold)`) til poesiske ord — signaturtræk
