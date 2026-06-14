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
