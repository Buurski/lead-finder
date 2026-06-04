# NIGHT_BUILD_REPORT.md — Command Center v3

*Skrevet om natten 3.→4. juni 2026. Rolig, ærlig opsummering. Ingen mail er
sendt (guardrail), ingen produktions-data rørt, intet pushet til main.*

---

## Kort version

Jeg byggede **Fase A (Overblik)** helt færdig og tog et sikkert første hug af
**Fase B (Handlinger)**. Lead-systemet er nu pakket ind i et roligt command
center: venstre sidebar i tre grupper, en Mission Control-forside der svarer på
*"hvad kræver mig nu?"*, og alle SELF/AGENTS-skærme. Det føles lyst, varmt og
stille — ikke som et SaaS-dashboard.

Builden er grøn hele vejen. De offline-tests er grønne (134 checks, 22 nye til
det nye datalag). Jeg verificerede skærmene i en rigtig browser (desktop +
mobil) undervejs.

**Branchen hedder `command-center-v3`. Intet er pushet eller deployet.**

---

## Sådan ser du det

```bash
git checkout command-center-v3
npm install          # hvis nødvendigt
npm run build        # skal være grøn
npx next start -p 3000
# åbn http://localhost:3000  — luk serveren igen bagefter (Ctrl+C)
```

