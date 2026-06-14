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
