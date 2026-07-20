# Bundle J — Platform-sammenligning + optimering (scheduled tasks cloud-migration)

Dato: 2026-07-20. Orkestrator: Sonnet 5. Research: 3x Haiku parallel. Council: 4x Haiku parallel.
Bygger på Bundle I v3 (`docs/cloud-tasks/`, `bundle-i-cloud-migration.md`).

---

## FASE 1 — Platform-sammenligning (4 platforme × 4 tasks)

### Platforme, rå fakta

| Dimension | Cowork Cloud Scheduled Tasks | Claude Code Routines | Hermes (VPS) | Vercel Crons |
|---|---|---|---|---|
| Reliability | Research preview, ingen SLA, ukendt retry | Research preview, ingen SLA, ukendt retry | Always-on, men single VPS, historik: 27-dages stille-død, memory-hangs (fixet 2026-06-17) | Cloud-native, men ±59min timing-drift, ingen retry ved fejl, duplicate-run risiko |
| Setup-friktion | UI-form (navn/prompt/frekvens/model), pause/resume | Web/Desktop/CLI, Custom Environment m. secrets, setup-script cache | SSH + `hermes cron add`, ingen UI | `vercel.json` + git-push, ingen UI |
| Cost | Delt quota m. Chat/Cowork/Code | Delt quota m. subscription, daily cap (tal ukendt) | Fast VPS-pris (~5-10 EUR/md), intet per-kald | Gratis Hobby (1/dag) / Pro ubegrænset |
| Integrations | MCP-connectors (Gmail/Sheets hvis linket), GitHub uklart | MCP-connectors + GitHub (clone+push, auth-scoped) | Fri adgang: lokal vault-clone, script-niveau IMAP/Sheets, GitHub via SSH-key | Kun app-interne routes (ingen direkte ekstern kald) |
| Model-adgang | Model-vælger i form | Model-vælger i form | Nous Hermes v0.16 (IKKE Claude), fast engine | Ingen — trigger kun app-endpoints |
| Observability | Per-task session-log, ingen health-aggregation | Per-run status (grøn=startede+afsluttede rent, IKKE success-garanti), transcript | Output-filer 7-dages retention, Telegram-log, ingen dashboard | Vercel Logs (invocation+response-kode, ingen body altid) |
| Reversibilitet | Pause/resume/slet, config redigerbar | Samme | SSH cronjob action=pause/resume/delete/update | Rediger `vercel.json` + push |

