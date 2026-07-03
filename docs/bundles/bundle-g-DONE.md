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

(udfyldes efter council)

## Verifikation

(udfyldes: build, test-suiter, browser-check)

## Filer

- src/lib/nav-config.ts, src/components/shell/{Sidebar,AppShell,
  CommandPalette,Icon,Bell,ShortcutsOverlay}.tsx, src/app/globals.css
- src/app/radar/page.tsx (ny), src/app/welcome/ (slettet), src/proxy.ts
- docs/brand/BRAND.md + logo-SVG'er, src/app/layout.tsx
- src/lib/{draft,engine,messenger/compose}.ts, src/lib/voice-guide.md,
  scripts/test_messenger.mjs
- src/components/mission/{MaalWidget.tsx (ny),MissionControl.tsx}
- src/app/approve/page.tsx (batch-godkend)
