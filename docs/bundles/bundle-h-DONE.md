# Bundle H — Polish + fixes + verificering (2026-07-03)

Status: FÆRDIG — council-grøn, merget til main.

## Fase 0 — Bundle G merget

- `feat/bundle-g-nav-brand-fixes-2026-07-03` verificeret grøn (build, lint 0 fejl, alle test-suiter) og merget til main med `--no-ff` (2a007a5). Branch slettet lokalt + remote.
- Ingen regressions på main efter merge (test-suite grøn på merge-resultatet).

## Fase 1 — Kerne-fixes

1. **Gratis SEO-tjek i nav**: `/seo-tjek` tilføjet under SEO-gruppen (Bundle C-tragten var live uden nav-link). Dukker automatisk op i ⌘K-paletten via NAV_FLAT.
2. **SEO-gruppen ryddet**: Compare + Prompt-gen fjernet fra SEO (de hører under Studio og lå begge steder). SEO = Overblik + Gratis SEO-tjek.
3. **Neutral hilsen**: "God morgen, Lucas." → "God morgen." — Charlie bruger også Command Center.
4. **Mobil-audit** (Playwright 375x667 + 390x844, alle hovedsider):
   - `/approve`: 250px overflow — action-række wrapper nu, tab-pills scroller i egen container, identity-række fik minWidth 0.
   - `/leads`: 197px overflow — header/kort wrapper; table + detaljepanel (300px fast) stakker under 860px.
   - `/goals`: 6px overflow — grid `minmax(0,1fr)` så nowrap-chips ikke skubber kolonnen.
   - Efter fixes: 0 overflow på alle hovedsider ved begge viewports. Nav-drawer åbner/lukker/auto-lukker korrekt.
5. **Leadgen kørte ikke i dag — undersøgt**: `data/leadgen.json` i vaulten er sidst skrevet 2026-07-02 06:06 UTC — ingen kørsel 2026-07-03. Vault-push virker (daglig-brief + daily-messenger committed i dag), så det er IKKE AV-lock-problemet fra Bundle A der er vendt tilbage. Ingest-cronen og ruten er intakte; det er PRODUCEREN (Cowork-tasken daily-lead-gen) der ikke har kørt/pushet i dag. Skal tjekkes i Cowork-app'en — kan ikke ses herfra. Morgen-vitals viser korrekt "Lead-gen ikke kørt i dag" og linker nu direkte til /leadgen.
6. **Header-redesign Mission Control**: kun det essentielle — dagens 1-liner (X udkast venter · Y svar venter), NEXT-ACTION-knap (svar > udkast > find leads) og en Detaljer-toggle der folder Pipeline/Goals/Agents-fanerne ud. Faner, agenter og mål er ude af det umiddelbare synsfelt.

## Fase 2 — Verificering af natten

- Bundle A/C/E/F/G alle merget til main (git-historik) og prod svarer korrekt: `/seo-tjek` public 200, resten bag basic auth (401).
- Nav-model A verificeret i browser: dropdown-grupper, delte hrefs (ownerGroupFor), mobil-drawer.
- AgenticOS-rebrand konsistent: layout-title, sidebar-brand, BRAND.md ("buurski" findes kun som historisk note). Metadata-description rettet fra "Lucas's agentic OS" → "AgenticOS".
- Signatur-fix: senders/messenger/compose-tests grønne (39+27+11). stripSignature håndterer fulde navne, ingen dobbelt-signatur.
- Goals-widget og /goals-siden bruger samme /api/goals (samme vault-note) — synkrone.
- /welcome slettet; /claude + /hermes + /goals ligger under Værktøjer.
- Alle 8 cron-jobs i vercel.json har eksisterende routes. Prod-kørselslog kan ikke læses herfra (basic-auth-creds findes ikke lokalt) — men morgen-vitals på Mission Control viser status live.
- **SEO-tjek E2E på prod**: submit (vida-demo, buur.aigro) → ok, rapport-id genereret, dag-0-mail sendt (mailError null), rapport-side 200. FUND: reportUrl/mail-links pegede på per-deployment-URL (VERCEL_URL) i stedet for det stabile domæne — fikset (x-forwarded-host i submit; stabilt domæne-fallback i day-7-cronen).

## Fase 3 — Flere fund (to recon-agenter + egen walk)

Fikset:
- **7 døde one-shot admin-routes slettet** under /api/approve (back-to-edited, back-to-pending, back-to-pending-smart, fix-demo-pair, html-to-text, recompose, regenerate-poor): engangs-fixes fra juni, 0 callers, mutations-endpoints der lå åbne i prod.
- **2 døde komponenter slettet**: Nav.tsx (afløst af Sidebar), vault/VaultBrowser.tsx.
- **error.tsx + not-found.tsx**: appen havde INGEN error boundaries — en uncaught render-fejl gav Next.js' rå hvide skærm. Nu rolig dansk fallback med retry/hjem.
- **/approve renderer 30 kort ad gangen** ("Vis flere"-knap; tastatur-nav folder selv ud): før rendered alle 490 fulde brev-kort = 342 KB DOM-tekst; nu 21 KB.
- **Claude-chattens persona** antog brugeren var Lucas + havde stale sideliste — nu neutral operatør-formulering og nav-model A-listen.

