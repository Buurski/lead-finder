# Bundle K — Watchdogs + UI + oprydning — FÆRDIG

Dato: 2026-07-20. Orkestrator: Sonnet 5. Bygger på `bundle-j-platform-comparison.md`.
Branch: `feat/bundle-k-watchdogs-ui-2026-07-20` (fra `feat/bundle-j-platform-comparison-2026-07-20`). Ikke merget til main.

## DEL 1 — Central task-status-endpoint

`src/app/api/ops/all-status/route.ts` + `src/lib/all-status.ts`. CRON_SECRET-gated som de andre `/api/ops/*`-routes. Returnerer `{ vercel, scheduled, hermes, generatedAt }`.

**Ærlig begrænsning (vigtig at kende):**
- **Vercel:** ingen offentlig run-history-API uden project-token (Lucas har ingen Vercel CLI/token, jf. `feedback_no_vercel_cli`). Endpointet lister derfor kun det DEKLAREREDE skema fra `vercel.json` — ikke om et kald reelt lykkedes. Ægte run-status findes kun i Vercel Logs.
- **Cowork Scheduled Tasks:** ingen run-log-fil findes. Endpointet bruger `SKILL.md`-filens mtime som proxy for "sidst rørt" — det er IKKE det samme som "sidst kørt succesfuldt", bare det tætteste tilgængelige signal uden en Cowork-API. God nok til at spotte en task der er helt død i ugevis.
- **Hermes:** stub med "ukendt". Hermes eksponerer i dag kun `/api/hermes/status` (shim-health), intet cron-run-listing-endpoint. Note i JSON'en forklarer hvorfor.

Dette er grundlaget for DEL 2 (watchdogs) og DEL 3 (UI) — begge bruger samme kilde, kan ikke drifte fra hinanden.

## DEL 2 — Watchdogs for de 3 briefs

Oprettet som Claude Code scheduled tasks (mcp__scheduled-tasks, IKKE Cowork — samme kategori som `omverden-daily`/`morgen-brief-lucas-os`):

- `daglig-brief-watchdog` — 08:30 (faktisk 08:37, service-jitter). Tjekker `raw.githubusercontent.com/Buurski/KnowledgeOS/master/daily/{dato}.md` via curl (200/404) — GitHub contents, ikke lokal fs, så det virker uanset hvor tasken kører. Mangler filen: fallback-mail `--to both` (buur.aigro + Charlie).
- `ugentlig-brief-watchdog` — mandag 09:00 (faktisk 09:02). Samme mønster mod `weekly/{YYYY-Wxx}.md`.
- `daily-lead-gen-watchdog` — 07:30. Tjekker `data/leadgen.json`'s `at`-felt (IKKE `generatedAt` — det feltnavn findes ikke i leadgen.json's eget skema, kun i inbox.json). Fallback-mail `--to lucas` KUN (Charlie skal ikke vækkes for leadgen). Prompten flager selv at daily-lead-gen er bevidst gated (springer sourcing over ved fuld godkendelses-kø) — en gammel fil er derfor ikke automatisk en fejl, kun værd at tjekke.

Model: claude-haiku-4-5-20251001 på alle tre (billig fil-check), som bedt om. Alle bruger `scripts/send_brief_mail.mjs` (samme hard-lockede allowlist som eksisterende `lucas-os-brief-watchdog`).

