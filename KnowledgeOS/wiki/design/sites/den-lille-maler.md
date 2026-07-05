---
title: Den Lille Maler — Malerfirma i Esbjerg
slug: den-lille-maler
kilde: https://denlillemaler.vercel.app/
branche: maler / håndværk
---

# Design — Den Lille Maler

Den Lille Maler har en karakter, der er sjælden for håndværkssites: ægte personlighed. Det er ikke Allan's Malerfirma med et generisk blå logo. Her er rød accent, terracotta touch og en displayskrift med tyngde — Bricolage Grotesque. Siden signalerer stolthed-over-fagværk, ikke billigst-i-by.

## Typografi

| Rolle | Familie |
|-------|---------|
| Display (headlines) | Bricolage Grotesque (opsz 12–96, wght 400–800) |
| Serif-accent | Instrument Serif (italic) |
| Brødtekst | Manrope (wght 300–700) |

Tre skrifttyper — usædvanligt, og det virker. Bricolage Grotesque er ekspressiv og håndgjort; Instrument Serif løfter citater og underoverskrifter; Manrope holder løbeteksten klar.

## Palet

| Token | Hex | Karakter |
|-------|-----|---------|
| Baggrund | `#f4efe6` (theme-color) | Creme / lys lærred |
| Primær mørk | `#2a241c` | Dyb varm brun |
| Accent rød | `#c7311e` | Signalrød — farvekasse-analogi |
| Terracotta tone | `#f4b5a6` | Blød perso-salmon, dukker op gentagne gange |
| Dyb rød | `#9f2113` | Sekundær rød / hover |
| Marine accent | `#1e3a5f` | Brugt sparsomt til trust-signaler |

Rød er sjælden på håndværkssites — her bruges den bevidst som maling-reference. Terracotta-tonen er en signature.

## Layout

- **Hero:** img-tag — foto af konkret malerarbejde i toppen.
- **Nav:** Sticky. Tel-link `+4550519055`.
- **Sektioner:** 7 sections, 4 articles. God koncentration.
- **Knapper:** Blanding — `4px`, `18px`, `24px`, `999px` (pill). Primær CTA er pill-form.

## Sektioner

1. Hero + "Professionelt malerarbejde — ude og inde."
2. Ydelsegrid: fire specialer
3. Hold/personlig præsentation (Allan + team)
4. Arbejdsgalleri (fotos i fuld størrelse)
5. Kontakt

## Tone

Ærlig, konkret, lidt stolt — ikke arrogant. "Allan, to svende, en lærling — og en pensel der ikke giver op." Teksten skriver til folk der vil have det gjort rigtigt, ikke til laveste pris.

## Anti-references

- Ingen generiske VVS-blå farver
- Ingen tjeklistedesign ("✓ Hurtig levering ✓ Garanti")
- Ikke tryg og kedelig — ét tørt fotografi af manden bag firmaet, ingen stock

## Genbrug

Arketypen er den **håndstolte håndværksmester**. Bruges til malere, tømrere, murere, snedkere. Sæt mod ktvvs for den teknisk-tunge håndværksvariant (VVS/el).

## Effekter & animationer

- **Scroll-reveal (`revealIn` / `.io-pending`):** IntersectionObserver-drevet. `@keyframes revealIn { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:none; } }` — lidt kraftigere translateY end de andre (24px vs 20–28px). Animationen er CSS-keyframe, ikke CSS-transition.
- **Marquee-strip (`marq`):** `@keyframes marq { to { transform: translateX(-50%); } }` — `40s linear infinite`. Servicebeskrivelser løber vandret: "Indvendigt malerarbejde ✦ Facademaling ✦ Tapetsering ✦ …". Annenhver `<span>` er rød accent-farve.
- **Stempel-rotation (`spin`):** `@keyframes spin { to { transform: rotate(360deg); } }` — cirkulær SVG-tekst roterer `30s linear infinite` i hero. Signatur-detalje: "BØRSEN GAZELLE 2023 · DANSKE MALERMESTRE" løber rundt om et est.-mærke.
- **Hover-lift (knapper):** `.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(199,49,30,.32); }` — `0.2s ease`. Rød CTA-knap hæves 1px og skyggen intensiveres.
- **Service-kort hover:** `.svc:hover { transform: translateY(-4px); box-shadow: var(--shadow); border-color: var(--line-strong); }` — `0.35s ease`. Kortene løfter sig 4px.
- **Billede hover-zoom:** `.hero-photo:hover img { transform: scale(1.04) }` — `1.2s ease`. Lang, blød zoom.
- **Header scroll-reveal:** Nav vises via `backdrop-filter: saturate(120%) blur(12px)` + `scrolled`-klasse efter scroll.
- **Radiale baggrunds-gradienter (hero):** `radial-gradient(1100px 600px at 90% -10%, rgba(30,58,95,.06), transparent 60%)` + `radial-gradient(800px 500px at -10% 30%, rgba(199,49,30,.05), transparent 60%)` — subtile tone-buer i hero-baggrunden (blå øverst-højre, rød venstre).
- **clip-path:** Bruges på en dekorativ hero-detalje: `clip-path: polygon(0 0, 100% 0, 100% 36%, 40% 36%, 40% 100%, 0 100%, 0 64%, 40% 64%)` — ligner et C-formet slot. Statisk.
- **`pulse2` keyframe:** `@keyframes pulse2 { 50% { opacity:.3; } }` — bruges på en pulserende badge/indikator. 2-step fade.
- Ingen GSAP, Framer Motion. Ren CSS + IntersectionObserver + rAF.

## Typografi (detaljeret)

- **Display:** Bricolage Grotesque · opsz 12–96 · weight 600–800 (overskrifter) / 500 (marquee) · `letter-spacing: -0.03em` til `-0.08em` (negativ, tight) · `line-height: ~1.1`
- **Serif-accent:** Instrument Serif · italic 400 · bruges til `<em>`-accenter i overskrifter ("og laver godt.") og SVG-stempel ("est.") · `letter-spacing: -0.01em`
- **Body:** Manrope · 300 / 400 / 500 / 600 · `font-size: 17px` · `line-height: 1.55`
- **Eyebrow / kicker:** Bricolage Grotesque 600 · `letter-spacing: 0.12–0.20em` · `text-transform: uppercase` — markant kontrast til display-headlinens negative spacing
- **Hero-knap:** Bricolage Grotesque 700 · `font-size: 28px` (telefonnummer-display) — behandles som typografisk element
- **Trust-numre:** Bricolage Grotesque 800 · `letter-spacing: -0.04em` — den tungeste weight
- Den stærke negative letter-spacing (-0.04em til -0.08em) ved store vægte er designets mest markante typografiske særtræk — tæt, ekspressiv headline-sætning.
