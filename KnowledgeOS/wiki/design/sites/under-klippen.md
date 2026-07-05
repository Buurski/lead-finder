---
title: Under Klippen — Restaurant i Holstebro
slug: under-klippen
kilde: https://under-klippen.vercel.app/
branche: mad / café / dansk
---

# Design — Under Klippen

Under Klippen er den lille danske café/restaurant med en sjæl, der er større end stedet. Designet bærer på en aftensstemning — Cormorant Garamond sætter den lyriske, poetiske tone, Outfit holder læsbarheden jordnær.

## Identitet

Et brunt, varmt univers. Ikke rustik hyggelig — mere stille, trofast og rodfæstet. Logo/navn er groft — det er intentionelt. Man er "under klippen" og forstår hvad det betyder.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display / overskrift | Cormorant Garamond (italic 300–500) |
| Brødtekst | Outfit (300–500) |

Overskrifter er lange og prosaiske: "En aften, der begynder før du sætter dig." Korte fakta-ledes undgås — sproget er det primære designelement.

## Palet

| Token | Hex | Karakter |
|-------|-----|---------|
| Primær baggrund | `#f5f0ea` | Cremet papir-hvid |
| Mørk base / ink | `#1a1208` | Dyb varm brun-sort |
| Accent | `#c8a87a` | Varm guld |
| Sekundær | `#e8e3db` | Lys creme |

Ingen kolde blå-toner. Paletten er udelukkende varm — cream, brun, sand, guld.

## Layout

- **Hero:** `img-tag` — ét stort foto på toppen, ingen CSS baggrundsbillede.
- **Nav:** Sticky/fixed — forbliver synlig under scroll.
- **Sektioner:** Ca. 10 sections, 3 articles. Generøst white space mellem dem.
- **CTA-knapper:** Ingen border-radius (skarpe kanter) — matcher den upolerede, ægte-håndværk-æstetik.

## Sektioner

1. Hero-foto + tagline (lang, poetisk)
2. "Fem måder at sætte sig ned på" — siddepladser/atmosfære
3. Råvare-pitch ("Dagsfriske fisk…")
4. Fortællingen om stedet ("Bogstaveligt talt under klippen")
5. Footer / kontakt

Ingen prisliste på forsiden. Fokus er oplevelse, ikke transaktioner.

## Tone

Dansk, langsomt, sensorisk. Sproget handler om at ankomme et sted — ikke om at bestille. Ingen "Book bord nu"-overload. Ét CTA, brugt med omhu.

## Anti-references

- Ingen menukort-dumping på forsiden
- Ingen generiske restaurant-clichéer (gaffel-ikon, "God mad i hyggelige omgivelser")
- Ingen kolde, kliniske farver
- Ingen kasser/badges/bullets på headeren

## Genbrug

Arketypen er den **poetiske café**. Passer til: hyggerestauranter, vinbarer, lokale kroer, natcaféer. Kombiner med Zaytoon for "mad"-branchen — Under Klippen er den danske pendant.

## Effekter & animationer

- **Hero-entry (`heroIn`):** `@keyframes heroIn { to { transform: translateY(0); opacity: 1; } }` — logo-badge entrerer fra `translateY(20px) opacity:0` over `1.2s cubic-bezier(0.33,1,0.68,1)` med `0.45s` delay; tagline følger med `0.9s` delay. Klassisk reveal-up med staggered entrance.
- **Scroll-reveal (`.reveal`):** IntersectionObserver-drevet — `opacity:0 → 1` + `translateY(20px) → 0` over `0.7s var(--ease)`. Stagger via `data-delay="1/2/3/4"` (0.08s pr. trin). Bruges på næsten alle sektioner.
- **Scroll-arrow (`scrollArrow`):** `@keyframes scrollArrow { 0% { opacity:0; translateY(-20px) } 40% { opacity:1 } 100% { opacity:0; translateY(20px) } }` — 2.4s uendelig loop. Subtil ned-pegende animation.
- **Parallax-hero:** `requestAnimationFrame`-loop i `site.js` — `.parallax-inner` forskydes på `scrollY` for hero-foto. Ingen lib, ren rAF.
- **Nav-drop-in:** Nav starter `opacity:0; transform:translateY(-12px)` → `is-loaded`-klasse tilføjes; `0.7s var(--ease)`. Skifter til dark-mode (rgba-baggrund) ved scroll ind i hero-sektionen.
- **Billedpar hover-zoom:** `.pair-frame:hover img { transform: scale(1.03) }` over `1.2s var(--ease)` — langsomt og roligt.
- **Ingen gradienter til dekorativt brug** udover radial-gradient i hero-left (subtil guldglød, `rgba(200,168,122,0.10)`), og `linear-gradient` overlay på hero-foto (top+bund-udtoning `rgba(26,18,8,0.18/0.42)`).
- **Backdrop-filter nav:** `blur(14px)` + sand-baggrund `rgba(240,237,232,0.92)` — frosted glass-effekt.
- **Ghost-knap pil:** `.btn-ghost .arrow` udvider fra `28px → 44px` bredde ved hover (`0.3s`), intet transform.
- Ingen GSAP, Framer Motion eller eksternt animationsbibliotek. Alt er native CSS + rAF.

## Typografi (detaljeret)

- **Display:** Cormorant Garamond · italic 300 (primær) / 400 / 500 · `letter-spacing: -0.005em` · `line-height: 1.02`
- **Body:** Outfit · 300 (light body) / 400 / 500 · `line-height: 1.65`
- **Eyebrow-labels:** Outfit 400 · `font-size: 11px` · `letter-spacing: 0.22em` · `text-transform: uppercase` · accent-guld farve
- **Nav-wordmark:** Cormorant Garamond 400 · `font-size: 18px` · `letter-spacing: 0.32em` · uppercase
- **Body-lg (intro):** Outfit 300 · `font-size: 18px` · `line-height: 1.7`
- **Caption:** Outfit 300 · `font-size: 12px` · `letter-spacing: 0.04em`
- Ingen tight negative letter-spacing på display — Cormorant trives med minimal kerning. Italic er primær display-stil, ikke sekundær accent.
- Footer-mark: Cormorant 300 · `letter-spacing: 0.18em` · `font-size: 28px`
