---
title: Studio + Demo-factory
updated: 2026-06-15
type: os
---

# Studio + Demo-factory

Studio er det interne værksted hvor vi bygger skræddersyede demo-hjemmesider til leads — ét klik fra `/studio/new`, og en fuld HTML-side er klar til at vise kunden.

## Hvad virker nu (pr. 2026-06-15)

Tidligere havde byggede demoer ingen URL — `/_assets/`-stien manglede en route, så alt endte i 404. Det er fikset:

- `/demo/[slug]` server demoer direkte fra den interne asset-store.
- `/api/studio/list` returnerer alle byggede demoer med metadata.
- `store.listAssets()` driver listningen i backend.
- Demo-factory returnerer en `/demo/{slug}`-URL når byggeriet er færdigt.
- **StudioGrid** viser nu en "Byggede demoer"-sektion — så man kan se og åbne alle eksisterende demoer direkte.

Hele flowet virker end-to-end: recon → byg → vis → oplistet.

---

## De 6 layout-arketyper

`composeHtml` er splittet i seks arketyper, en per branche-familie. Hver arketype speiler et rigtigt deployet site — ikke en generisk skabelon.

| Arketype | Branche | Mirrorer |
|----------|---------|---------|
| `gallery` | Foto / kreativ | **Buur Foto** |
| `service` | VVS / håndværk / service | **KT VVS** + **Vestfjends VVS** |
| `menu` | Restaurant / café | **Under Klippen** + **Zaytoon** |
| `booking` | Frisør / salon / negle | **Street Cut** + **Salon Artec** |
| `clinic` | Hudpleje / klinik / spa | **Vida Skønhedsklinik** + **Sting Studio** |
| `authority` | Advokat / revisor / rådgiver | **Midtadvokaterne** |

Arketype bestemmes automatisk ud fra branche-tagget på leadet.

---

## Animations- og effektkittet

Alle demoer deler et fælles motion-kit injected i `<head>`:

- **Scroll-reveal** via `IntersectionObserver` — sektioner fadder ind med `opacity:0 → 1` + `translateY(20px) → 0`.
- **Frosted nav** — `backdrop-filter: blur(14px)` med semi-transparent baggrund.
- **Slow hover-zoom** — billeder zoomer stille til `scale(1.04)` ved hover.
- **Hover-lift** — kort-elementer løftes `translateY(-4px)` ved hover.
- **CTA arrow-nudge** — knappens pil bevæger sig `translateX(4px)` ved hover.
- Fælles `--ease: cubic-bezier(.2,.7,.2,1)` variabel bruges overalt.
- **Reduced-motion guard** inkluderet — `@media (prefers-reduced-motion)` slår alle transforms fra.

### Per-arketype motion-budget

| Arketype | Budget | Særlige effekter |
|----------|--------|-----------------|
| `booking` (salon) | Cinematisk | Art-deco frame, polaroid-reveal, word-reveal |
| `clinic` | Cinematisk | Ken Burns gallery, parallax-hero |
| `gallery` (foto) | Cinematisk | Ken Burns, fullscreen-overlay |
| `service` (vvs) | Tech-glass | Frosted cards, subtle grid-overlay |
| `menu` (restaurant) | Poetisk | Staggered entrance, scroll-arrow |
| `authority` (advokat) | Tilbageholdt | Fade-only, ingen transforms på copy |

Advokat og service-brancherne bruger minimal motion — gravitas og troværdighed går forud for wow-effekter.

---

## Hvad gør hver demo unik

Kittet er delt polish — men det er kundens egne data der giver personlighed:

- `recon.images` → fylder galleries og hero med kundens egne billeder (fra Facebook/site).
- `recon.palette` → accent-farven er kundens, ikke vores.
- `recon.toneSample` → copy-sproget afspejler kundens egne ord.

**Hold den løs via recon.** To demoer i samme arketype må aldrig se ens ud.

---

## Designdokumenter

Per-site design MDs lever i `KnowledgeOS/wiki/design/sites/`:

| Fil | Site |
|-----|------|
| `under-klippen.md` | Restaurant — poetisk café |
| `zaytoon.md` | Restaurant — mellemøstlig moderne |
| `buur-foto.md` | Fotograf — editorial/minimal |
| `kt-vvs.md` | VVS — tech-professionel |
| `vestfjends-vvs.md` | VVS — lokal/kompetent |
| `street-cut.md` | Frisør — urban/bold |
| `salon-artec.md` | Salon — feminin/warm |
| `vida-skoenhedsklinik.md` | Hudpleie/klinik — luxe/rolig |
| `sting-studio.md` | Tattoo/studio — mørk/art |
| `midtadvokaterne.md` | Advokat — autoritet/klassisk |
| `den-lille-maler.md` | Håndværk — lokal/personlig |

Hver fil har: identitet, typografi, palet (hex), layout, sektioner, tone, anti-references, genbrug, effekter & animationer, typografi (detaljeret).

Til nye sites: brug `KnowledgeOS/wiki/design/_skabelon.md` som udgangspunkt.

Branche-level designfiler (`wiki/design/design-*.md`) dokumenterer hex-palet + layout-arketype per branche og bruges som reference når vi pitcher til nye leads.

---

## Se også

- [[buur-cms]] — kundernes egne sites bruger samme arketype-tænkning; genbrug mønstre men aldrig delt deploy.
- `src/lib/studio/` — kildekoden til demo-factory og asset-store.
- `/studio/new` — UI til at bygge en demo (recon → preview → gem).
- `/studio` — oversigt over alle byggede demoer (StudioGrid).