Ikke fikset (bevidst): test-send's fake lead hedder "Lucas" (testdata, ikke UI); /review/halt er bevidst udenfor nav (linkes fra morgenmail).

## Ekstra polish-runde (x-endinger)

1. **approve-many bulk-action**: "Godkend alle" var 490 sekventielle POSTs (minutter) — nu én request, én kø-skrivning, Sheets-registrering best-effort i hold af 10. "Godkend valgte" samme vej.
2. **Søg + branchefilter på /approve**: 490 afventende var unavigérbare. Felt + dropdown + match-tæller.
3. **SeoTjekFunnel-kort på /seo**: tragtens tal (indsendt/rapporter/dag0/dag7/afmeldt) + seneste 5 indsendelser havde ingen intern flade. Skjuler sig selv når tom.
4. **Vitals-link**: stale lead-gen linker direkte til /leadgen.
5. **Tastatur-hint**: space=vælg manglede i hint-rækken.

## Council (4 linser: Sonnet 5 x2, Opus 4.8, Haiku 4.5)

**Linse A (upside) — implementeret:**
- `reject-many` bulk-action + "Afvis valgte"-knap (symmetri med godkend).
- "Vælg alle" → "Vælg filtrerede (N)" når søg/branchefilter er aktivt.
- Vitals-links for alle tre morgenkørsler, ikke kun lead-gen.
- Fravalgt: SeoTjekFunnel på Mission Control (imod "mindre er mere"-princippet fra header-redesignet).

**Linse B (risici, adversarial) — verificeret/håndteret:**
- Verificeret rent: pagination/focusIdx ingen off-by-one; keyboard a/r kan ikke ramme forkert draft ved filterskifte (pending-guard); slettede routes har 0 callers (inkl. scripts/ og gitignorede filer); error.tsx-CSS-vars OK.
- x-forwarded-host-spoofing på public submit: kun selv-targeting (mailen går til angriberens egen adresse) — accepteret; APP_URL vinder når sat.
- Fixet: spend-alert-tekst pegede på skjult Agents-fane.
- **Kendt begrænsning (MEDIUM, bevidst udskudt):** kø-skrivninger er last-write-wins uden lås. To operatører der handler samtidig kan overskrive hinandens ændring; bulk forlænger vinduet fra ms til sekunder. Præeksisterende mønster i queue.ts — en fil-lås/versionscheck er næste-bundle-arbejde, ikke et polish-fix.

**Linse C (hold-fast invarianter):**
1. Godkend/approve-many MARKERER kun — sender ALDRIG. Send er et separat lag.
2. "Vælg alle"/"Godkend alle" dækker hele den filtrerede liste — aldrig kun de 30 viste kort.
3. `sent` kan aldrig unapproves/ændres — man kan ikke un-sende en mail.
4. Én kø-skrivning + best-effort Sheets i hold: en Sheets-fejl må aldrig blokere godkendelsen.
5. Tastatur-nav folder selv pagination ud — "Vis flere" må aldrig blive en hård grænse for j/k-triage.

**Linse D (wild cards) — delvist implementeret, resten er næste-bundle-idéer:**
- Implementeret: bulk-godkend følger det aktive filter + confirm viser branche-miks (så en 100%-restaurant-batch opdages FØR bulk — jf. lead-targeting-præferencen).
- Idé til næste bundle: SEO-tjek-submitters er OPT-IN leads (de gav selv mail + samtykke, jf. §10) — de burde have deres egen varme bane i køen i stedet for at behandles som cold scrape-output. Tag dem med source og giv dem en anden tone/regelsæt.
- Idé: de 5 slettede repair-routes vidner om gentagen håndreparation af dårlige drafts — find grundårsagen i draft.ts/recompose-kvaliteten i stedet for at genopbygge reparations-UI senere.

## Self-review (Fable 5)

26 filer, +475/-993 (netto-sletning — rigtig retning for en polish-bundle). 6 commits, alle grønne: build, lint (0 fejl), tsc, alle offline test-suiter. Browser-verificeret på 1280/390/375: 0 overflow, filter-scoped bulk-labels korrekte, drawer + dropdown-nav OK. Ingen dinglende CSS-klasser eller imports efter sletningerne.

## Merge-status

Merget til main med `--no-ff`, feature-branch slettet lokalt + remote. Prod deployer automatisk via GitHub-integrationen.

## Preview

Prod: https://lead-finder-three-beta.vercel.app (basic auth; /seo-tjek er public).

## Åbne punkter til Lucas

1. **Cowork-tasken daily-lead-gen kørte ikke 2026-07-03** — feed'en i vaulten er fra 2026-07-02. Skal tjekkes i Cowork-app'en (kan ikke ses herfra). Vault-push virker, så det er ikke AV-lock-problemet.
2. **Sæt APP_URL i Vercel-env** til det stabile domæne — så er mail-links helt uafhængige af host-headers og fallbacks.
3. Køens last-write-wins ved to samtidige operatører (se linse B) — sig til hvis det skal løses nu.