**Note:** disse 3 tasks bor i `C:\Users\Buur\.claude\scheduled-tasks\` (Claude Code lokal scheduler) — ikke i git-repoet, derfor ikke committet her. Kun deres eksistens/config er i denne DONE-rapport.

## DEL 3 — UI-tilføjelser (Command Center)

1. `src/components/mission/TaskStatusWidget.tsx` — kalder `/api/ops/all-status`, viser Cowork-tasks (alder siden mtime, rød ved >26t), Vercel-crons (deklareret skema) og Hermes-note. Rød ramme + AlertTriangle-ikon ved stale task.
2. `src/components/shell/Bell.tsx` udvidet: `useTaskAlerts()`-hook henter samme all-status-kilde, lægger stale Cowork-tasks til klokkens total-tæller + viser dem som "{task} kørte ikke i dag" i dropdownen.
3. `src/components/mission/NextRunsWidget.tsx` — statisk render (ingen live-data, som bedt om) af næste 5 planlagte kørsler tværs Cowork/Claude Code/Vercel, sorteret efter beregnet næste lokale klokketid.

Wired ind i `MissionControl.tsx` lige under `CronHealth`, side om side. `npx tsc --noEmit` + `eslint` rent på alle ændrede filer. `node scripts/test_all.mjs` — 349 checks, alle grønne (uændret af denne bundle, kører som regressions-tjek).

**Ikke browser-verificeret** (AGENTS.md/CLAUDE.md forbyder `npm run dev` mens Claude Code er aktiv — kun kort `next start` hvis nødvendigt, og autonom session skal ikke stoppe for det). Kode er type- og lint-ren; visuel verifikation er op til Lucas eller en opfølgende session.

## DEL 4 — Model-tuning + oprydning

**Model-nedgraderet Opus 4.8 → Sonnet 5** i tre Cowork SKILL.md-filer (`Documents\Claude\Scheduled\daily-lead-gen`, `daily-ops`, `daily-messenger` — alle scraping/dedup/filtrering, ingen prosa-syntese der retfærdiggør topklasse):
- Ændret prosa i selve prompten ("Sonnet 5, nedgraderet fra Opus 4.8 2026-07-20 — ...").
- **VIGTIG CAVEAT:** disse tasks ligger i Cowork (`Documents\Claude\Scheduled\`), IKKE i `mcp__scheduled-tasks`-systemet — der findes ingen `update_scheduled_task`-værktøj for dem herfra. Selve model-VALGET i Cowork sættes sandsynligvis i UI'ens dropdown ved oprettelse, ikke i SKILL.md-teksten. Denne ændring dokumenterer INTENTIONEN og opdaterer beskrivelsesteksten agenten selv ser — men **Lucas bør selv bekræfte/skifte model-dropdownet i Cowork-UI'en** for de tre tasks for at være sikker på den reelt bruger Sonnet 5 fra næste kørsel.

**daily-ops vs daily-lead-gen/daily-messenger — overlap-analyse (IKKE slettet, kun dokumenteret jf. opgavens regel):**
`daily-ops` (06:30) gør ALT TRE ting i én kørsel: lead-gen + messenger-candidates + indbakke-triage, og skriver til samme filer (`leadgen.json`, `messenger.json`, `inbox.json`) som de tre separate, senere tasks (`daily-lead-gen` 06:00, `daily-messenger` 07:00, `daily-inbox-triage`). Den er markeret i sin egen SKILL.md som "Opus 4.8"-tung og har ingen queue-gate (den nyere `daily-lead-gen` har en explicit 20-pending-gate fra 2026-07-04 som `daily-ops` mangler helt — `daily-ops` ville blindt fortsætte at bruge Places-budget selv med fuld kø). Alt tyder på at `daily-ops` er en ældre, ikke-opdateret forgænger til de tre nyere, separate tasks, efterladt som duplikat uden at være slettet. **Anbefaling til Lucas:** pause/slet `daily-ops` — den mangler queue-gaten og er reelt overflødig med de tre nyere tasks aktive. Ikke gjort her, kun anbefalet (opgavens regel: "slet IKKE uden Lucas's OK").

## Council (kort, per del)

- **A (forbedringer):** central status-endpoint er den reelle gevinst — watchdogs og UI deler nu én kilde til sandhed, ingen risiko for at de driver ad hinanden.
- **B (risici):** Cowork mtime-proxy kan false-positive ("fresh" fordi filen blev rørt manuelt, ikke fordi tasken kørte); Vercel-delen er statisk skema, ikke reel run-status — begge caveats er skrevet direkte i koden og i denne rapport, ikke gemt. Model-nedgraderingen kan ikke bekræftes uden Lucas tjekker Cowork-UI-dropdownet.
- **C (hold fast):** genbrugte eksisterende mønstre 1:1 — CRON_SECRET-gate, `send_brief_mail.mjs` allowlist, `lucas-os-brief-watchdog`s curl+fallback-struktur, `CronHealth.tsx`s widget-layout. Ingen ny abstraktion opfundet.

## Hvad Lucas skal gøre hjemmefra

1. **Bekræft model-dropdown** for `daily-lead-gen`, `daily-ops`, `daily-messenger` i Cowork-UI'en er sat til Sonnet 5 (SKILL.md-teksten er opdateret, men UI-valget kan være separat).
2. **Tag stilling til `daily-ops`** — pause/slet den overflødige task (se DEL 4-analyse) eller sig hvorfor den skal blive.
3. **Merge/preview:** push er til feature-branch, Vercel-GitHub-integrationen bygger automatisk en preview-URL for branchen (samme flow som tidligere bundles — check Vercel-dashboardet for linket; ingen CLI brugt her jf. `feedback_no_vercel_cli`).
4. De 3 nye watchdogs kører første gang i morgen (07:30/08:30) og mandag (09:00) — ingen handling nødvendig, de er allerede aktive.
