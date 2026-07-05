# Bundle G — Nav-model A + AgenticOS rebrand + fixes (2026-07-03)

Status: FÆRDIG (feature-branch, ikke merget)
Branch: `feat/bundle-g-nav-brand-fixes-2026-07-03`
Preview: (udfyldes efter push — Vercel bygger preview pr. branch via GitHub-integrationen)

## Kerne-mål

1. **Nav-model A** — dropdown-baseret sidebar med accordion (Godkendelse,
   Svar, Leads, SEO, Studio, Værktøjer + flade punkter Mission Control,
   Klienter, Indstillinger). `NAV_TREE` med `children[]` i nav-config.ts;
   `NAV_FLAT` (leaves, dedup pr. href) driver fortsat ⌘K-paletten med nye
   `paletteLabel`-disambigueringer ("SEO · Compare" vs "Studio · Compare").
   Gruppen med den aktive rute åbner selv; brugerens toggles bevares.
   Mobil: samme accordion i drawer. `/radar` er en coming-soon-side der
   peger på archive-branchen. Afvigelser fra spec: "Alle kanaler" droppet
   (ingen samlet side findes; /approve ER køen — et duplikat-link ville
   forvirre), SMS død (archive-branch), Messenger-indbakke peger på
   /messenger (svar-flowet bor der).

2. **Rebrand buurski → AgenticOS** — sidebar-navn, layout-title, BRAND.md
   (tokens/fonte uændret), SVG-titler + ordbillede-tekst i logo-wordmark/
   logo-full (viewBox justeret til det længere navn). Favicon (icon.svg)
   har ingen tekst — uændret. Ingen filer havde "buurski" i filnavnet, så
   ingen omdøbninger. Interne mails i koden havde ingen brand-signatur;
   fremadrettede system-mails (som denne bundles færdig-mail) signeres
   AgenticOS. Kunde-brands (Vida, seo-tjek "Buur Web") og GitHub-org-refs
   (Buurski/KnowledgeOS) er bevidst urørt.

3. **Signatur-fix** — root cause: draft.ts' LLM-prompt lovede "Signaturen
   tilføjes separat af pipeline", men pipelinen tilføjede den aldrig. Nu:
   post-generation injection (stripSignature + formatSignature(sender)
   .closing) så navnet altid matcher valgt afsender. senders.ts var
   allerede source of truth for navn/telefon/titel pr. afsender (ingen
   senders.json nødvendig). Messenger-patterns har ikke længere hardcoded
   "Mvh, Lucas" — buildMessengerDraft/validateMessengerDraft tager
   sender-param (default lucas, output uændret). voice-guide.md +
   engine-fallback beder ikke længere modellen signere. E2E verificeret:
   lucas → "Mvh, Lucas Buur", charlie → "Mvh, Charlie Nielsen".

4. **Goals** — GoalsClient var ALLEREDE fuldt wiret til POST /api/goals
   (toggle/add/remove, optimistisk UI). Nyt: MaalWidget på Mission Control
   (næste 5 ubookede mål fra vaulten, toggle direkte fra widget, link til
   /goals).

5. **/welcome slettet** — inkl. first-run-redirectet i proxy.ts
   (cc_welcomed-cookien). /claude og /hermes er tilgængelige via
   Værktøjer-dropdownen.

## Ekstra forbedringer (Fable 5-valg)

Implementeret (4):
- **Batch-godkend på /approve**: checkbokse på pending drafts + "Godkend
  valgte (N)" (sekventiel skrivning, samme mønster som bulk-approve-alle).
- **Globale keyboard-genveje + ?-overlay**: m/g/s/l quick-nav, ? viser
  oversigt (globalt + /approve-triage), Esc lukker. Guardet mod inputs.
- **Notifikations-klokke** i topbaren: ventende drafts + svar på tværs af
  kanaler, dropdown med direkte links. Samme data som sidebar-badges.
- **Breadcrumbs**: topbar-titlen er nu en sti på undersider
  ("Leads › vida › Messenger"), NAV-roden er klikbar.

Droppet (og hvorfor):
- Universal ⌘K-søgning over leads/klienter/threads: kræver ny søge-API på
  tværs af Sheets/KV — sprænger 30-min-cappen. God kandidat til Bundle H.
- Sender-switch i header: senderen vælges allerede pr. draft på /approve
  (chooseSender) — en global switch ville skjule per-draft-allokeringen
  (hybrid-balancen) og kunne give fejlsendinger.
- Focus mode: Esc er allerede optaget af palette/overlay, og sidebaren er
  130 px — lav gevinst.
