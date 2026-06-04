# PLAN — 2026-06-04 (Command Center v3, Del 2)

**Status:** byg-kontrakt for dagens autonome kørsel. Læs hele filen + `DASHBOARD_OVERHAUL_GOAL.md`,
`COMMAND_CENTER_VISION.md`, `NIGHT_BUILD_REPORT.md`, `DESIGN.md`, `PRODUCT.md` og
`KnowledgeOS/claude.md` + `KnowledgeOS/soul.md` FØR du begynder. De er kontrakten.

**Branch:** fortsæt på `command-center-v3`. Aldrig push/merge til main. Kommentér pænt
per commit. Mellem hvert block: `npm run build` skal være grøn, `npm run lint` skal være
grøn, eksisterende 134+ checks skal stadig være grønne. Hvis noget brækker → fix det FØR
næste block.

---

## Lucas' og virksomhedens kerne (læs `KnowledgeOS/soul.md` for den fulde version)

- **Lucas + Charlie** = virksomheden. Charlie er ikke-teknisk endnu, lærer det. **Samme rolle = samme adgang.**
- **Produkt:** ekstraordinære **kodede** hjemmesider (ikke WordPress) til lokale danske
  virksomheder. Vægt på SEO + AI-søgnings-optimering. Kunden ejer 100 % af koden.
- **Tone:** ydmyg, varm, jordnær. Aldrig corporate. "Det er bare mig, til en fair pris."
- **Mission Control = forsiden.** Outreach er kun ét ben — også: byg demoer hurtigt,
  klient-pipeline, drift, content, daglig brief, lære over tid.

---

## Blocks (12 stk — gør i denne rækkefølge, commit pr. block, byg grøn løbende)

### Block 1 — Fase B-rest (færdiggør outreach-loopet)
- `/approve`: tilføj keyboard-triage `a` (godkend) / `r` (skip) / `e` (rediger inline) på næste-i-køen.
  Bulk-approve "safe" drafts (knap viser N, kræver bekræft). Inline edit-modal til subject + body.
- `/replies` → handling wired: `POST /api/replies/[id]/send-reply` der kalder
  `datalayer.registerReplyOutcome` (send via Gmail-MCP-kald — men ÉN slags: testmail til
  `buur.aigro@gmail.com` for QA, ikke til klient endnu; flag for "live send" gemmes til Lucas
  selv trykker). Status flippes i Sheets.
- Find emails-knap i Mission Control: kører `email-finder.ts` på næste 100 leads, viser resultat.
- Smoke-test: enable hver knap, valider at den IKKE sender til andet end buur.aigro.

### Block 2 — Demo-factory
- Branch-design templates i ny mappe `KnowledgeOS/wiki/design/`: `design-frisør.md`,
  `design-restaurant.md`, `design-vvs.md`, `design-salon.md`, `design-hudpleje.md`,
  `design-foto.md`, `design-advokat.md`. Hver indeholder: typografi-forslag, palet, sektion-rækkefølge,
  inspiration, anti-references. Korte og atomare.
- Ny `src/lib/customer-recon.ts`:
  - input: website-URL eller FB/IG-handle
  - henter logo (favicon, OG-image), farve-palette (mest brugte fra hero-screenshot),
    overskrifter, billeder, tone-of-voice (kort tekst-uddrag)
  - gemmer i `client-assets/{slug}/`
  - bruger Apify hvis `ENABLE_APIFY=1`; ellers Chrome-UA + jina fallback
- Ny `src/lib/demo-factory.ts`:
  - input: branche-slug + kunde-slug + recon-resultat
  - kombinerer branche-template + kunde-recon → personaliseret `design.md`
  - bygger statisk HTML-demo (eller Next.js side) ud fra design.md
  - returnerer både design.md og demo-URL
- Ny side `/studio/new`: form (branche, kunde-navn, URL), preview af recon, knap "Byg demo".
- Knap i Mission Control: "Lav demo til denne lead" (per lead-card i varme-strip).
- IKKE auto-deploy til Vercel produktion — kun lokal `dist/demo-{slug}/`-folder for nu.
  Vercel-deploy er manuelt skridt Lucas tager.

