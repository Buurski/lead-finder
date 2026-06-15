---
title: KT VVS — Autoriseret VVS-installatør i Herning
slug: kt-vvs
kilde: https://ktvvs.vercel.app/
branche: VVS / el / teknik
---

# Design — KT VVS

KT VVS er designet til at signalere autoritet og teknik, ikke hygge. Siden er den teknisk-professionelle pol i demo-biblioteket: mørk navy base, stål-blå midtertoner og en koral-accent der bryder den industrielle palet med et enkelt varmt signal. Bricolage Grotesque giver displaykraft; Geist og JetBrains Mono understreger den tekniske side.

## Typografi

| Rolle | Familie | Note |
|-------|---------|------|
| Display | Bricolage Grotesque (opsz 12–96, wght 400–800) | Stor, konstruktiv headline-kraft |
| UI / løbetekst | Geist (wght 300–700) | Ren, neutral tech-læsefont |
| Mono detaljer | JetBrains Mono (wght 400–600) | Bruges til reference-numre, specs |

Tre-font-system der siger "professionel infrastruktur" — ikke "lokal mand med van".

## Palet

| Token | Hex | Funktion |
|-------|-----|---------|
| Dyb navy | `#0a1626` | Primær mørk baggrund/ink |
| Navy | `#1a3a5c` | Sektionsbaggrunde |
| Stål blågrå | `#a9b4c1` | Sekundær tekst, borders |
| Mellemblå | `#7c8a9c` | Muted UI-elementer |
| Koral accent | `#ff8a7d` | Eneste varme farve — CTA + highlights |
| Lys overflade | `#eef2f6` | Lyse sektioner, kontrastkort |

Koral mod navy er en markant valg — det er præcis nok varme til at invitere uden at miste det tekniske udtryk.

## Layout

- **Hero:** img-tag — fotografi af autoriseret VVS-arbejde.
- **Nav:** Sticky. Tel `+4597124755` synlig.
- **Sektioner:** 8 sections, 13 articles — det tættest befolkede layout i demo-biblioteket. Meget indhold, godt rytme.
- **Knapper:** `4px` og `2px` radius — næsten skarpe. Teknisk, ikke blødt.

## Sektioner

1. Hero + "VVS i Herning siden 1963."
2. Ydelsepitch — "Vi bygger det rigtigt"
3. Seks fagområder (grid)
4. Referencer / cases
5. Hold / kontakt
6. Footer

## Tone

Saglig, kompetent, klar. Ingen bløde vendinger. "Autoriseret" bruges som kvalitetsmærke. Teksten skriver til boligejer der vil vide "kan I faktisk det her?" — ikke til dem der vil hygge.

## Anti-references

- Ikke varm og folkelig (det er Vestfjends' position)
- Ikke generisk blå-hvid VVS-klon
- Ingen emoji eller uformelle CTAs

## Genbrug

Arketypen er den **teknisk autoritative installatør**. Den hårde pol af håndværk-branchen. Bruges til autoriserede VVS, elektrikere, kloakmestre. Sæt mod Den Lille Maler for den mere personlige håndværksvariant.

## Effekter & animationer

- **Scroll-reveal (`.reveal`):** `opacity:0; transform:translateY(28px)` → `opacity:1; transform:none` over `0.9s cubic-bezier(0.2,0.7,0.2,1)` — langsommere og med en blødere "ease out back"-kurve end de andre tre sites (de bruger `0.7s cubic-bezier(0.33,1,0.68,1)`). Den tungeste reveal-easing i sættet.
- **Scroll-locked video-animation (`scrollanim`):** Den mest avancerede effekt på tværs af alle 4 sites. En pinned sektion (`position: sticky`) mapper `video.currentTime` til scroll-progress (JS, `scrollY`). Blueprint-SVG (tegning) fader til foto-lag til heatflow-gradient. Separate `opacity`-transitions på `.sa-svg .photo` og `.sa-svg .heatflow` — `0.15s linear`. Callout-tekst fader ind (`sa-callout`) når video når slutrammen.
- **Scroll-reveal fade-in for scrollanim-sektion:** Sektionen entrerer via `opacity:0; transform:translateY(18px)` → `0` over `1.4s cubic-bezier(0.2,0.7,0.2,1)` — den langsomste overgang i hele systemet.
- **Scroll-cue (`cue`):** `@keyframes cue { 0% { top:-50% } 60% { top:100% } 100% { top:100% } }` — et lysbånd løber ned langs en lodret bar `2.4s ease-in-out infinite`. Forskelligt fra de andres pilanimation.
- **Nav scroll-shrink:** Logoet krymper til `62%` ved scroll (`is-scrolled`-klasse) via `height: calc(var(--logo-h,64px) * 0.62)`, `0.45s cubic-bezier(0.2,0.7,0.2,1)`. Backdrop-filter aktiveres: `saturate(140%) blur(14px)`.
- **Pil i knapper:** `.btn:hover .arrow { transform: translateX(3px) }` — `0.25s`. Pilen rykker vandret frem.
- **Service hover:** `.svc:hover { background: var(--paper) }` + `.svc-media img { transform: scale(1.04) }` over `0.7s`. Pil-ikon rykker `translateX(4px)`. Minimal løft.
- **Referencer hover:** `.ref:hover { transform: translateY(-3px) }` over `0.3s`. Supportkort: `translateY(-2px)`.
- **Blueprint grid-baggrund:** `repeating-linear-gradient` krydsmønster (0.06 opacity navy-linjer) + `radial-gradient` rød og blå tonespot i scroll-anim-sektionen. Stærkt tech/tegning-udtryk.
- **Grøn live-dot (nav):** `box-shadow: 0 0 0 4px rgba(34,160,107,.18)` + grøn `#22a06b` prik ved telefonnummeret i nav. Pulserende ring-effekt via box-shadow (statisk, ingen animation).
- **Photo-tag badge:** `backdrop-filter: blur(6px)` på foto-labels — glasmorphism til tag-chips.
- Ingen GSAP, Framer Motion. Ren CSS + IntersectionObserver + `scrollY`-mapping i main.js.

## Typografi (detaljeret)

- **Display:** Bricolage Grotesque · opsz 12–96 · weight 600–700 · `letter-spacing: -0.025em` til `-0.045em` (tight negative) · `line-height: 0.95` for hero-h1 (ekstremt tæt) / `1.25` for sub-headings
- **UI / body:** Geist · 300 / 400 / 500 / 600 · `font-size: 16px` · `line-height: 1.55` — ren, neutral tech-font
- **Mono detaljer:** JetBrains Mono · 400 / 500 / 600 · bruges til kickers (`font-size: 12px`, `letter-spacing: 0.14–0.18em`, uppercase), frame-readout i scroll-anim, foto-tags, specs
- **Kicker-mønster:** JetBrains Mono + `::before { content:""; width:24px; height:1px; background:var(--ink) }` — en 24px vandrette streg præfikser alle kickers (linjestump + tekst = tech-signatur)
- **Hero h1:** Bricolage 700 · `line-height: 0.95` · `letter-spacing: -0.04em` — næsten blokeret tæt. Teksten "VVS i / Herning / siden / 1963." sættes som lodret stabel med rød "1963."
- **Statistik-tal:** Bricolage 600 · `letter-spacing: -0.02em` — store tal i hero-stats (63, 6, 50+, A)
- JetBrains Mono som UI-kicker er unik i biblioteket — ingen andre sites bruger monospace som synlig designelement. Det forstærker teknik/præcisions-identiteten markant.
