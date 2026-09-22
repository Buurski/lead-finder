# Kinly HQ — lead-finder bliver et endeligt CRM (design, 2026-09-22)

Ejer: Lucas + Charlie. Orkestrator: Claude Opus 5.5. Godkendt i chat 22/9 ("du bestemmer, byg videre i lead-finder, vær kritisk").

## 1. Problem (målt, ikke gættet)

1. **Intet fælles id.** Lead = Sheets-række (id = rækkeindeks, skifter). Kunde = anden Sheets-fane, koblet til lead på *navn*. Faktura = KV, koblet på *navn*. Kladde/Jev-dom = KV på lead-id. → ingen tidslinje, ingen samlet pipeline, omdøbning knækker økonomi.
2. **En kunde er flere steder samtidig** (site leveret + mangler betaling + nyhedsbrev i gang). Nuværende model har én status pr. kunde.
3. **To pipelines** (`/leads` før kunde, `/salg` efter) og ingen "næste skridt".
4. **Støj:** ~30 sider, 7 uden for nav, `/radar` stub, `/send` kopi af `/approve`, Hermes delt i `/hermes` + `/drift`.
5. **Huller:** kinly.dk-formular ender kun i en indbakke; 13 kundesites registreres i hånden; ingen fælles "hvad laver Lucas/Charlie/agenterne"; Jev-svar kun i skygge; 85 email-dubletter (11 par ubearbejdede = dobbelt-mail-risiko).
6. **Delt Basic auth** → systemet ved ikke hvem der gjorde hvad.

## 2. Beslutninger

| Emne | Valg | Hvorfor |
|---|---|---|
| Kodebase | Byg videre i lead-finder (samme repo, samme Vercel-projekt) | Genbruger motor, Jev, fakturaer, Hermes-shim; prod virker hele vejen |
| Database | Postgres: **Neon** i prod, **PGlite** i dev/test. Drizzle ORM | Stabile id'er, joins, søgning; PGlite = ingen lokal server |
| Migrering | **Strangler:** ny backend bag eksisterende funktions-signaturer (`getLeads` m.fl.) + `DATA_BACKEND=pg\|sheets` | 77 filer importerer sheets.ts — kalderne skal ikke omskrives; flag = øjeblikkelig rollback |
| Datamodel | Atomic CRM-kernen (company/contact/deal/task/note) + Twenty-tidslinje (activity med aktør) | Mindste model der dækker "kunde flere steder" |
| Auth | Hver sit login via **magic link** til egen mail (Gmail SMTP findes) | Ingen passwords at lække; hvem-gjorde-hvad |
| Bogføring | Egne fakturaer nu, `dinero_id`-felt klar; Dinero-integration når CVR + konto findes | Dinero valgt af Lucas, findes ikke endnu |
| Codex | `gpt-6-sol` reviewer penge/auth/migration; `gpt-6-luna` mekanik | Probet live 22/9 |
| Design | Hybrid: Lucas' 4 referencer + Kinly-identitet (se §5) | Lucas' valg |

**Ikke med (YAGNI, kritisk):** åbnings-tracking (død + skader leverbarhed), vægtet forecast-dashboard (glanced månedligt — ét tal på HQ er nok), visuel sekvens-bygger, custom objects, commit-feed (støj), tidsregistrering pr. minut.

## 3. Datamodel (Postgres)

