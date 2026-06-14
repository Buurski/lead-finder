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