### Block 3 — SEO-værktøj (gør `/seo` ægte)
- Per klient: Lighthouse-scoring via `lighthouse` npm-pakke (kør headless Chrome,
  output mobile + desktop scores: Performance / Accessibility / Best Practices / SEO).
- Google indeksering-check: fetch `https://www.google.com/search?q=site:{domain}` med Googlebot UA,
  count antal resultater. Persist over tid.
- AI-søgnings-tjek: prompt en model ("find [klient] i [by] — kan du linke til deres hjemmeside?")
  og parse om svaret indeholder klient-URL. Brug AI-Gateway/Anthropic via `src/lib/ai.ts`.
- Schema.org-tjek: scan side for `application/ld+json` schemaer (LocalBusiness, Restaurant, etc.).
- Månedsrapport-template: ny `src/lib/seo-report.ts` der genererer markdown ud fra ovenstående.
- Tier-system i konfigurer: VIDA = tier_full (alle 4 checks månedligt), andre klienter = tier_basic
  (kun Lighthouse + Schema.org).
- `/seo` viser overblik per klient (cards med score-trends) + dyk-i-dybden modal.

### Block 4 — Vault-kobling (gør de halvbygte skærme ægte)
- Ny `src/lib/vault.ts`: læser fra `https://raw.githubusercontent.com/Buurski/KnowledgeOS/master/{path}.md`.
  Cache 5-minutter via Next.js `unstable_cache`. Returnerer raw markdown + parsed frontmatter.
- `/goals`: læser `wiki/os/roadmap-naeste-skridt.md` (mål-sektioner), parser checkbox-statuser.
  Indtjening hentes fra `context/priser.md` + Sheets-status="client" tællinger.
- `/memory`: browse alle noter i `wiki/` med sektion-grupper (kunder, proces, OS).
  Fuzzy search-input. Klik en note → markdown-render i panel.
- `/journal`: viser `daily/` noter sorteret efter dato, nyeste først.
- Vault-data er cached lokalt; fejl-tilstand viser amber banner som /goals i dag.

### Block 5 — Klient-leverancer
- `/clients/[id]` udvidet:
  - **Edit CMS** sektion: link til Decap-CMS-admin URL hvis konfigureret per klient
    (`wiki/kunder/{slug}.md` frontmatter: `cms_url: ...`)
  - **SEO-status** widget (læser fra Block 3 — viser seneste scores)
  - **Projektmappe**-link (åbn lokal mappe via `file://` link eller GitHub repo-link)
  - **Næste vedligehold**-rækkefølge (læs fra vault frontmatter)
- Auto-genererede kunde-noter: når lead status skifter til "client" → opret
  `wiki/kunder/{slug}.md` med skabelon-tilstand (frontmatter + sektioner). Brug
  `90_templates/kunde-note-template.md` i vaulten hvis findes; ellers byg default.

### Block 6 — Tone-mixer (ekstrem menneskelig variation)
- Ny `src/lib/tone-mixer.ts`:
  - **Åbnings-varianter (5):**
    1. "Jeg sad og kiggede efter [type-virksomhed] i [by], og..."
    2. "Stoppede op ved jeres side — og..."
    3. "Faldt over jeres [FB/IG/anmeldelser]..."
    4. "Lagde mærke til at I har..."
    5. "Tilfældig observation: I har [N] anmeldelser..."
  - **Demo-introduktion (3):**
    1. "Lavede den her til en anden [branche] for nylig — [URL]"
    2. "Sådan kunne det fx se ud: [URL]"
    3. "Bedst hvis I selv kigger: [URL]"
  - **Afslutning (4):**
    1. "Sig endelig til. Mvh, Lucas"
    2. "Bare en idé. Mvh, Lucas"
    3. "Skriv hvis det lyder interessant. Mvh, Lucas"
    4. "Helt uforpligtende. Mvh, Lucas"
  - `mixForLead(lead)`: deterministisk valg baseret på lead.id-hash så samme lead får samme variant
    igen (ingen flip-flop ved retry). Tracker hvilke kombinationer der bruges.