- `app_user` — id, name, email, role. Lucas + Charlie.
- `company` — id (uuid), legacy_lead_row, legacy_client_id, name, branch, city, phone, website, email (primær), place_id, reviews_count, business_status, source (`scrape|website|referral|manual|ingest`), lifecycle (`ny|kontaktet|svaret|interesseret|kunde|tabt|ikke_egnet`), skip_reason, owner, jev_grade, jev_score, website_quality, enriched (jsonb), callback_date, created_at, updated_at. Unik (lower(email)) hvor email ≠ '' og unik (place_id).
- `contact` — id, company_id, name, email, phone, role, newsletter_ok (bool, default false), created_at.
- `deal` — id, company_id, title ("Hjemmeside", "Nyhedsbrev", "Hjemmesidepas"), kind (`engang|abonnement`), stage (`tilbud|aftalt|i_gang|leveret|betalt|tabt`), value_dkk, mrr_dkk, owner, next_step, next_step_due, expected_close, won_at, lost_at, created_at, updated_at.
- `activity` — id, company_id, deal_id?, actor (`lucas|charlie|hermes|jev|claude|codex|system`), type (`mail_sendt|svar|note|opkald|moede|deploy|faktura|fase|jev|checkin|arbejde|kundeopdatering`), summary, payload jsonb, billable_dkk?, invoiced_at?, at. Kun tilføjelser.
- `task` — id, company_id?, deal_id?, owner, title, due, done_at, created_at.
- `outreach` — id, company_id, contact_id?, kind (`kold|opfoelgning|kundeopdatering|nyhedsbrev`), step, subject, body, status (`kladde|godkendt|sendt|besvaret|stoppet|afvist`), sender, sent_by, jev_grade, payload jsonb (hooks, demoPair, combo…), created_at, sent_at, updated_at. Erstatter approval_queue-JSON.
- `invoice` + `invoice_line` — number (tekst, fortløbende), company_id, deal_id?, recipient jsonb, issue/due, status (`kladde|sendt|betalt|forfalden|rykket`), sent_at, paid_at, reminded_at, pdf_url, payer_type, vat_rate, dinero_id?; linjer: description, amount_dkk, activity_id? (arbejdslog → fakturalinje).
- `subscription_plan` — company_id, lines jsonb, day_of_month, active (kundeabonnement = MRR). Udgifter (`subscriptions.ts`) forbliver KV — lille, virker, ingen joins.
- `site` — id, company_id, vercel_project, domain, cms_url, status (`demo|i_gang|live`), last_deploy_at, last_deploy_url.
- `kv_legacy_map` — gammel nøgle → ny uuid (migrering + bagudkompatible links).

Invarianter: (a) alt med penge refererer company_id, aldrig navn; (b) `activity` skrives af samme funktion som laver ændringen (én `record()`), (c) outreach til en company med et `svar` inden for 30 dage stoppes automatisk.

## 4. Informationsarkitektur

Nav (venstre rail, mørk): **HQ · Pipeline · Virksomheder · Indbakke · Leadgen · Økonomi · Agenter** + Studio, SEO under "Mere". ⌘K beholdes.

- **HQ (`/`)** — "God morgen, Lucas". Rækker: *I dag* (mine næste skridt der er forfaldne, godkend-kø-tal, nye svar, henvendelser) · *Team* (Lucas/Charlie: nuværende arbejde + seneste leverance) · *Agenter* (mørkt kort: Hermes-jobs kørende/fejlet, Claude/Codex "færdig"-poster) · *Penge* (MRR, udestående, forfaldent) · *Omverden* (ugens fund: nye modeller/værktøjer).
- **Pipeline (`/pipeline`)** — øverst funnel-bar (ny→kontaktet→svaret→interesseret→kunde, som reference 4). Nedenunder deal-kanban (tilbud→aftalt→i gang→leveret→betalt) med alder-farve (rød når next_step_due er overskredet eller intet next_step).
- **Virksomheder (`/virksomheder`, `/virksomheder/[id]`)** — liste med gemte filtre. Profil: header (livsfase, Jev, site-status, MRR), deals, kontakter, tidslinje, opgaver, fakturaer, site-kort (Vercel + CMS-link), "Log arbejde"-knap (→ activity `arbejde`, evt. billable).
- **Indbakke (`/indbakke`)** — faner *Godkend* (kladder), *Svar* (Jev-klassificeret), *Henvendelser* (kinly.dk-formular), *Kundeopdateringer* (kladder). Tastatur j/k/a/r/e. Dubletspærre på send.
- **Økonomi (`/okonomi`)** — faner Fakturaer · Abonnementer (MRR) · Udgifter · Prognose. "Ufakturerede arbejder" → "Lav faktura".
- **Agenter (`/agenter`)** — Hermes (jobs, runs, chat — samlet fra /hermes + /drift) · Sessioner (Claude/Codex "færdig"-poster) · Omverden.