- Dark mode: ingen theme-infra i CSS'en (faste oklch-tokens); reelt et
  design-projekt, ikke en 30-min-feature.
- Recent/pinned, Stripe-status, empty-state-pass: nice-to-have; Stripe
  hører til buur-cms-integrationen, empty states findes allerede (cc-empty)
  på de fleste flader.

## Council-fund inkorporeret

4-lens council (Opus 4.8 risici, Sonnet 5 upside + wildcard, Haiku 4.5
hold-fast). Fixet med det samme:

- **Delte hrefs (B1/B2):** Compare/Prompt-gen under både SEO og Studio
  auto-åbnede begge accordions og gav breadcrumb "SEO · Compare" på
  /studio/compare. Ny `ownerGroupFor()` i nav-config (gruppens egen
  href-prefix vinder) deles af sidebar og breadcrumbs. Verificeret via SSR:
  1 åben gruppe, "Studio · Compare".
- **Dobbelt-signatur (fundet selv, bekræftet af council C):** stripSignature
  dækkede kun fornavne, så formatSignature-closing ("Mvh, Lucas Buur") blev
  aldrig strippet og send-ruten dobbelt-signerede. Mønster udvidet + 3
  regressionstests.
- **B3:** m/g/s/l-navigation bailer når chat-docken er åben.
- **B5:** Bell-backdrop z-index løftet over ChatDock-FAB.
- **B6:** MaalWidget optimistisk toggle flipper kun første match (som
  serveren).
- **Lens A:** palette dedup pr. href+label (så "Svar · Messenger-indbakke"
  kan findes), Bell lukker på Esc, Space/x vælger fokuseret udkast til
  batch-godkend (+ linje i ?-overlayet), accordion-toggles overlever reload
  (localStorage). Shift-klik-range på checkbokse droppet (kompleksitet vs.
  "Vælg alle" + Space dækker behovet).
- **Lens D (wildcard, IKKE implementeret — til overvejelse):** (1) fold
  /replies ind i /approve som filter-tab (én beslutningsflade i stedet for
  to), (2) drop sidebaren helt og lad ⌘K være eneste navigation. Begge
  strider mod den eksplicit bestilte nav-model A, så de er kun noteret.
- **Lens C (hold fast):** NAV_TREE som eneste IA-kilde; alle signaturer
  gennem formatSignature; batch-valg forbliver client-only (persistering
  ville kunne dobbelt-sende); nye signatur-formater SKAL ind i
  stripSignature-mønstrene før de shippes.

## Bonus-bugfix

`/api/goals` toggle/remove fejlede med "fandt ikke det mål" på et lokalt
Windows-checkout af vaulten: CRLF-linjer matcher ikke CHECKBOX_RE (`.` kan
ikke matche `\r`). `toLines()` stripper nu `\r` før parse+edit. Prod (LF via
GitHub-API) var ikke ramt.

## Verifikation

- `npm run build`: clean (kun preexisting NFT-warning fra engine's fs-læs).
- `node scripts/test_all.mjs`: alle suiter grønne (inkl. 4 nye
  messenger-signatur-checks).
- `npm test` (node --test): 39 pass, 0 fail (inkl. 3 nye stripSignature-
  regressionstests).
- `npm run lint`: 0 errors (11 preexisting warnings urørt).
- Browser (Playwright mod `next start`): dropdowns folder ud/ind, badge
  flytter fra parent til barn ved udfoldning, ?-overlay åbner/lukker, `g`
  navigerer til /approve, breadcrumb "Godkendelse · Email", checkbokse +
  "Vælg alle" på /approve, MaalWidget viser 5 rigtige vault-mål og
  toggle-payload når API'et (write stopper lokalt kun på manglende
  GITHUB_TOKEN, som er sat i prod).
- E2E signatur: lucas → "Mvh, Lucas Buur", charlie → "Mvh, Charlie Nielsen".

## Filer

- src/lib/nav-config.ts, src/components/shell/{Sidebar,AppShell,
  CommandPalette,Icon,Bell,ShortcutsOverlay}.tsx, src/app/globals.css
- src/app/radar/page.tsx (ny), src/app/welcome/ (slettet), src/proxy.ts
- docs/brand/BRAND.md + logo-SVG'er, src/app/layout.tsx
- src/lib/{draft,engine,messenger/compose}.ts, src/lib/voice-guide.md,
  scripts/test_messenger.mjs
- src/components/mission/{MaalWidget.tsx (ny),MissionControl.tsx}
- src/app/approve/page.tsx (batch-godkend)
