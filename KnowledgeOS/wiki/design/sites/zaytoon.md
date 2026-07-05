---
title: Zaytoon — Social Dining i Horsens
slug: zaytoon
kilde: https://zaytoon-six.vercel.app/
branche: restaurant / takeaway / mellemøstlig
---

# Design — Zaytoon

Zaytoon er varm, fyrig, og har en identitet der er hårdere at overse end de fleste restauranter. Grænsefladen er selvhostet — ingen Google Fonts — og paletten er sand + kul + guld: Middelhavet møder lavlyst kro.

## Typografi

Self-hosted via CSS-variabler (`--f-display`, `--f-body`, `--f-ui`). Google Fonts er fraværende; skriftsnit er bundlet. Stilen er robust og moderne — ingen lette serialer, mere displayskrift-karakter.

## Palet

| Token | Hex | Funktion |
|-------|-----|---------|
| Primær sand | `#d6ccad` | Varm mellemneutral base |
| Guld | `#e7ca93` | Accent på headere og highlights |
| Cream | `#f2e0c6` | Baggrundssektioner |
| Ink (mørk) | `#0a0808` | Brødtekst, nav |

Sand-kul-guld — mellemøstlige stuer og lamper. Intet koldt.

## Layout

- **Hero:** img-tag — foto i toppen, ingen CSS-bg-billede.
- **Nav:** Sticky. Tel-link til `+4522870066` synlig i header.
- **Sektioner:** 8 sections. Godt tempo i scroll-rækkefølgen.
- **Knapper:** `border-radius: 4px` — meget let afrundet, næsten kantet.

## Sektioner

1. Hero (foto + tagline: "Smagene fra Middelhavet & Mellemøsten")
2. Om Zaytoon — konceptforklaring
3. Menu-teaser ("Fra koldt til varmt")
4. Menu-link
5. Atmosfære/foto-grid
6. Kontakt + lokation

## Tone

Varm, inviterende, lidt festlig. Ikke eksklusiv — mere åben og lystfuld. Sproget siger "social dining": man deler, man nyder, man sidder længe.

## Anti-references

- Ikke kold "hygiejne-hvid" restaurantstil
- Ikke takeaway-skema med kun produktbilleder
- Intet neon/fastfood-look

## Genbrug

Arketypen er det **mellemøstlige eller internationale sociale spisested**. Bruges som pendantdemo til Under Klippen (dansk) — disse to dækker hele mad-spektret.

## Effekter & animationer

- **Scroll-reveal (`.reveal`):** IntersectionObserver-drevet — `opacity:0 → 1` + `translateY(20px) → 0` over `0.7s cubic-bezier(0.33,1,0.68,1)`. Stagger via `data-delay="1/2/3"` (0.08s / 0.16s / 0.24s). Identisk pattern som under-klippen.
- **Fade-only variant (`.reveal-fade`):** Kun `opacity:0 → 1` over `0.8s` — bruges på billeder inde i `overflow:hidden` containers, så translate-effekten ikke clippes.
- **Scroll-arrow (`scrollArrow`):** `@keyframes scrollArrow { 0% { opacity:0; translateY(-20px) } 40% { opacity:1 } 100% { opacity:0; translateY(20px) } }` — 2.4s uendelig loop. Identisk med under-klippen.
- **Parallax-hero:** `requestAnimationFrame`-loop i `main.js` — hero-video forskydes subtilt på `scrollY`. Bruges med autoplay-baggrundsvideo (muted loop, mp4).
- **Hero-video:** `<video autoplay muted loop playsinline>` som hero-baggrund (ikke foto) — eneste site i de 4 der bruger video hero.
- **Nav-drop-in:** `opacity:0; transform:translateY(-12px)` → `is-loaded`; `0.7s var(--ease)`. Logo-filter skifter `brightness(0) invert(1)` (sort→hvid) ved mørk nav, `0.5s`.
- **Billedpar / mezze-kort hover-zoom:** `transform: scale(1.03-1.04)` over `0.7s–1.2s var(--ease)`. Lavere skala end man forventer — meget diskret.
- **Lightbox:** Fade-in `opacity:0 → 1` over `0.3s`. Ingen slide.
- **Arabesque arch-mønster:** SVG-baseret `<pattern>` (arch-dark, arch-mezze, arch-pair) med `opacity: 0.045` — bruges som dekorativt overlaymønster på mørke sektioner. Statisk, ikke animeret.
- **Gradienter:** Hero-overlay `rgba(0,0,0,0.65)` (flad, ingen gradient). Desert-section: `linear-gradient(180deg, rgba(10,8,8,0.55) 0%, rgba(30,18,5,0.70) 50%, ...)`. Menu-card overlay: `linear-gradient(to top, rgba(5,10,9,0.9) → transparent 60%)`.
- **Ghost-pil-animation:** `.btn-ghost .arrow` udvides `28px → 44px` ved hover, `0.3s var(--ease)`. Identisk pattern.
- **Nav backdrop-filter:** `blur(22px) saturate(1.4)` på sand-nav — kraftigere blur end under-klippen.
- Ingen GSAP, Framer Motion. Ren CSS + IntersectionObserver + rAF.

## Typografi (detaljeret)

- **Display (headings):** Oswald · 400 (regular, primær) / 300 / 500 / 600 · `text-transform: uppercase` · `line-height: 1.05` · `font-size: clamp(48px, 7vw, 100px)` for h1
- **Body:** Poppins · 300 / 400 / 500 · `font-size: 18px` · `line-height: 1.7` (body-lg)
- **UI / labels:** Roboto · 300 / 400 / 500 · `font-size: 11–13px` · `letter-spacing: 0.06–0.22em` · uppercase for eyebrows
- **Hero-sub:** Oswald 300 · `font-size: clamp(24px, 3vw, 45px)` · `letter-spacing: 0.04em`
- **Eyebrow:** Roboto 500 · `font-size: 11px` · `letter-spacing: 0.22em` · `text-transform: uppercase` · accent-guld
- **Nav-drawer (mobil):** Oswald 400 · `font-size: 24px` · `letter-spacing: 0.06em`
- **Footer-brand:** Oswald 600 · `font-size: 28px` · `letter-spacing: 0.1em`
- Oswald dominerer visuelt — bold, kondenseret, meget uppercase. Kombinationen med blød Poppins body skaber en varm/stærk dualitet.