- Opdater `src/lib/draft.ts` til at bruge tone-mixer for alle nye drafts.
- Test: generér 20 sample mails for 20 forskellige fiktive leads, output `scripts/preview-tone-mix.mjs`.
  Resultatet skal vise tydelig variation (ikke samme åbning/afslutning på 2 i træk).
- Send sample-mail til buur.aigro@gmail.com med 5 fremhævede varianter.

### Block 7 — Hybrid engine-cadence
- Ny `/settings/page.tsx` (eller udvid Mission Control):
  - Toggle "Auto-kør engine hver morgen kl 07:00"
  - Antal-vælger (default 12 drafts per kørsel)
- Vercel Cron: kun aktiv hvis Settings-flag = on. Læser flag fra `.send_queue/settings.json`.
- Mission Control viser "Næste auto-kørsel: i morgen 07:00" eller "Auto-kørsel slukket".
- Default-state: SLUKKET. Lucas tænder selv når han er tryg.

### Block 8 — Charlie ind
- **Ingen login** — Vercel basic auth via miljøvariable (`VERCEL_BASIC_AUTH_USER` /
  `VERCEL_BASIC_AUTH_PASS`). Én delt kode. Edge middleware-fil `src/middleware.ts` der
  beskytter alle routes undtagen `/api/health`.
- Ny `/welcome`-side: kort orientering — sidebar, Mission Control, hvor finder jeg leads/kunder.
  Vises automatisk første gang en bruger lander.