Uden Google-creds i miljøet viser forsiden en rolig amber-besked ("kunne ikke nå
Sheets") og kører videre på det køen ved lokalt. Med dine rigtige `.env.local`
fyldes tallene og "kræver dig"-listen af sig selv.

> Bemærk: jeg har bevidst **ikke** kørt motoren for alvor i nat (det ville
> skrive i din rigtige kø). Knappen findes — du trykker selv. Mere nedenfor.

---

## Hvad jeg byggede, fase for fase

### Fase A — Overblik (read-only) ✓ færdig

**Ny IA / skal:** venstre sidebar med tre grupper —
- **Workspace:** Mission Control, Leads, Godkendelse (med antal-badge), Klienter
- **Agents:** Claude (aktiv), Hermes (placeholder, "snart")
- **Self:** Goals, SEO, Studio, Journal, Memory, Build Guide

Topbar med lokal tid + dato og en **⌘K command palette** (skriv for at søge,
↑/↓/Enter/Esc). Nederst til højre en **Chat / Control Room**-widget der viser
hvad den kan "se" på skærmen lige nu. Sidebaren klapper sammen til en skuffe på
mobil.

**Mission Control (forsiden)** med fanerne **Today · Pipeline · Goals & Revenue
· Agents**:
- **Today:** "Morning Coffee · kræver dig nu" (svar, opkald i dag, varme leads,
  prioriteret), Godkendelses-kø (antal + top 3 inline), Dagens pipeline
  (motor-status), en rolig tal-stribe (nye leads · emails fundet · svar i dag ·
  vundet i ugen), og Pulse Check (kunder der skal følges op).
- **Pipeline:** fuld motor-status + "Kør motor"-handlingen (se Fase B).
- **Goals & Revenue:** 90-dages mål med progress-barer (det live signal er
  tyndt indtil vaulten er koblet på — det siger skærmen ærligt).
- **Agents:** status på Claude/Hermes, skills/motorer, og 7-bucket-dækning
  (Indtjening · Kunder · Kalender · Kommunikation · Opgaver · Møder · Viden).

**SELF-skærme:**
- **Studio:** modulært grid af demoerne med **live preview** (rigtige iframes),
  filtrér efter branche, åbn i ny fane.
- **Build Guide:** renderer selve planen (DASHBOARD_OVERHAUL_GOAL.md +
  COMMAND_CENTER_VISION.md) i en lille, afhængigheds-fri markdown-visning.
- **Goals / SEO / Journal / Memory / Hermes:** ærlige, strukturerede skeletter
  der navngiver hvilken fase der kobler deres live-data på (i stedet for at
  fake tal).

**Tynde read-routes (rene wrappers over libs der allerede virker):**
- `GET /api/deck/summary` — Mission Controls datamodel (Sheets + kø, offline-safe).
- `GET /api/replies` — read-only IMAP-triage gennem `reply.ts` (klassificerer +
  for-udkast, sender og skriver intet).

### Fase B — Handlinger (sikkert første hug) ✓ delvist

- `POST /api/engine/run` med to tilstande:
  - **preview** — kører hele PICK→DRAFT-loopet men **skriver intet**; viser hvad
    den *ville* lave.
  - **run** — fylder køen, men **kræver `confirm: true`** (ellers 412), så et
    fejlklik ikke kan røre din rigtige kø. Sender aldrig mail.
- **"Kør motor"-knappen** på Pipeline-fanen: preview → se listen → eksplicit
  *"Bekræft og fyld kø"* → toast. Med antal-vælger, loading/fejl-tilstande.
- Jeg lavede en lille, bagud-kompatibel `persist`-flag på `engine.ts` så
  preview kan køre uden at skrive. CLI'en opfører sig præcis som før.

Jeg verificerede: **preview skrev 0** (køen blev på 12), og **run uden confirm
gav 412**. Køen er urørt.

---

## Nye / ændrede filer (denne nat)

**Skal & navigation**
- `src/components/shell/` — AppShell, Sidebar, Topbar (i AppShell), Clock,
  CommandPalette, ChatDock, Icon, PageHeader, FaseNote, MarkdownLite
- `src/lib/nav-config.ts` — én kilde til sidebar + palette
- `src/app/layout.tsx` — bruger nu AppShell i stedet for den gamle Nav

**Mission Control**
- `src/app/page.tsx` — forsiden er nu Mission Control
- `src/components/mission/MissionControl.tsx`, `EngineRunner.tsx`
- `src/lib/deck.ts` — datamodellen bag forsiden (offline-safe)

**Routes**
- `src/app/api/deck/summary/route.ts`, `src/app/api/replies/route.ts`,
  `src/app/api/engine/run/route.ts`

**SELF / AGENTS-sider**
- `src/app/{leads,studio,build-guide,goals,seo,journal,memory,claude,hermes}/`
- `src/app/studio/StudioGrid.tsx`

**Data & tests**
- `src/lib/demos.ts` — `DEMO_CATALOG` til Studio
- `src/lib/engine.ts` — `persist`-flag
- `scripts/test_deck.mjs` + `scripts/test_all.mjs` (22 nye checks)

**Design-kontekst**
- `PRODUCT.md` (opdateret), `DESIGN.md` (ny — hele design-systemet dokumenteret)

---

## Hvad mangler / næste skridt

- **Resten af Fase B:** de øvrige skill-knapper (Find emails, Sync replies →
  triage-panel, Godkend "safe" drafts, Promovér svar → klient, Lav ny demo) og
  keyboard-triage (j/k/a/r/e) i /approve.
- **Replies-panel:** `GET /api/replies` er klar; den mangler en pæn UI-flade
  (inbox-view med klassificerings-badge + for-udkast).
- **Reskin af de gamle sider:** /approve, /clients og /followup-review virker og
  er på samme palette/fonte, men deres headers er ikke helt skåret ind i den nye
  stil endnu. Lavt hængende frugt.
- **Rollebaseret /login (Lucas vs Charlie):** ikke bygget endnu (Fase B).
- **Fase C:** vault-handshake (Buurski/KnowledgeOS), Gmail+Calendar live,
  AI-spend, Health Score, Dreaming-log, voice. Skærmene siger allerede hvor det
  lander.

---

## Beslutninger jeg har brug for fra dig

1. **Accent-farve:** jeg valgte den **rolige sage-grønne** (lå allerede i
   globals.css). Vil du hellere prøve **amber**? Det er ét token at skifte.
2. **Forsiden:** `/` er nu Mission Control, og leads-pipelinen flyttede til
   `/leads`. Giver det mening, eller vil du have leads som forside?
3. **Kør motoren for alvor?** Knappen står klar (preview → bekræft). Sig til, så
   kører jeg en rigtig batch næste gang vi sidder sammen — jeg gjorde det ikke
   uovervåget i nat med vilje.
4. **Planlægnings-md'erne** (AGENTIC_OS_ANALYSE_OG_PLAN.md, NOTEBOOKLM…,
   OBSIDIAN…, START_HER…) blev committet med ind. Vil du beholde dem i repoet
   eller skal de i `_archive/`?

---

## Guardrails — overholdt

✓ Kun commits på `command-center-v3` · intet push/merge/deploy til main
✓ Ingen mail sendt · ingen hemmeligheder i kode (kun env)
✓ Sheets-leads og kø-data urørt · cold-email stadig pauset · motor kun preview
✓ Samme stak (Next 16 / React 19) · ingen nye databaser
✓ Build grøn hele vejen · 134 offline-checks grønne

God morgen. Kig på `/` først — det er hele pointen.