Redirects: `/leads→/pipeline`, `/salg→/pipeline`, `/clients[/id]→/virksomheder[/id]`, `/approve,/send→/indbakke`, `/replies,/jev-replies→/indbakke?tab=svar`, `/previews→/indbakke?tab=henvendelser`, `/hermes,/drift→/agenter`, `/fakturaer→/okonomi`, `/udgifter→/okonomi?tab=udgifter`, `/indsigter→/okonomi?tab=prognose`, `/crm→/`. Slettes: `/radar`, `/send`, `/claude`, `/jev-shadow` (fold ind i profil), `BUILD_STATUS.json`. `/review/halt`, `/seo-tjek`, `/demo` beholdes (eksterne links).

## 5. Design

Tokens (erstatter creme/salvie/Fraunces):
- bg `#EDEDEA`, surface `#FFFFFF`, surface-2 `#F5F5F2`, line `#E4E4DF`
- ink `#191713` (Kinly blæk — pille-knapper, aktiv fane, KPI-kort "fremhævet"), mid `#55504A`, faded `#8A847B`
- accent lime `#C8F04B` (aktiv/positiv/AI-knap), success `#4C9A6F`, risk `#E0533D`, warn `#F2A93B` + blød `#FBEFD9`
- dark card `#16130F` (Agenter/AI-kort)
- Font: Plus Jakarta Sans (allerede loadet) til alt; tal `font-variant-numeric: tabular-nums`, store KPI 40–56 px/600; meta-tekst i JetBrains Mono 13 px (datoer, "6 min siden").
- Radius: kort 24, indre 16, pille 999. Ingen skygger — kun flader mod bg.
- Kinly-identitet: K-bomærke øverst i rail, wordmark i login. **I CRM'et er prikken under k'et lime `#C8F04B` i stedet for ember-orange** (Lucas 22/9) — filer `public/brand/kinly-mark-rail.svg` (mørk rail), `kinly-mark-light.svg`, `kinly-wordmark-{rail,light}.svg`. Ember `#D4500F` bruges ingen steder i lead-systemet; kinly.dk beholder orange.
- Mobil: rail → bundbar (HQ, Indbakke, Pipeline, Mere). Indbakke skal kunne bruges på telefon (erstatter /send).

## 6. Automatik (ud af boksen)

- **Kundeopdatering:** deal → `leveret` eller "Log arbejde" med *kunde-synlig* → LLM (eksisterende `ai.ts`) laver kladde "Nu har vi lavet …" → Indbakke/Kundeopdateringer. Aldrig auto-send.
- **Arbejdslog → faktura:** billable activities uden invoiced_at samles i "Lav faktura" for kunden.
- **Jev (billig, ~$0,04/1M tokens), nye brug:** (1) dublet-dom "samme forretning?" ved migrering + ingest, (2) svar-intent live (efter DPA-gate `JEV_REPLIES`), (3) check-in → hvilken kunde/deal (valg-spørgsmål), (4) henvendelse fra kinly.dk → branche + seriøsitet.
- **Team-check-in:** Hermes-cron 09:00 hverdage spørger Lucas og Charlie på Telegram "Hvad arbejder du på i dag?" → `POST /api/team/checkin` (HMAC) → activity `checkin` + opdaterer "nuværende arbejde".
- **Deploy-signal:** Vercel deploy-hook pr. kundesite (eller dagligt poll af Vercel API) → `site.last_deploy_at` + activity `deploy` (én pr. prod-deploy, ikke pr. commit).
- **Session-poster:** `POST /api/agent/log` (HMAC/secret) som Claude/Codex/Hermes kalder ved "færdig: X" → activity actor=claude/codex.
- **Auto-stop:** svar registreret → alle åbne `outreach` for den company → `stoppet`.

## 7. Nyhedsbrev (juridisk ramme)

Markedsføringslovens §10 skelner ikke B2B/B2C. Derfor: nyhedsbrev kun til (a) kunder med tidligere køb (§10 stk. 2, lignende ydelser, frameld i hver mail) og (b) personer der har tilmeldt sig via dobbelt opt-in på kinly.dk. Ingen udsendelse til scrapede adresser. Kold 1:1-outreach er uændret — Lucas' ansvar; anbefaling: advokat-tjek.

## 8. Faser (hver: `npm run verify` grøn + prod-bevis + council; Sol-review på penge/auth/migration)