- **CHARLIE ONBOARDING MAIL:** allerede sendt af Cowork (Lucas's hovedchat) — se separat mail-task.
- GitHub-vault-instruks: bekræft at `Buurski/KnowledgeOS` er auto-synced. Charlie vil få
  Obsidian Git-plugin via mailen.

### Block 9 — AI Spend tracker
- Ny `src/lib/spend-log.ts`: hver `ai.generate()`-kald appender en linje til
  `.send_queue/spend.jsonl` med `{ts, model, inputTokens, outputTokens, costUSD}`.
  Cost-beregning fra `ai.ts`-konstanter (Sonnet/Opus pris-per-token).
- Wrapper omkring `ai.generate()` så det er transparent.
- Ny `/spend`-side: graf over forbrug per model (dag, uge, måned). Stack-bar chart.
  Tabel med top 10 dyreste kald.
- Alert hvis dagsforbrug > 50 kr (visuelt amber banner på Mission Control).

### Block 10 — Hermes-forberedelse
- Ny `SETUP_HERMES.md` i repo-roden med eksakte trin:
  1. Opret Railway-projekt (link til railway.app)
  2. Setup Telegram bot via BotFather (eksakt kommando)
  3. Opret GitHub-handshake (Hermes læser `Buurski/KnowledgeOS` som submodule eller
     periodisk pull)
  4. Dreaming-loop arkitektur (hvad den gør hver nat)
  5. Sikre at Hermes IKKE kan sende mail uden Lucas-bekræft (samme guardrails som her)
- Ny `hermes/`-mappe med kode-skelet (Node-app klar til Railway):
  - `hermes/index.js` — basic Telegram-bot der spørger Lucas via chat
  - `hermes/dreaming.js` — natlig sweep der læser vaulten + foreslår oprydning
  - `hermes/package.json` — minimal Railway-klar app
  - `hermes/Dockerfile` — for Railway deploy
- IKKE deploye Hermes — kun forberede. Lucas gør selv deploy fra Railway når han er hjemme.

### Block 11 — Cleanup + arkivering
- Flyt til `_archive/2026-06-04/`:
  - `AGENTIC_OS_ANALYSE_OG_PLAN.md`
  - `NOTEBOOKLM_MASTER_PROMPT.md`
  - `OBSIDIAN_AGENTIC_OS_SETUP.md`
  - `START_HER_Obsidian_AgenticOS.md`
  - `BLOCKERS.md` (den er forældet, vi opdaterer en ny)
- Opdater `DASHBOARD_OVERHAUL_GOAL.md` til v4: tilføj note om at Del 2 er bygget.
- Slet eller indfyld `/claude` og `/hermes`-skærmene:
  - `/claude`: lav den til en "AI assistant"-skærm der viser hvad Claude pt har adgang til (forbindelser/MCPer/vault-status)
  - `/hermes`: lav den til en setup-status-skærm der viser om Hermes er deployet eller "Klar til Railway-setup — se SETUP_HERMES.md"
- `/build-guide`: behold men omdøb til "Plan-historik" (viser DASHBOARD_OVERHAUL_GOAL.md + COMMAND_CENTER_VISION.md + NIGHT_BUILD_REPORT.md som sider)

### Block 12 — Polish, tests, dokumentation
- Kør alle eksisterende tests (`scripts/test_all.mjs`) — skal være grøn.
- Tilføj tests for nye libs: `scripts/test_tone_mixer.mjs`, `scripts/test_seo.mjs`,
  `scripts/test_vault.mjs`, `scripts/test_spend.mjs`, `scripts/test_recon.mjs`.
- Manual UI-tjek: hver ny side åbnes i `next start`, verificer at det renderer.
- Opdater `PRODUCT.md` med nye blocks i changelog.
- Opdater `DESIGN.md` hvis der er nye design-mønstre indført.
- Skriv `NIGHT_BUILD_REPORT_v2.md` i samme stil som v1 (rolig, ærlig).

---

## Test-mail til Lucas (en efter hver større block)

Send via Gmail-MCP eller direkte nodemailer (kald `.send_queue/send.mjs`):
- Til: `buur.aigro@gmail.com` ONLY (guardrail håndhæver det)
- Subject prefix: `[BUILD]` for at filtrere
- Krop: kort opsummering + screenshots (PNG inline hvis muligt) + vedhæftet preview-fil
- Tjekpunkter: efter Block 3, Block 6, Block 8, Block 10, og final efter Block 12.

## Charlie onboarding mail (engangsopgave — IKKE del af Claude Code-arbejde)

Cowork sender den direkte fra hovedchat til `1charlie.nielsen@gmail.com`. Indhold:
- Velkomst + virksomhedens kerne (kort)
- Sådan får du adgang: GitHub-konto + accept invitation til Buurski/KnowledgeOS
- Installer Obsidian + Obsidian Git-plugin (med screenshots)
- Sådan åbner du command-center-appen
- Tonen + 5 regler (link til soul.md, claude.md, de-5-regler.md)
- Lucas's telefonnummer hvis Charlie sidder fast

---

## Guardrails (håndhæves af .claude/settings.json + block-dangerous.mjs)

- Aldrig push/merge til main · ingen force-push · ingen rebase
- Aldrig sende mail til andre end `buur.aigro@gmail.com` ELLER `1charlie.nielsen@gmail.com` (sidstnævnte kun til onboarding)
- Aldrig røre `.env`, `.send_queue/.sa.json`, `.git/`, eller PauseSchedule
- Aldrig `rm -rf /` eller destruktive sletninger
- Aldrig `npm run dev` eller Vercel-deploy
- Aldrig kalde `/api/email/bulk-send`, `/api/email/send-followups`, `/api/email/send-email`
  direkte via curl/fetch — kun gennem /approve UI eller send.mjs lokalt
- Build skal være grøn efter hvert block — hvis ikke, FIX FØR NÆSTE BLOCK
- Hvis du møder noget irreversibelt: STOP, log i `NIGHT_BUILD_REPORT_v2.md`-blockers, fortsæt med andet

## Hvor du må afvige fra planen (innovation OK)

- Bedre UI-design end specificeret? Byg det.
- Mindre refaktor der giver klarhed? Tag den.
- Bug du opdager undervejs? Fix + separat commit.
- Optimering på +30% performance? Implementér.
- Skærm der "Kommer Fase C" som du faktisk kan bygge med eksisterende libs? Byg den ægte.

## Hvor du IKKE må afvige

- Skift stack (Next 16/React 19/Tailwind v4)
- Tilføje database (Sheets + .send_queue er datalaget)
- Branding/farver væk fra sage-grøn
- Ændre mail-blokering (test-mails OK, klient-mails ikke)
- Røre Sheets-leads, .send_queue/queue.json, eller PauseSchedule
