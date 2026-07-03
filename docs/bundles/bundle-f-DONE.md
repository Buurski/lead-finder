# Bundle F færdig: internt UI + buurski-identitet + integrationer + polish (2026-07-02)

Scope-klaring fra Lucas undervejs: Command Center er et INTERNT operatørværktøj
for Lucas + Charlie. Alt i denne bundle er derfor målrettet effektivitet og
konsistens, ikke kundepolish. Kundeflader er ikke rørt (på nær én
brand-kapitalisering i en onepager).

## Branches (pushet, IKKE merget)

- lead-system: `feat/bundle-f-ui-logo-2026-07-02` (baseret på bundle-e HEAD,
  indeholder derfor Bundle E's CC-trim). Vercel bygger preview automatisk ved
  push; find URL'en på Vercel-dashboardet under branch-navnet.
- buur-cms: `feat/bundle-f-ui-logo-2026-07-02` (baseret på bundle-b HEAD).
- bundle-c worktree: 2 nye commits på `feat/bundle-c-seo-tjek-2026-07-02`
  (reviews-blok + booking-links hører logisk til seo-tjek-funnelen).

## Del 1: internt CC-UI

- Fælles `WarnBanner`-komponent (lucide AlertTriangle) erstatter 4 duplikerede
  emoji-advarselskort (leads, clients, klient-detalje, approve).
- Empty states: Studio (pr. branche, med "+ Lav demo"-link), Goals.
- En primær CTA pr. flade: leadgen-scrape, messenger "Marker sendt" og
  EngineRunner-Preview (i bekræft-fasen) demoteret til sekundær.
- Global pause-banner i shellen: master-halt vises nu på ALLE sider (rider med
  på deck-summary, intet ekstra Sheets-kald), link til /review/halt.
- Mobil: leadtabellen scroller vandret i stedet for at klippe, approve-knapperne
  wrapper.
- Chat-hint kender igen /leadgen, /messenger og /goals (rutbare men ude af
  sidebar efter Bundle E-trim).

## Del 2: buurski (intern identitet)

- Mærket "naboerne": fyldt blok + tegnet kontur (de to brugere) + prik
  (agenten, arvet fra den gamle glødeprik). Signaturform: afrundet blok + prik.
- `docs/brand/BRAND.md` (4 farver, 2 fonte, regler) + logo-mark/wordmark/full
  SVG-varianter.
- `src/app/icon.svg` erstatter den gamle favicon.ico; sidebar viser mark +
  "buurski" med "Command Center" som undertitel; title-tag opdateret.
- Kun interne flader. buur-cms kundeflader har IKKE fået mærket.

## Del 3: integrationer (salgs-nytte foerst)

1. Google-anmeldelser i SEO-tjek-rapporten (bundle-c): samme Places-kald
   henter nu rating + antal; rapporten viser egne tal mod top-3-snittet, og
   et nyt plain-fix rammer virksomheder med et tydeligt anmeldelses-gab
   (inkl. small-town-trigger). 5 nye offline-checks.
2. Stripe-basis i buur-cms: checkout-session (master-auth) + signatur-
   verificeret webhook der opdaterer subscriptionStatus. Env-gated (mangler
   nøgle = 503, aldrig crash). Council-hærdet: atomisk rank-guard,
   idempotens efter succes, nodejs-runtime, incomplete regnes som canceled.
   Kendt begrænsning: en canceled kunde der gentegner kræver manuel
   status-nulstilling (planens "canceled vinder altid"-regel).
   Kraever env: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
   STRIPE_PRICE_ID_BASIS, APP_URL.
3. Cal.com/booking: `SEO_TJEK_BOOKING_URL` giver nu direkte booking-linje i
   baade day-0 og day-7 mailen (foer kun paa rapportsiden). Mailto-fallback
   uaendret. Saet env til et Cal.com-link naar kontoen findes.

## Del 4: bug-hunt + konsistens

- REEL BUG fundet og fixet: tone-mixerens lokation-opener blev valgt over alt
  undtagen achievement, saa review-volume/quote/tech-problem aldrig fyrede og
  batches lignede hinanden. Specifikke openers slaar nu lokation.
- Testsuite genoplivet: 5 suiter fejlede pga. stale forventninger mod bevidste
  aendringer (pickDemos-rename, fuldt-navn-signatur, signatur flyttet til
  send-tid). Alle 24 suiter groenne.
- Konsistens-audit paa tvaers af bundle A-E: priser stemmer overalt med kanon
  (web 5-15k, SEO 2.500+750/md, CMS 495-1.495), ingen interne navne laekket
  til kundeflader, ingen em-dashes i kundevendt salgstekst. Eneste fix:
  onepager-cms "cms" til "CMS". PDF'en er ikke regenereret, html er kilden.
- docs/sales/ (Bundle D-leverance) laa kun untracked paa disk og er nu
  committet paa denne branch.
- Bemærkning: Bundle E-sessionen kørte parallelt på samme branch i starten af
  natten; dens 3 commits (council A-fixes, ærlig leads-empty-state, en
  WarnBanner-variant) ligger i denne branch og er reviewet sammen med resten.

## Councils

4 councils kørt (Opus 4.8 + Sonnet 5 + Haiku 4.5, linserne upside/risici/
beskyt/wildcard). Vigtigste inkorporerede fund: pause-banner-idéen, Stripe
race/idempotens-fixes, favicon-kontrast ved 16 px, prik-placering i wordmark,
em-dash i fix-titel, small-town anmeldelses-trigger.

## Ikke gjort (bevidst)

- Ingen onboarding, ingen dekorative animationer (internt scope).
- buur-cms /master fik ikke buurski-mærket (kan tages naar CMS'et deployes).
- Wildcard-idéer parkeret: send-run replay-log i approve-kortet, preflight-
  tjekliste ved Send-knappen, confidence-prikker paa replies, kontekst-panel
  på tvaers af sider. Staar i council-transkripterne hvis de skal tages op.
