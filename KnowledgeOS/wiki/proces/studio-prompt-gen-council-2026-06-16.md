---
title: Studio prompt-gen — council log
date: 2026-06-16
type: proces
---

# Studio `/studio/prompt-gen` — council-log (3 runder)

Feature: agenticos genererer en komplet **Claude Code build-prompt** (recon +
branche-template + skills + scoping) for en kunde-demo, og **dispatcher** den til
en Claude Code-session (gratis på subscription) der bygger demoen. Orchestration
billig (API), build gratis (subscription).

**Hård kendsgerning:** `mcp__dispatch__start_code_task` findes IKKE i dette miljø,
ingen dispatch-tunnel i repo. Ægte programmatisk dispatch fra Vercel-route →
Claude Code er umulig. Realistisk dispatch: route persisterer prompt (KV+disk) +
returnerer den; build køres af en Claude Code-session (subagent eller menneske).
I E2E dispatcher orchestrator-sessionen (mig) build via Agent-tool = ægte dispatch.

---

## Runde 1 — arkitektur-kritik (2× Sonnet, parallelt)

**Konvergerede fund (begge agenter):**

| # | Sev | Fund | Beslutning |
|---|-----|------|-----------|
| 1 | HIGH | SHA-pinned GitHub raw-URLs til template = netværksafh. + staleness | **Inline template-JSON** i prompt (altid frisk). Behold pinned raw-URLs KUN til dybe kontekst-docs (CLAUDE.md, design-MD) som er for store at inline |
| 2 | HIGH | Token-størrelse (recon+template+skills 8-12k) | Strip `images[]` fra inline-recon, cap `headings[]`→10, trunkér `toneSample`→300 |
| 3 | HIGH | **Prompt-injection via scraped HTML** ind i `/bypass-permissions`-session | **Fence** recon som UNTRUSTED DATA + strip injection-mønstre. Non-negotiable |
| 4 | HIGH | Blast-radius af poisoned prompt (slet filer, læk .env, push main) | **Scope** build-session til `demo-sites/{slug}/` + forbyd `.env`/andre dirs |
| 5 | MED | Empty recon → generisk build i stilhed | Validér: hvis palette+headings tomme → afbryd m. fejl til UI |
| 6 | MED | Branch-mismatch → forkert template i stilhed | Throw hvis `templateBySlug(slug)` = null |
| 7 | MED | 24h TTL uden native KV EX | Envelope `{fetchedAt, data}`, tjek alder ved get |
| 8 | MED | "DISPATCH" misvisende uden tunnel | Behold knap (Lucas's ønske) men route = persist+return; UI viser prompt + copy |
| 9 | LOW | recon-full wrapper let over-engineered | Behold (mandat kræver fil) men hold tynd |

**Implementeret R1:** alle HIGH + MED. Inline template-JSON + pinned URLs til design-MD
(hybrid). Sanitering+fence i prompt-builder. Scoping-sektion. TTL-envelope. Auth-gate
på dispatch-build (Bearer vs `STUDIO_DISPATCH_SECRET||DEEP_RESEARCH_SECRET`, no-secret=allow lokalt).

## Runde 2 — implementations-kritik (2× Sonnet, læste faktisk kode)

| # | Sev | Fund | Status |
|---|-----|------|--------|
| R2a-1 | HIGH | `images[]`+`palette[]` gik UDEN om sanitize → fence-breakout via URL/hex m. newline | ✅ FIXED: sanitize image-URLs (https-only) + hex-filter palette |
| R2a-2/igNotes | HIGH | user-pasted `igNotes` usaniteret | ✅ FIXED: strip ```/=BEGIN/END i recon-full + cap 600 |
| R2a-3 | MED | slug→build-dir path-traversal | ✅ FIXED: hard assert `^[a-z0-9-]{1,60}$` i route |
| R2a-4 | MED | `templateBlock` inkl. antiReferences trods kommentar = token-bloat | ✅ FIXED: droppet fra JSON, nævnt som 1-linje |
| R2a-5 | MED | empty-recon-guard for slap (krævede ALLE tomme) | ✅ FIXED: kræver ≥2 signaler (palette/headings/tone/title/desc) |
| R2a-7 | LOW | auth-fallback til DEEP_RESEARCH_SECRET breder angrebsflade | ACCEPTERET: single-user, no-secret=lokal |
| R2b-1 | HIGH | mail-footer selvmodsigende (forbudt at læse .env men bedt maile) | ✅ FIXED: erstattet m. "rapportér til orchestrator, mail ikke selv" |
| R2b-2 | HIGH | farve-instruks for svag → generisk klon | ✅ FIXED: eksplicit map palette→`:root` CSS-vars FØR sektioner |
| R2b-3 | HIGH | café-recon mangler menu/åbningstider/anmeldelser | ✅ DELVIST: prompt beder build-session hente dem fra recon/Google (opfind ikke) |
| R2b-4 | MED | dispatch re-runner recon afkoblet fra UI | ACCEPTERET: route loader cache by slug |
| R2b-5 | MED | cache-key navn-only → kollision v. forskellig URL | NOTERET (single-user, lav risiko) |
| R2b-6 | LOW | canDispatch kræver ikke recon kørt | ACCEPTERET: route auto-recon + abort-guard |

Token-størrelse genereret prompt: ~4-6k tegn (godt under limit).

## Runde 3 — demo-kritik (Sonnet + Playwright)

E2E-lead: Guðrun's Goodies (islandsk café KBH, gudrunsgoodies.dk). Recon-full gav titel/desc (varm islandsk tone), 8 ægte billed-URLs (orange logo + menu-PNGs + FB-madfoto), menu-heading. Palette tom (Odoo, ingen inline hex) → orange brand udledt fra GG-logo. Prompt 6013 tegn, restaurant-template.

R3 fund + status:
- HIGH: samme madfoto 4× = AI-slop → FIXED (hero=FB-foto, about+galleri=distinkte menu-PNGs)
- MED: islandsk identitet kun navne-dyb → FIXED (Velkomin·Velkommen i hero)
- MED: ingen kontakt → FIXED (walk-in-note, ingen fake-nr)
- MED: hamburger CSS men ingen markup → ÅBEN (Fase B)
- MED: galleri har tomme felter → ÅBEN (Fase B)

Verificeret Playwright 1280px: hero stærk, menu 3 kort + sprog-toggles, about m. ægte menu-PNG, find-vej m. ca.-tider (ingen opfundne tal). Eneste console-fejl = favicon 404 (harmløs). Café-ægte, ikke generisk. Screenshot: gudruns-demo-full.jpeg.

## Fase B-D — overnight (6 E2E-demoer + produktions-lås)

**6 demoer bygget via pipelinen, alle live (privat Vercel):**
| Demo | Branche/template | Brand-kilde | Mobil Lighthouse |
|------|------------------|-------------|------------------|
| gudruns-goodies.vercel.app | café/restaurant | orange fra logo + islandsk (Velkomin) | perf 95 a11y 95 seo 100 |
| cafe-wilder.vercel.app | café/restaurant | cream/flaskegrøn bistro + egne fotos | perf 95 a11y 95 seo 100 |
| pipers-hus.vercel.app | café/restaurant | EGEN hex-palet (guld+grøn) + menu-kat. | perf 91 a11y 100 seo 100 |
| o-s-barbershop.vercel.app | barber/frisor | logo-crest → bone+navy+brass | perf 93 a11y 95 seo 100 |
| the-nail-studio.vercel.app | negle/hudpleje | rose #dd9696 + egne nail-fotos | perf 91 a11y 100 seo 100 |
| frisoer-alex.vercel.app | frisør/frisor | navy/bone/brass + ægte 9.8/462 + tlf | perf 90 a11y 95 seo 100 |

**Produktions-lås (Fase D):**
- Bagt perf/a11y-kit ind i prompt-template (weserv WebP, async fonts, preload-hero,
  WCAG-kontrast, width/height-match, lazy, heading-order) → alle demoer 90-95 mobil
  out-of-the-box uden ekstra optimerings-runde.
- WordPress-default-palette-filter i `customer-recon-full.ts` (Gutenberg-swatches som
  #f78da7/#cf2e2e/#2ea3f2 poisoned barber/nail/frisør-recon → filtreret ved kilden).
- `scripts/test_prompt_builder.mjs` (15 checks: sanitize-injektion, fence, scope,
  perf-kit, brand-inline) tilføjet til `test_all.mjs`. Hele suiten grøn.
- Brugerguide: [[studio-prompt-gen-brugerguide]].

**Lighthouse-læring (Guðrun's, before→after):** mobil perf 81→95, a11y 92→95,
LCP 4.1s→2.9s. Største løft: non-blocking Google Fonts (-1.9s) + weserv WebP-proxy
på remote-billeder (-500 KiB). best-practices kan ramme 92 hvis kundens egne remote-
billeder har skæve intrinsic-ratios (ægte kunde-site m. optimerede billeder undgår det).