Kilder: [Cowork Scheduled Tasks docs](https://support.claude.com/en/articles/13854387-schedule-recurring-tasks-in-claude-cowork), [Claude Code Routines docs](https://code.claude.com/docs/en/routines), [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs), [Vercel Limits](https://vercel.com/docs/limits), `bundle-i-cloud-migration.md`, `KnowledgeOS/wiki/os/hermes-cron-oversigt.md`, `scheduler-arkitektur.md`.

### Task-facts

- **daglig-brief** — læser inbox.json/leadgen.json/messenger.json/omverden.json + git-commits + Sheets. Skriver `KnowledgeOS/daily/{dato}.md` + git-push + mail til buur.aigro+charlie. 100% cloud-klar (Bundle I): vault.ts bruger GitHub-API, intet lokalt FS-krav.
- **ugentlig-brief** — samme mønster, ugentlig kadence. 100% cloud-klar.
- **lucas-os-brief** — læser Lucas-OS-sheets + omverden.json + gårsdagens brief. Skriver KUN lokal fil + mail til buur.aigro (privacy-regel: aldrig vault-output). Simplest cloud-case: ingen GitHub-write nødvendig overhovedet.
- **daily-inbox-triage** — blokeret: Charlie's IMAP-creds er lokale i `.env.local`. Skal flyttes til en secrets-mekanisme før nogen cloud-platform kan køre den. Skriver i dag lokal git-commit — skal omlægges til GitHub contents-API (samme mønster som vault.ts).

### Konklusion FASE 1 — platform-valg per task

**daglig-brief → Claude Code Routines.**
Grund: tekst-syntese-tung (skal skrive godt dansk, sammenfatte kilder klogt) — Claude-kvalitet slår Nous Hermes her. Allerede 100% cloud-klar via vault.ts GitHub-API. Cloud-native = altid oppe uanset PC.
Risk: research preview, quota/limits kan ændre sig uden varsel. Delt quota med Lucas's interaktive brug — kan sultes hvis han selv kører tungt samme dag.
Mitigation: Hermes-watchdog (billig, Haiku-niveau) tjekker om dagens brief-fil findes ved 08:00 — findes den ikke, sender fallback-mail. Samme mønster som eksisterende `lucas-os-brief-watchdog`, bare flyttet til at overvåge en cloud-routine i stedet.

**ugentlig-brief → Claude Code Routines.**
Samme begrundelse. Lav frekvens (1x/uge) = lav quota-risiko selv i research preview.

**lucas-os-brief → Claude Code Routines.**
Allerede reklassificeret GO i Bundle I (privacy-regler er design-regler, ikke tech-blocker — kun `--to lucas`, aldrig vault-output). Simplest af de fire: ingen GitHub-write.
Risk: samme research-preview-usikkerhed.
Mitigation: BEHOLD watchdog-mønsteret, men flyt selve watchdog-tjekket til Hermes (ikke til en anden cloud-routine) — en overvåger bør ikke stå på samme platform som det den overvåger. Hermes tjekker fil-eksistens/mail-sendt-log, sender fallback hvis mangler. Samme logik som nu, bare Hermes i stedet for lokal PC.

**daily-inbox-triage → Hermes VPS.**
Grund: eneste platform hvor Charlie's IMAP-creds kan flyttes med lavest eksponering — SSH-gated `.env` på VPS'en, aldrig i git, aldrig i en cloud-platforms udokumenterede secrets-lag (Cowork/Routines secret-injection er ikke dokumenteret i deres docs — reel ukendt-faktor). Hermes har allerede fri script-niveau IMAP-adgang og kan kalde Claude API direkte for klassificering (bedre kvalitet end at stole på egen Nous-model til vigtig triage).
Risk: Hermes er single VPS, ingen redundans, har historik med stille fejl. Nous-model bruges IKKE her — task skal eksplicit kalde Claude API (AI Gateway) for selve klassificeringen, Hermes er kun runtime/scheduler.
Mitigation: tilføj samme timestamp-freshness-check som daglig-brief allerede bruger (inbox.json har `generatedAt` — hvis >24t gammel, flag det i briefen i stedet for at fejle stille).

**Opsummeret valg:**

| Task | Platform | Hovedrisiko | Mitigation |
|---|---|---|---|
| daglig-brief | Claude Code Routines | research-preview quota | Hermes-watchdog |
| ugentlig-brief | Claude Code Routines | research-preview quota (lav, ugentlig) | Hermes-watchdog |
| lucas-os-brief | Claude Code Routines | research-preview quota | Hermes-watchdog (flyttet fra lokal) |
| daily-inbox-triage | Hermes VPS (kalder Claude API) | single-VPS silent-fail | freshness-check i output |

Vercel Crons bruges IKKE til nogen af de fire — de egner sig til deterministiske app-interne triggers (som de 10 eksisterende CRM-crons), ikke til AI-tunge briefs, pga. ±59min timing-drift og ingen retry.

---

## FASE 2 — Optimering

### Redundans fundet
- Ingen reel "morning brief"-generator i `src/lib` — kun `inbox-digest.ts`. daglig-brief/lucas-os-brief kører helt uden for lead-system (i KnowledgeOS/Scheduled), så intet dobbeltarbejde teknisk, men **data læses fra samme JSON-filer af flere tasks** (leadgen.json læses af daily-messenger, daily-inbox-triage OG daglig-brief) — hvis én producer fejler stille, arver 3 forbrugere den samme stale data. Ingen central "er kilden frisk"-check i dag ud over daglig-brief's eget 24t-flag.
- `daily-ops` (06:30) er markeret "fallback/manual, ikke pålideligt skemalagt" — overlapper delvist med `daily-lead-gen` (06:00) + `daily-messenger` (07:00). Uklart om `daily-ops` stadig skal eksistere som separat task eller er efterladt duplikat.

### Kvalitets-huller
- Kun `lucas-os-brief` har watchdog. `daglig-brief`, `ugentlig-brief`, `daily-lead-gen`, `daily-messenger` har ingen — hvis en af dem dør stille, opdager Lucas det først når han undrer sig over manglende mail.
- Ingen central health-check-endpoint der viser "sidst kørt" på tværs af alle 6 scheduled tasks + 10 Vercel crons. `/api/ops/status` findes for Vercel-siden — intet tilsvarende for Scheduled-tasks/Hermes.

### Data-kilde-forbedringer
- Search Console: Lucas mangler stadig GSC-adgang til VIDA (afventer siden 2026-06-16). Relevant for SEO-siden, ikke direkte for de 4 brief-tasks, men nævnes fordi det er den mest modne halvfærdige integration — værd at lukke før man bygger nye datakilder ind i briefs.
- Cal.com er live på Kinly (`cal.com/kinly/15min`) men ikke wired ind i nogen brief — en "bookinger denne uge"-linje i lucas-os-brief eller daglig-brief er billig (Cal.com har offentligt API) og reelt operatør-nyttigt.
- Notion/Slack/Google Analytics: alle rene fremtidsidéer, intet konkret at optimere nu.

### AI-model-tuning
- lucas-os-brief-watchdog kører allerede Haiku — korrekt (ren fil-eksistens-check, ingen grund til dyrere model).
- daily-lead-gen + daily-ops + daily-messenger kører Opus 4.8 — for scraping/dedup/filtrering er det sandsynligvis over-provisioneret; Sonnet kan formentlig løse det samme til lavere cost. Kun selve brief-syntesen (dansk prosa, tone) retfærdiggør Opus/Sonnet-topklasse.
- daily-inbox-triage (ny, Hermes) bør bruge Sonnet til klassificering, ikke Nous Hermes — se Fase 1.

### Integrations vi mangler
- Cal.com-oversigt i brief (se ovenfor) — lav effort, klar værdi.
- Ingen Slack/Notion-behov identificeret — spring over, ingen efterspørgsel i data.

### Watchdog-coverage — anbefalet udvidelse
Byg videre på det eksisterende fil-eksistens+fallback-mail-mønster (`lucas-os-brief-watchdog`) til også at dække:
- daglig-brief (Hermes tjekker `KnowledgeOS/daily/{dato}.md` findes ved 08:30)
- ugentlig-brief (Hermes tjekker ugentlig fil findes mandag morgen)
- daily-lead-gen (Hermes tjekker leadgen.json `generatedAt` er i dag ved 07:00 — allerede delvis dækket af daglig-brief's eget 24t-flag, men en aktiv watchdog med fallback-mail er stærkere end et passivt flag i en anden brief)

---

## FASE 3 — UI-forslag til lead-system

Målgruppe: Lucas + Charlie (operatør-værktøj, ikke kunde-polish — jf. `feedback_bundle_f_internal_scope`).

1. **"Task-status"-widget/side** (ny, lille) — viser sidste kørsel + status for de 6 Scheduled tasks + Hermes-cronjobs ét sted, ikke kun de 10 Vercel-crons (`/api/ops/status` dækker kun Vercel i dag). Operatør-nytte: høj (det manglende "kan jeg se om noget er dødt" fra Fase 2). Arbejde: middel (skal aggregere 3 kilder: Vercel logs, Cowork/Routines session-status via evt. API, Hermes cron-status-endpoint fra Fase 2). Risiko: lav — read-only.
2. **Bell-widget udvidelse: task-fejl som alert.** Eksisterende bell viser i dag formentlig kun CRM-relaterede notifikationer — udvid til at inkludere "brief X kørte ikke i dag" fra samme datakilde som punkt 1. Operatør-nytte: høj (proaktivt frem for at Lucas selv skal tjekke siden). Arbejde: lav, hvis punkt 1 allerede eksponerer et status-JSON. Risiko: lav.
3. **Mission Control: næste 5 planlagte kørsler.** Simpel liste (task-navn + platform + næste tidspunkt) på forsiden. Operatør-nytte: middel (overblik, mindre "glemte jeg at task X skulle køre"-angst). Arbejde: lav — statisk cron-config kan renderes uden live-status. Risiko: ingen.

Alle tre er read-only/observability — ingen af dem rører send/mutation-flows, så lav risiko på tværs.

---

## FASE 4 — Council (4 linser, Haiku parallelt)

**A — Forbedringer:** Flyt vault-writing tasks til Hermes/Routines fremfor Cowork (quota-risiko på skriv-tunge tasks); unblock triage ved at flytte Charlie's IMAP til et sikkert secrets-lag; tilføj Hermes health-check-endpoint med failover-logik; centralt health-check-bogmærke er den enkeltstående største pålidelighedsgevinst.

**B — Risici:** Hermes stille-død (27-dages præcedens), Cowork/Routines quota-sult ved delt forbrug med interaktiv brug, Charlie's Gmail-creds skal ALDRIG lande i Vercel-logs/deploy-historik (injektions-sikkerhed udokumenteret på Cowork/Routines — derfor Hermes-valget i Fase 1), Vercel ±59min-drift uegnet til tidskritiske tasks, ingen retry noget sted uden eksplicit bygget ind.

**C — Hold fast:** Vercel cron-guard-mønsteret (CRON_SECRET + idempotency-stempel + KV-audit) er solidt, genbrug det. vault.ts GitHub contents-API-mønster (token-safe, best-effort, 404→reason-string, aldrig crash) er allerede rigtig løsning til cloud-vault-writes — ingen ny abstraktion nødvendig. Budget-gating-mønsteret fra daily-lead-gen (hård cap + graceful degrade) bør genbruges til IMAP/Sheets-kvoter i triage. Hermes-config (hard_stop_enabled, memory_char_limit, gateway_notify_interval) er stabil siden 2026-06-17 — RØR IKKE, kun Lucas ændrer VPS-config.

**D — Wild card:** Overvej Hermes som "synteses-hub" der selv kalder Claude API (AI Gateway) for kvalitetskrævende dele, i stedet for at sprede arbejdet over 4 separate cloud-platforme — billigere end at betale kvote 4 steder for redundant arbejde. Alternativ: konsolider til kun 2 platforme (Vercel + Hermes), drop Cowork/Routines helt så længe de er research-preview med ukendt pricing/limits — de tilføjer usikkerhed uden klar gevinst over Hermes+Claude-API-kald. Denne vinkel er reel — men Fase 1's valg (Routines til briefs) holder fast fordi Claude-tekstkvalitet er værdifuld nok til at bære research-preview-risikoen, MED Hermes-watchdog som sikkerhedsnet. Hvis Routines-limits ændrer sig drastisk om få måneder, er wild-card-planen (alt via Hermes+API) det naturlige fallback — værd at holde i baghovedet, ikke bygge nu.

---

## Definitiv konklusion

**Platform per task:** se tabel i Fase 1. Routines til de 3 briefs (Claude-kvalitet, cloud-native, watchdog på Hermes), Hermes til inbox-triage (sikreste sted for Charlie's creds, kalder Claude API for klassificering).

**Top 5 optimeringer at implementere først:**
1. Hermes-watchdogs for daglig-brief + ugentlig-brief + lucas-os-brief (fil-eksistens + fallback-mail, samme mønster som eksisterende).
2. Flyt Charlie's IMAP-creds til Hermes `.env` (SSH-gated), unblock daily-inbox-triage.
3. Central task-status-endpoint (aggregerer Vercel + Routines-session-status + Hermes cron-status) — grundlag for både watchdogs og UI.
4. Model-nedgradér daily-lead-gen/daily-ops/daily-messenger fra Opus til Sonnet hvor arbejdet er scraping/dedup, ikke prosa-syntese.
5. Ryd op i `daily-ops` vs `daily-lead-gen`/`daily-messenger`-overlap — afklar om `daily-ops` stadig skal eksistere.

**Top 3 UI-tilføjelser:**
1. Task-status-side/widget (sidste kørsel + status, alle 6 scheduled tasks).
2. Bell-widget udvidet til task-fejl-alerts.
3. Mission Control: næste 5 planlagte kørsler.

**Wild-card værd at overveje:** Hermes-som-synteses-hub der selv kalder Claude API — hold som fallback-plan hvis Routines/Cowork research-preview-status bliver ustabil eller dyrere end forventet.