1. **Fundament** — tag, deps, skema, db-klient (Neon/PGlite), PG-implementering bag sheets-/queue-/invoice-/crm-API, migreringsscript m. tørkørsel + dublet-rapport, magic-link-auth pr. bruger. **Gate:** Neon kræver Lucas' OK (marketplace-vilkår). **Gate:** VPS-leadgen skal pege på PG før Sheets-skrivning stoppes.
2. **Skal + design + HQ + Virksomheder + Pipeline.**
3. **Indbakke** (godkend/svar/henvendelser samlet, auto-stop, dubletspærre, Jev-svar live efter DPA).
4. **Økonomi** (fakturaer på company_id, MRR-abonnementer, arbejdslog→faktura, Dinero-klar).
5. **Agenter + Team** (Hermes samlet, check-in, deploy-signal, session-log, omverden).
6. **kinly.dk-henvendelser → CRM** (kinly-site POST'er også til `/api/inbound`).
7. **Kundeopdateringer + nyhedsbrev** (kladder; opt-in-liste).

## 9. Fejl og risiko

- Hvert trin bag `DATA_BACKEND`; rollback = sæt flag til `sheets`, redeploy.
- Migrering er idempotent (upsert på legacy-nøgler), tørkørsel skriver rapport før rigtig kørsel, fuld JSON-backup af Sheets + KV i scratchpad + Blob.
- Penge-invarianter testet (ingen NaN, paidAt kun ved betalt — eksisterende `validInvoiceLines`/`applyStatusChange` genbruges).
- Auth fail-closed på alle API-ruter bevares; maskin-auth (CRON_SECRET, Hermes-HMAC) urørt.

## 10. Tillæg 22/9 — Hermes på siden + kundeviden (Lucas' krav, efter fase 1)

**Målt:** Hermes-shimmen svarer "OK" på 6,0 s, og hele svaret kommer på én gang (`/api/chat/stream` streamer ikke reelt).

1. **Én assistent.** Claude-docken (`ChatDock` → `/api/chat`) fjernes. Hermes-docken er tilgængelig på alle sider (⌘J), og samtalen overlever navigation. Et svar der kommer efter et sideskift, venter i docken med en badge.
2. **Kontekst-pakke.** På en virksomhedsside sender CRM'et `{spørgsmål, dossier}`. Dossieret indeholder company, deals, kontakter, de sidste 20 activities, fakturasaldo, site og kanonisk vault-note (≤ 12k tegn). På andre sider sendes sidens kontekst (fx Indbakke → den åbne kladde). Hermes skal ikke slå op for at svare på "hvad skylder VIDA?".
3. **Forslag pr. side** (3 klikbare spørgsmål) i stedet for et tomt felt.
4. **Ægte streaming** i shimmen (`vps/hermes_api*.py`) er et selvstændigt trin med måling af første byte før og efter. Hermes' cron og `.env` røres ikke (CLAUDE.md).
5. **Facit-deling.** Postgres er facit for tal (pris, MRR, domæne, status, fakturaer). Vault-noten `wiki/kunder/<slug>.md` er facit for viden (præferencer, historik, adgang, planer). Frontmatter får `crm_id`, og pris-felter i noten ignoreres, når CRM'et har tallet.
6. **"Opdater vidensbase"** (virksomhedsside): Hermes samler kundens spredte noter plus nye CRM-hændelser til ét udkast af den kanoniske note → diff-visning → Lucas/Charlie godkender → commit via eksisterende `vault.ts` (GitHub). Aldrig auto-skrivning.
7. **Jev** (billig, typed) bruges hvor svaret er et valg eller et tal: hvilken kunde et check-in/spørgsmål handler om, dublet-dom, churn-risiko, svar-intent, SEO-prioritet. Hermes bruges hvor svaret er tekst.

**Kritisk (ikke med):** ingen anden LLM-assistent "for hastighedens skyld" (to hukommelser = to sandheder); ingen automatisk KB-skrivning.

**Kendt fra migreringen:** KT VVS er dublet (kunde −1 ↔ lead 18 "KT VVS ApS"), fordi `ApS` ikke blev normaliseret. Det løses med værktøjet "Flet virksomheder" i fase 2, som også dækker de 85 email-dubletgrupper.
