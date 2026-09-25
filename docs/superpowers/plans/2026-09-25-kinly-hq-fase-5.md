# Kinly HQ fase 5 — merge, send-sikkerhed, kunder/SEO, blog

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (UI/mekanik) — men bølge 1 (merge + send/auth/DB) koder orkestratoren selv (Fable-5 §1: dyr fejl ⇒ orkestrator). Steps bruger `- [ ]`.

**Goal:** Én verificeret prod-version af Kinly HQ, hvor main (personligt login, agent-API, svar-indbakke) og feature (kunder, opgaver, SEO-historik, kladde-forbedringer) er samlet, send-vejen ikke kan dobbelt-sende eller "sende uden at registrere", og derefter kunde-/SEO-/blog-sporene bygges ovenpå.

**Architecture:** Merge `origin/main` ind i `feat/crm-hq-2026-09-22` (main vinder auth + svar-indbakke). Feature-migrationerne gen-genereres med drizzle-kit som 0008–0010 med rigtige snapshots, køres på Neon før push. Send-rettelser er små og lokale i `approve/send` + ét atomisk lås-helper. Push af merge til main = prod-deploy (Vercel auto-deploy).

**Tech Stack:** Next 16 / React 19, drizzle-orm + drizzle-kit (Postgres/Neon, PGlite lokalt), node:test, Vercel.

**Spec:** `docs/superpowers/handover/2026-09-24/` (00–07 + raa/). Verificeret mod kode/DB 25/9 (se "Verificerede fakta").

## Global Constraints (ordret fra handover/Lucas)

- Udgående = kladder. Testmails kun til `buur.aigro@gmail.com`.
- Send-gaten må aldrig svækkes (`canSendTo`, `followup-gate.ts`, "sendt = endelig", dobbeltklik-værn, kunder ⇒ ingen kold mail).
- Hemmeligheder kun fra filer; aldrig i git/chat/logs. Vercel env: `vercel env add NAME production --value "…" -y < /dev/null`.
- Claude rører aldrig Hermes' cron-config/.env. Tal via `ssh hermes-vps 'hermes -p <profil> -z "…"'` (Hermes-MCP er nede i denne session).
- Migrér før deploy. Git-tag før destruktivt arbejde. Max 2–3 prod-deploys/dag.
- Composio aldrig i produktionskode.
- Ingen orange i CRM (lime `#C8F04B`). Faner øverst. 120–150 ms bevægelse.
- Bash-heredoc halverer backslashes → regex-kode via Edit/Write-tool.
- Aldrig `npm run dev`; `next start` på build, luk bagefter.

## Verificerede fakta (25/9, denne session)

- `origin/main` = `8599a78`; feature 25 commits foran, main 28 foran. `git merge-tree`: konflikter kun i `src/proxy.ts`, `src/components/shell/Sidebar.tsx`, `src/app/replies/RepliesClient.tsx`.
- Neon `drizzle.__drizzle_migrations`: 8 rækker, sidste `created_at=1790203964527` (= main `0007_seed_app_users`). Tabellerne `company_relation`, `seo_snapshot` og kolonnerne `task.note/important` findes IKKE. `app_user`: 2 brugere, 1 med adgangskode.
- Feature-migrationerne 0006–0008 er håndskrevne SQL uden snapshots og uden journal-rækker. `schema.ts` mangler CHECK `a_id < b_id` og indeks `company_relation_b_id_idx` som SQL'en har.
- `outreach.status` er `text`; pg `writeQueue` har `setWhere: not FINAL` (FINAL = sent eller system-stoppet) → en sendt kladde kan ikke skrives om. Send-låsen i `approve/send` er KV get→put (ikke atomisk).
- `/api/agent/tasks` (main) begrænser allerede `actor` til `lucas|charlie`.
- Magic-link-koden findes også på main (login-siden beholder `?t=` for gamle links).

## Beslutninger (og hvorfor)

1. **"Send svar direkte" fjernes** (route + UI + `LIVE_SEND_ARMED`). Main's "Åbn i Gmail" svarer i den rigtige tråd med korrekte headers og DMARC; en sikker direkte-send kræver modtager-binding, trådheaders og atomisk reservation = ny send-vej at vedligeholde for et behov der allerede er dækket. Kan genopbygges senere hvis Lucas savner den.
2. **Migrationer gen-genereres trinvis med drizzle-kit** (0008 task, 0009 relation, 0010 seo), så hver har snapshot og journal — Hermes kan så køre `db:generate` for blog som 0011 uden at genskabe vores tabeller.
3. **Send-status `sending`** (revideret efter Sol R1): atomisk betinget UPDATE `approved|edited → sending` med modtageren låst i kladden (`reserveForSend`, null ⇒ intet SMTP). `sending` er FINAL for hel-kø-skrivninger (kan hverken overskrives eller slettes af forældede snapshots); kun `finishSend` (betinget `status='sending'`) flytter den: SMTP ok → `sent`; SMTP-fejl hvor serveren med sikkerhed ikke tog mailen (EAUTH/EDNS/ECONNECTION/EENVELOPE/ETLS, eller responseCode ≥400) → `approved`; tvetydig fejl (timeout/socket) eller bogføringsfejl efter SMTP → bliver `sending` + opgave "afstem – tjek Gmail Sendt". `sending` tæller som sendt i alle ledgers (`countsAsSent`) og holder sekvenstrinnet.
9. **`?force=1` fjernes** fra send-rutens GET og POST (Sol R1 F3) — intet flag må kunne gen-sende en sendt kladde.
4. **Atomisk send-lås** via `counter`-tabellen (INSERT … ON CONFLICT DO UPDATE … WHERE udløbet RETURNING) når pg er slået til; KV-fallback lokalt.
5. **ICS-token** = tilfældigt token i KV (`ics-token/<user>`), roterbart fra `/settings`. Ingen ny migration (holder blog på 0011).
6. **`/profil` slettes**; kalenderlink + rotér-knap flyttes til main's `/settings`.
7. **Agent-actor (B6):** accepteret rest-risiko — én delt HMAC-secret pr. VPS; allowlist lucas|charlie findes. Pr.-profil-secrets kræver Hermes .env-ændring (ikke vores) → forslag i vault.
8. **npm audit:** kun rapport + ikke-brydende `npm audit fix` hvis den ikke rører send-libs; nodemailer-major i egen bølge med testmail.

---

## BØLGE 1 — Merge + send/auth-sikkerhed + migration + én deploy

### Task 1.1: Sikkerhedsnet og merge

**Files:** konfliktfiler `src/proxy.ts`, `src/components/shell/Sidebar.tsx`, `src/app/replies/RepliesClient.tsx`; slet `src/app/api/replies/[leadId]/send-reply/route.ts`, `src/app/profil/page.tsx`.

- [ ] `git tag pre-merge-2026-09-25 HEAD && git tag pre-merge-main-2026-09-25 origin/main && git push origin pre-merge-2026-09-25 pre-merge-main-2026-09-25`
- [ ] `git merge origin/main --no-ff -m "merge: main (personligt HQ) ind i feat/crm-hq"`
- [ ] `proxy.ts`: foren undtagelser (main's login/setup/agent + feature's `api/kalender/`). Hver undtagelse skal selv være fail-closed (kalender: token-tjek → 404).
- [ ] `Sidebar.tsx`: main's bruger/avatar/log-ud + feature's `/kunder`-nav.
- [ ] `RepliesClient.tsx`: tag main's version (`git checkout --theirs`), fjern kald til `send-reply`. Slet send-reply-route. Grep: `grep -rn "send-reply\|LIVE_SEND_ARMED\|needsArm" src` → 0 hits.
- [ ] Grep regenerate: `grep -n "Basic " src/app/api/approve/regenerate/route.ts src/lib/hermes-client.ts` → ingen hardcodede legitimationer.
- [ ] Login: main's login-side vinder; magic-link bliver kun som main har den (gamle links). Ingen ny magic-vej.
- [ ] `/profil` → flyt kalenderlink til `/settings` (Task 1.4), slet `/profil` + nav-post.
- [ ] `rm -rf .next && npm run typecheck && npm run lint` → grøn.
- [ ] Commit merge.

### Task 1.2: Migrationer 0008–0010 med drizzle-kit

**Files:** slet `drizzle/0006_task_priority.sql`, `drizzle/0007_company_relation.sql`, `drizzle/0008_seo_snapshot.sql`; modify `src/lib/db/schema.ts` (tilføj `check("company_relation_order", sql\`a_id < b_id\`)` + `index("company_relation_b_id_idx").on(t.bId)`); create `drizzle/0008_task_priority.sql`, `0009_company_relation.sql`, `0010_seo_snapshot.sql` + `meta/0008-0010_snapshot.json` + journal.

- [ ] Midlertidigt fjern `companyRelation`- og `seoSnapshot`-tabellerne fra schema.ts (behold task-kolonner) → `npx drizzle-kit generate --name task_priority` → 0008.
- [ ] Genindsæt `companyRelation` → `npx drizzle-kit generate --name company_relation` → 0009.
- [ ] Genindsæt `seoSnapshot` → `npx drizzle-kit generate --name seo_snapshot` → 0010.
- [ ] `git diff src/lib/db/schema.ts` = kun check+indeks-tilføjelsen. `npx drizzle-kit generate` igen → "No schema changes".
- [ ] Journal: 11 rækker, `when` stigende og > 1790203964527.
- [x] Kør migrationer mod frisk PGlite-kopi af Neon (`scripts/dev-db-snapshot.mjs`, rettet så seedede app_user-rækker erstattes — Sol R1 F4) → 11 migrationer, company 1428 / outreach 770 kopieret.
- [ ] Commit.

### Task 1.3: Send-vej — reservation + atomisk lås (orkestrator koder) — BYGGET (`843a7f9`)

Implementeret: `src/lib/draft-status.ts` (`countsAsSent`), `src/lib/send-safety.ts` (`acquireSendLock`/`releaseSendLock`/`sendLockHeld` via CAS i `counter`, `failedBeforeAccept`), `reserveForSend`/`finishSend` i `src/lib/queue.ts` + `src/lib/pg/queue.ts`, FINAL udvidet med `sending`, send-rutens SMTP-blok, `countsAsSent` i followup-gate, contact-history, suppress, followup-overview, ingest-leadgen, company-draft, approve/sequence; `sequence.ts` OPEN inkl. `sending`. Tests: `src/lib/send-safety.test.ts` (5: samtidig lås én vinder/udløb/release-kun-egen, SMTP-klassifikation, reservation kun approved/edited + én vinder + manglende række, sending beskyttet mod stale write/delete, finishSend-transitioner). Begrænsning: send-rutens SSE-løkke har ingen rute-test (kræver mocking af Sheets/transport) — dækkes af lib-tests + E2E-testmail.

Oprindelige delskridt:

**Files:** `src/lib/queue.ts` (DraftStatus + `"sending"`), `src/app/api/approve/send/route.ts`, create `src/lib/send-lock.ts` + `src/lib/send-lock.test.ts`, `src/lib/send-status.test.ts` (eller udvid eksisterende approve-send-test).

- [ ] Test: lås — to samtidige `acquireSendLock()` → præcis én `true`; udløbet lås kan tages; `releaseSendLock()` frigiver. (pg via PGlite-testhelper hvis findes, ellers InMemory-fallback.)
- [ ] Test: send-flow med fake transport — (a) SMTP ok ⇒ `sent`; (b) SMTP kaster ⇒ `approved`, failed++; (c) SMTP ok men `updateDraft(sent)` kaster ⇒ status forbliver `sending`, event `sent_unrecorded`, tæller som sendt, opgave oprettet best-effort; (d) `updateDraft(sending)` kaster ⇒ ingen SMTP.
- [ ] Test: en `sending`-kladde tæller i `sentIds/sentKeys/sentEmails`-ledgeren og vælges aldrig som kandidat.
- [ ] Implementér; kør tests → grøn.
- [ ] `grep -rn '"sent"' src/lib/canSendTo.ts src/lib/followup-gate.ts src/lib/leads/*.ts` — vurdér hvor `sending` skal behandles som sendt (kontakt-historik/dublet-spærre). Minimum: send-ledger + ingest-dublet (`OPEN_OR_SENT`).
- [ ] Commit.

### Task 1.4: ICS-token i KV + /settings

**Files:** `src/lib/hq/calendar.ts` (fjern `calendarToken`-HMAC, tilføj `getIcsToken(user)`/`rotateIcsToken(user)` via `store`), `src/app/api/kalender/[user]/route.ts`, main's `src/app/settings/*` (kalender-sektion + "Nyt link"-knap via server action), test `src/lib/hq/calendar.test.ts`.

- [ ] Test: rotate giver nyt 64-hex token; gammelt token → 404; manglende token i KV → 404 (fail-closed).
- [ ] Implementér; `/settings` viser abonnér-link for den loggede bruger + "Lav nyt link".
- [ ] Commit.

### Task 1.5: Verify + browser-gennemklik

- [ ] `npm run verify` grøn (citér tal).
- [ ] Lokal: PGlite-kopi + migrationer + `next start`; login lokalt via bootstrap-kode (kun lokal kopi). Klik: HQ, Opgaver (redigér, vigtig, dato), Kunder (kort, relation), Viden, SEO, Godkendelse (Til-felt, demo-vælger), Svar (Scan nu, Åbn i Gmail), Settings (kalenderlink). Screenshots desktop + 390 px. Subagent-council (Sonnet "Charlie klikker") parallelt med Codex-diff-review.
- [ ] Codex Sol inspicerer merge-diffen (kode-only, send/auth/proxy/migration-filer) → ret fund.

### Task 1.6: E2E-testmail (FØR push) → migrér Neon → push main → live-tjek

Rækkefølge (Sol inspektion F5): E2E-testmailen på den isolerede kopi SKAL bestå (modtager, persisteret `sent`, headers) før Neon migreres og main pushes. Turbopack-build verificeres på Vercel-preview af feature-grenen (lokal Turbopack fejler på `next/font/google`-fetch; `next build --webpack` er grøn lokalt).

- [ ] E2E-testmail (Sol R1 F5): i en SEPARAT PGlite-kopi sættes alle andre kladder `approved|edited → rejected` (kun kopien), én kladde med `recipientEmail=buur.aigro@gmail.com` indsættes som approved; kør `POST /api/approve/send?ids=<id>` mod lokal `next start` med SMTP-creds fra `~/.kinly/lucas-app-password`; assert før kald: `select count(*) from outreach where status in ('approved','edited')` = 1 og dens modtager = buur.aigro. → "Vis original": SPF/DKIM/DMARC pass, From lucas@kinly.dk, ren tekst-signatur; kopien ender med status `sent`.
- [ ] Neon-backup: notér tidspunkt (PITR) og kør `node scripts/db-migrate.mjs` med `DATABASE_URL=$DATABASE_URL_UNPOOLED` (fra `.env.neon`, aldrig printet). Verificér 11 rækker + nye tabeller.
- [ ] `git log HEAD..origin/main` = tom (ellers merge igen). Push feature; `git push origin feat/crm-hq-2026-09-22:main` (fast-forward).
- [ ] Vercel: fjern `LIVE_SEND_ARMED`. Charlie-env → sensitive (pull til fil i scratchpad, rm, add `--sensitive`, slet fil).
- [ ] Live: login-side 200, beskyttet side uden login → 302/401, `/api/health` 200, `/api/hermes/status` ok, `/api/kalender/lucas` uden token 404, en cron-rute uden secret 401.

### Task 1.7: Overdragelse + dokumentation

- [ ] Hermes default + marketing: merge-SHA, journal-bekræftelse (11 migrationer, 0008–0010 genereret af drizzle-kit m. snapshots), "blog = 0011+". Kommentar på kanban `t_6c9d3972` (via Hermes).
- [ ] VPS read-only tjek: `/root/.hermes/state/prod-env-decoded.*` findes ikke; port 3210/4317 lytter ikke.
- [ ] Memory + vault `wiki/os/kinly-hq-status-2026-09-25.md` + rapport til Lucas.

**Gate til bølge 2:** prod kører merge-SHA, Neon 11 migrationer, testmail pass, Hermes har SHA.

---

## BØLGE 2 — Penge først (C) — egen plan før start

C0 menneskelige penge-handlinger (faktura 010, varme svar, Ikast-pris) → liste til Lucas, ikke kode. C3 kladder uden modtager må aldrig nå Afventer (filtrér ved ingest). C2 `List-Unsubscribe`-header + daglig loft ~20 ved nyt domæne. C4 mærk "standard-kladde". Council (Sol + data-korrekthed) før deploy.

## BØLGE 3 — /kunder som projekter-kort + SEO-sektion (H/07)

Faner Kunder · Varme · Leads · Ikke egnet; kort med egne mockups (ikke thum.io live); SEO egen nav-post (Overblik · Pr. kunde · Opdateringer · Værktøjer); GSC via service-account (Lucas tilføjer SA som begrænset bruger — gate), `gsc_snapshot`-migration nummereres EFTER blog (aftales med Hermes); "Opdateringer" = ugentlig diff → Jev dømmer væsentlighed (rådgiver) → "kræver handling" ⇒ opgave. Grafer kun ved ≥4 målinger (dataviz). Start med Ikast.

## BØLGE 4 — Blog-board med Hermes (06)

Hermes default integrerer blog-grenen som 0011+ på ny main; Claude reviewer (Sol) + kører fuld `npm run verify` lokalt (VPS kan ikke). Board v1: board + manuel idé + tjekliste-guard + udgiver + `?ref=`. Første opslag: rigtig kunde (Ikast) med dateret GSC/GEO-tal og kundens accept; "billigste" kun med dateret prissammenligning.

## BØLGE 5 — Ud af boksen (G) — kun det der giver penge

Kandidater: "Lovet kunden"-liste, ugentlig Sendt-mappe↔CRM-afstemning, nav-diæt for Charlie, cron-fejl-alarm. Fjern: `/drift` som nav-post, uafprøvede signal-jobs.

## Sol R1 (plan-review) — dispositioner

| Fund | Disposition |
|---|---|
| F1 sending ikke beskyttet / updateDraft ikke atomisk | Accepteret — betinget UPDATE-reservation, `sending` i FINAL, kun `finishSend` flytter den |
| F2 tvetydige SMTP-fejl | Accepteret — `failedBeforeAccept`; ellers bliv i `sending` + afstem-opgave |
| F3 `?force=1` | Accepteret — fjernet fra GET og POST |
| F4 snapshot-seed-kollision | Accepteret — `delete from app_user` før kopiering |
| F5 lokal send kan ramme rigtige modtagere | Accepteret — isoleret kopi, alle andre approved→rejected, `?ids=`, pre-assert |
| F6 sekvens ser ikke `sending` | Accepteret — OPEN inkl. `sending`; `countsAsSent` i sekvens-visning |
| F7 manglende række / modtager før SMTP | Accepteret — reservation returnerer null ⇒ intet SMTP; modtager skrives i reservationen |

## Inspektionsfokus (Codex Sol, frisk session, base `pre-merge-main-2026-09-25` = nuværende prod)

Prioritér: `src/app/api/approve/send/route.ts`, `src/lib/send-safety.ts`, `src/lib/queue.ts`, `src/lib/pg/queue.ts`, `src/lib/draft-status.ts` + kaldere, `src/proxy.ts`, `src/app/api/kalender/[user]/route.ts`, `src/lib/hq/calendar.ts`, `src/app/settings/CalendarCard.tsx`, `drizzle/0008-0010` + journal/snapshots, `src/app/replies/*` (direkte send fjernet), `src/app/api/approve/regenerate/route.ts` (ingen hardcodet Basic), `src/lib/senders.ts` (From = afsenderkonto). Resten af feature-diffen (kunder/opgaver/SEO-UI) er sekundær.

## Sol R2 (plan) + inspektion 1 — dispositioner (bygget i `d73095c`)

| Fund | Disposition |
|---|---|
| R2-F1 / — ECONNECTION tvetydig | Accepteret — fjernet fra sikker-listen |
| R2-F2 / I-F1 modtager fra run-start | Accepteret — frisk modtager + gates for ALLE kladder; reservation betinget på `updatedAt`-version |
| R2-F3 loft tæller kun bekræftede | Accepteret — loft/pacing på forsøg; kørslen stopper ved første SMTP-fejl |
| R2-F4 mutationer på sending | Accepteret — 409 i `/api/approve/queue`; `updateDraft` (pg) er ét betinget række-UPDATE der nægter endelige |
| R2-F5 / I-F4 sending usynlig | Accepteret — `ReconcileBanner` på /godkendelse + `reconcile`-handling (sendt / ikke sendt) |
| I-F2 kunde får kold mail (c:/place_id) | Accepteret — `stopOpenForRows` matcher også place_id og `c:<uuid>`; `customerForLead` fail-closed før SMTP |
| I-F3 updateDraft-race | Accepteret — række-UPDATE (pg) |
| I-F5 E2E efter push | Accepteret — Task 1.6 omordnet |

Tests: 469/469 (`npm run test`), heraf 8 i `src/lib/send-safety.test.ts`.

## Sol R3 (plan) + inspektion 2 — dispositioner

| Fund | Disposition |
|---|---|
| R3-F1 / I2-F2 afstemning under aktiv SMTP | Accepteret — `reconcile` afvises (409) mens send-låsen holdes |
| R3-F2 / I2-F1 forældet hel-kø-snapshot genopliver afvist | Accepteret — upsert kun hvis `outreach.updated_at <= excluded.updated_at` (+ test) |
| R3-F3 / I2-F3 kunde uden fælles id | Accepteret — `customerForDraft`: id ELLER navn+by (bizKey) ELLER modtager-mail mod kundelisten, fail-closed (+ test) |
| R3-F4 afstemt "sendt" stempler ikke kontakt | Accepteret — stempler `emailSentAt` for numeriske leads; den døde anden send-vej (`/api/email/bulk-send` + ubrugt `BulkEmailPanel`) er slettet |
| I2-F4 E2E-rækkefølge i tjeklisten | Accepteret — E2E er første punkt i Task 1.6 |
| I2-F5 Charlies signatur viser charlie@kinly.dk | Accepteret — signaturen viser afsenderkontoens adresse |

Rest-risiko (accepteret, dokumenteret): `writeQueue` sletter stadig ikke-endelige rækker der mangler i et snapshot (en kladde tilføjet efter snapshottet kan forsvinde, aldrig sendes) — datatab, ikke dobbelt-send; tages i bølge 2 hvis det ses.

## Inspektion 3 + 4 — dispositioner og stop

| Fund | Disposition |
|---|---|
| I3-F1 kunde kun via kontakt-mail | Rettet (`3b3559e`) + test |
| I3-F2 afstemt opfølgning stempler forkert felt | Rettet (`3b3559e`) |
| I4-F1 afstemning overskriver replied/afmeldt | Rettet: afstemning stempler kun tidspunkt, aldrig status (ikke Sol-inspiceret — 1 linje) |
| I3-F3 writeQueue sletter række tilføjet efter snapshot | Rest-risiko: datatab (kladde forsvinder), aldrig dobbelt-send |
| I3-F4 signatur-preview viser charlie@kinly.dk | Rest-risiko (lav): løses når Charlie får kinly.dk-postkasse |
| I4-F2 kunde-konvertering i sekunderne mellem tjek og SMTP | Rest-risiko: kræver konvertering midt i en kørsel; næste kørsel fanger den |
| I4-F3 legacy-kontakter uden companyId | Rest-risiko: 5 kontakter i DB; tjekkes ved kundeoprettelse i bølge 2 |
| I4-F4 samme-millisekund-kollision i versions-guard | Rest-risiko: kræver afvisning og forældet skrivning i samme ms |

Loop stoppet efter 3 plan-runder + 4 inspektioner: fundene er gået fra dobbelt-send-veje til sjældne race-vinduer. E2E-testmail bestået 25/9 01:00: SPF/DKIM/DMARC pass, Indbakke, persisteret `sent`, andet klik sender 0, gen-godkend 409.

## CHECKPOINT 25/9 ~01:30 (før /compact)

- Bølge 1 DONE og live (`d1f601c`). Hermes default: blog-migrationer 0011+ i gang (kort t_6c9d3972, run 613); 8789/8790 lukket for offentligheden (port-guard), 8787 uændret.
- Bølge 2 påbegyndt på feature-grenen (IKKE deployet): C3 — `/api/approve/queue` approve/approve-many kræver brugbar modtager (422 / skippedNoEmail); /approve sorterer kladder uden mail nederst.
- Næste i bølge 2: daglig send-loft ~20 + List-Unsubscribe-header (mailto) i `approve/send`, nodemailer 8→10 med testmail (samme E2E-opskrift: scratchpad `start-e2e.mjs` + isoleret `pglite-e2e`, Sheets-nøgle genskabes via `sa-keyfile.py`), "standard-kladde"-mærkat (C4), derefter claudex (Sol) + én deploy.
- Penge-handlinger til Lucas: faktura 010 Jernbanecaféen (kladde, forfald 27/9), faktura 011 KT VVS (kladde); 73 interesseret + 63 svaret i CRM.

## Bølge 2 — send-hygiejne (bygget 25/9, commit `05f7fbf` på feature-grenen, base `5c46bed`)

Leveret:
- C3 (`5c46bed`): approve/approve-many kræver brugbar modtager (422 / skippedNoEmail).
- C2 dagligt loft: `DAILY_SEND_CAP=20` pr. mailkonto pr. dansk kalenderdag (`sentTodayBySender` i `src/lib/send-safety.ts`), tæller `sent`+`sending` ud fra `updatedAt`; tjekkes i POST lige før reservation (efter frisk afsender), spejlet i GET-preflight. Ramt loft ⇒ "sprunget over" med grund (ikke "venter"), så UI ikke beder om nyt klik.
- C2 List-Unsubscribe: **AFVIST efter måling.** A/B-testmail til buur.aigro 25/9 01:33 (samme tekst, samme minut): med header ⇒ `CATEGORY_PROMOTIONS`, uden ⇒ `CATEGORY_PERSONAL`. SPF/DKIM/DMARC pass i begge. Gmails bulk-krav gælder >5000/dag; vi sender ≤20/konto. Kommentar i send-ruten dokumenterer valget.
- nodemailer 8.0.7 → 10.0.10 (5 high advisories lukket, `npm audit --omit=dev` = 0). Ingen API-brud for os (research: fejlkoder/responseCode uændrede; Node 20+ påkrævet, vi kører 24). `@types/nodemailer` fjernet — typer bundlet. Testmail via samme `senders.ts`-kode: 250 OK, Primær (uden header).
- C4: "Lav mail-kladde" → "Lav standard-kladde"; kladdens `professionalism` = "Standard-kladde fra skabelon (ikke researchet) — tjek teksten" (vises i /approve-detaljen).
- Oprydning: slettet døde sideveje uden om send-gaten — `/api/leads/[id]/send-email`, `/api/leads/[id]/email-preview`, `/api/review/approve`, `/api/email/test-send` (enqueuede til Sheets-SendQueue, som ingen afsender læser siden `scripts/send.mjs` blev fjernet i `4d6f05c`), `EmailPanel`/`EmailPreviewModal` (ingen importerer dem), `sendLeadEmail` (ubrugt direkte SMTP-vej). Tag `pre-dead-send-paths-2026-09-25`.

Bevis: tsc grøn, eslint 0 fejl, `npm test` 473/473, `next build --webpack` grøn.

Til Sol-inspektion — fokus: (1) kan loftet omgås eller tælle forkert (tidszone, `sending`, opfølgninger, afsenderskift undervejs)? (2) bryder sletningerne en levende kalder (UI, cron, Hermes)? (3) nodemailer-10-typen `ReturnType<typeof buildTransporter>`.

Kendte, IKKE ændret i denne bølge (flag til Lucas/senere):
- `cron/seo-tjek-followup` sender automatisk dag-7-mail til personer der selv har bestilt SEO-tjek (opt-in-tragt, eksisterede før). Kolliderer bogstaveligt med "udgående = kladder" → Lucas' beslutning.
- `invoices/[number]/send` frigiver faktura-låsen ved `ECONNECTION`, mens cold-send behandler det som tvetydigt. Faktura sendes manuelt af Lucas; vurderes i penge-bølgen.

### Sol-inspektion bølge 2, runde 1 (REVISE) — dispositioner
| Fund | Disposition |
|---|---|
| F1 loft tæller via kladdernes updatedAt/sender (legacy uden afsender, afstemning flytter dag) | Accepteret — erstattet af atomisk dagsbudget i `counter` (`send-day:<konto>:<dansk dato>`), taget ved hvert SMTP-forsøg med den faktisk valgte konto; kan ikke flytte dag. DB-fejl ⇒ send ikke. |
| F2 preview-send bruger samme konti uden loft | Accepteret — `/api/previews/[id]/send` tager samme budget før SMTP. SEO-tjek-mails (dag 0-rapport + dag 7-cron) er opt-in-svar til folk der selv bad om det og holdes UDEN for budgettet (ellers kan kolde mails blokere et svar); dag 7-cronens automatik er flagget til Lucas. |
| F3 List-Unsubscribe er et krav i 02 | Accepteret — kravet i 02 er opdateret med afgørelsen og A/B-beviset. |
Data-linse (Sonnet) bekræftede samme huller + at tidszone er korrekt og at `sent`/`sending`-rækker er beskyttet mod hel-kø-skrivninger. Hermes: ingen kaldere af de slettede ruter; 5 gamle `send.mjs`-kopier på VPS kører ikke (ingen cron/timer).

### Sol-inspektion bølge 2, runde 2 (REVISE) — dispositioner
| Fund | Disposition |
|---|---|
| F1 (high) preview-send sletter kravet ved ENHVER SMTP-fejl ⇒ dobbelt-send ved timeout efter DATA | Accepteret — kravet frigives kun ved `failedBeforeAccept` eller vores egen afvisning før SMTP (budget = `PreviewSendError`); tvetydig fejl ⇒ kravet står + besked "tjek Gmail Sendt". Test: ETIMEDOUT holder kravet, nyt klik sender ikke. |
| F2 afmeld-tekst påstået bevaret, men findes ikke i /approve-kladder | Accepteret som dokumentfejl — 02 rettet; tilføjelse af afmeld-linje = Lucas' beslutning (mailtekst). |
| F3 budget nøglet på afsender-id, ikke Gmail-konto | Accepteret — nøgle = normaliseret SMTP-adresse; test: lucas+charlie på samme adresse deler loft. |
Note: runde 1+2 meldte "Code changed during inspection" (runde 1: kunder-WIP; runde 2: formentlig `git fetch` under kørslen) — fundene er stadig behandlet.

### Sol bølge 2 R3 — dispositioner (commit `b1fd633`, base `8fed51a`)
- F1 ACCEPT: `action=edit` (Gem + godkend) kræver nu samme modtager som approve/approve-many via fælles `hasRecipient()` i `api/approve/queue/route.ts` (422).
- F2 ACCEPT: `cron/ingest-leadgen` laver ingen kladde uden brugbar mail (`skippedNoEmail`); `approve/add` springer over uden egen mail eller Sheets-match-mail. Eksisterende pending uden mail: kan ikke godkendes (F1) og står nederst.
- F3 ACCEPT: usikker preview-send markerer kravet `payload.uncertain=true`; `reconcilePreview` ("sent" ⇒ markér sendt, "not-sent" ⇒ frigiv) virker KUN på usikre krav. UI viser to knapper efter tjek af Gmail Sendt. Sender aldrig noget. Test i `preview-send.test.ts`.
- F4 ACCEPT: GET-preflight nøgler projekteret forbrug med eksporteret `budgetKey` (samme Gmail-konto ⇒ samme pulje).
Inspektion R4: kun diff `8fed51a..b1fd633`.

### Sol bølge 2 R4 — dispositioner (base `b1fd633`)
- R4-1 ACCEPT: `approve/add` gemmer den fundne modtager (egen eller Sheets-match) på kladden.
- R4-2 ACCEPT: GET /api/previews eksponerer `sendClaim` ("pending"/"sent") fra Postgres; UI viser afstemning ud fra den (overlever reload) + "Markér som sendt" når kravet er sendt men status ikke er.
- R4-3 ACCEPT: tilstand fødes i kravet (`payload.state="pending"` ved insert); "sent" sættes efter Gmail-accept. Ingen efterfølgende skrivning der kan fejle stille.
- R4-4 ACCEPT: "sent"-afstemning er idempotent — gentager status-skrivningen når kravet allerede er sendt.
- R4-5 ACCEPT: hver overgang er én betinget sætning på `state='pending' AND at < nu-2min` (DELETE/UPDATE … RETURNING); modsatte klik kan ikke begge vinde; et forsøg der kan være i gang kan ikke afstemmes.

### Sol bølge 2 R5 — dispositioner (base `07de55e`)
- R5-1 ACCEPT: tilstande `sending` (låst, fødes ved insert) → `uncertain` (registreret tvetydigt SMTP-udfald) | `sent`. "not-sent" frigiver KUN `uncertain`; fejler registreringen, står kravet `sending` og kan kun bekræftes som sendt. 2-min-vinduet er fjernet (unødvendigt: `uncertain` sættes først efter deliver returnerede).
- R5-2 ACCEPT (og R4-1 trækkes tilbage): `approve/add` finder modtageren før suppression og tjekker den faktiske adresse; KUN kladdens egen mail gemmes. Sheets-fundet mail slås op friskt ved send (kontakt-status tjekkes); Sheets nede ⇒ kladden kan hverken godkendes eller sendes. Sikker retning vinder over C3-renhed.
- R5-3 ACCEPT: `uncertain=true` uden state (b1fd633, aldrig deployet) behandles som usikkert.
- R5-4 ACCEPT: UI afleder kravet af den aktuelle liste; lokalt afstemt krav skjules kun til næste reload.

### Sol bølge 2 R6 — dispositioner (base `6ee69ae`)
- F1 ACCEPT: "sent"-afstemning af et `sending`-krav kræver alder > 2 min (`SETTLE_MS`; ruten har maxDuration 60 s); før-accept-oprydning, `uncertain`- og `sent`-overgange er alle betinget af `state='sending'`.
- F2 ACCEPT: kravet indsættes som `type=udkast_forsoeg` ("Forsøg på at sende …"); bliver `udkast_sendt` først ved Gmail-accept eller bekræftelse. Tidslinjen (WORK_TYPES) viser kun sendte.
- F3 ACCEPT: afstemningsknapper vises uanset status/link; PATCH /api/previews svarer 409 mens et krav er `sending`/`uncertain` (`hasOpenClaim`).
- F4 ACCEPT: nyt forsøg nulstiller den lokale skjulning.

### SEO-tjek-lead (Lucas 25/9) — HQ-del
- kinly.dk `SeoTjekTool` → `/api/contact` (kilde=seo-tjek, påkrævet samtykke, valideret host/score/mangler, valgfri tlf) → HQ `POST /api/previews` med `website` + `phone` + resultat/samtykke i questionnaire. Eksisterende kæde: `recordInbound` (virksomhed interesseret, kontakt, aktivitet, stopper kolde kladder) → `attachProfile` (Jev: stil/størrelse/ambition) → Hermes laver udkast + mailkladde → Lucas sender (preview-send). Ingen automatisk mail til kunden.
- HQ: `phone` gennem PreviewRequestInput → `recordInbound` (ny virksomhed + kontakt; kendt nummer overskrives aldrig). Test i inbound.test.ts.

### Sol bølge 2 R7 — dispositioner (de08663)
- R7-01 (high) ACCEPT: PATCH fejler lukket — opslag/lås-fejl ⇒ 503/409, ingen KV-skrivning.
- R7-02 (high) ACCEPT: navngiven lås `preview:<id>` (samme CAS-mekanisme som send-låsen, `withLock` i send-safety). PATCH (claim-tjek + status-skrivning) og send (status-læsning + claim-insert) sker under samme lås; SMTP ligger uden for låsen, efter claim — derefter giver PATCH 409. Test: afvisning under holdt lås stopper send.
- R7-03 (medium) ACCEPT: alle KV-array-mutationer i preview-queue under global lås `preview-queue` (ponytail: pr.-id-nøgler hvis trafik vokser).
- R7-04 (medium) ACCEPT: indsendt telefon lægges kun på NY virksomhed/kontakt; for eksisterende står den kun i henvendelsens payload.phone.

### Sol bølge 2 R8 — dispositioner
- R8-01 (high) ACCEPT: lås-levetid 120 s > alle kalderes maxDuration (send 60, previews 30). Vercel dræber ejeren før låsen udløber ⇒ en udløbet lås har ingen levende ejer (platformens timeout er fencingen).
- R8-02 (medium) ACCEPT: `claimBlocksStatus` — sendt krav er endeligt; kun idempotent "sendt/lukket" tilladt. PATCH bruger den under udkastets lås.
- R8-03 (medium) ACCEPT: createPreviewRequest skriver uden lås hvis låsen fejler (Postgres nede/optaget) — en henvendelse må aldrig tabes; race er det mindre onde.

### Sol bølge 2 R9 — dispositioner
- R9-01 (high) ACCEPT: lås-fejl ⇒ atomisk `store.append` til nødlog `preview-requests-fallback` (KV rpush); læsning fletter nødlog ind (arrayet vinder), næste låste skrivning folder den ind. Fejler også append ⇒ PreviewStorageError ⇒ 503 (prøv igen), aldrig 201 uden lagring.
- R9-02 (medium) ACCEPT: sendt krav ⇒ kun status-only "sendt/lukket"; enhver feltændring afvises (409).

### Sol bølge 2 R10 — disposition
- R10-01 (medium) ACCEPT: læsefejl på nødloggen kastes (ingen stille tom liste). Forsiden fanger selv (`.catch(() => [])`, kun visning); bro-cron, GET og send fejler synligt. Test tilføjet.

### Sol bølge 2 R11 — dispositioner (loop lukket her)
- R11-01 (medium) ACCEPT: attention fanger kø-læsefejl og viser en "haster"-linje i stedet for at vælte forsiden.
- R11-02 (medium) ACCEPT: inbox-digest svarer 503 (saved:true) når udkast-opgaver fejler; applyDraftRequests er idempotent (dedupe på mail), så gentagelse er sikker.
- R11-03 (low) ACCEPT: FSStore.readAll returnerer kun [] ved ENOENT; andre fejl kastes. Ingen FS-test (kun lokal driver).
- Loop-beslutning: 11 inspektionsrunder på bølge 2; fundene er nu kaldergrænser på én ændret funktion. Resten verificeres i council efter deploy.

## CHECKPOINT 25/9 ~10:00 — bølge 2+3 KLAR, IKKE DEPLOYET
- Feature `0381ca0` (pushet): bølge 2 (send-hærdning, dagsbudget, preview-send-krav, SEO-tjek-lead m. tlf, Sol R1-R11) + bølge 3 (/kunder-faner Kunder·Varme·Leads·Ikke egnet, /api/shot-proxy for skærmbilleder, sociale profiler → initialer, mobil-faner scroller).
- Verifikation: tsc 0, eslint 0 fejl, 493/493 tests, webpack-build grøn, lokale skærmbilleder (PGlite-kopi, aldrig Neon) desktop+mobil.
- Council bølge 2: send-gate-linse INGEN FUND (alle sendMail-steder kræver menneskeklik); data-linse 2× LOW (bevidste valg). Ingen migrationer siden d1f601c.
- DEPLOY-BESLUTNING: udskudt til 26/9. Main er allerede deployet ≥3 gange 25/9 (d1f601c + anden sessions 2109160/1df6a1e) = dagsloftet 2-3. Deploy: merge feature → main, push, live-tjek (login 200, /kunder 307 uden session, /api/shot 401 uden session, health 200).
- Kinly-site `claude/blog-redesign-0925` @ a98e87e (pushet, IKKE merget): blog-redesign + emnesider + SEO-tjek-leadformular + samtykke-værn (consentRef) + pilot-billeder (AI, 1600x900/1200x630 WebP).
- Næste: bølge 4 = blog-board i HQ (Hermes' B4 a3b2998 + B2 165e6b3 er blokeret/ufærdige → Claude integrerer: A/B-valg=hero, SEO-validering på server, eksport til kinly-site). Derefter kundeprofil-grafer + SEO-sektion.
- Til Lucas: Café Nohr "(fiktiv intern test)" ligger i Varme i prod-data; seo-tjek-followup-cron sender auto-mail dag 7 (afventer beslutning).

### Opus w4a-r5 (Codex spærret til 26/9 18:05) — dispositioner
- R5-01 (medium) ACCEPT: find-emails + invoices fjernet fra health (logger ikke; faktura-cron er pengekode og røres ikke for at få logning).
- R5-02 (medium) ACCEPT: health-test kræver begge veje (logget ⇒ i health; i health ⇒ logger), regex fanger `withCronLog<T>(`, manglende route-fil fejler.
- R5-03 (low) ACCEPT: URL-link stopper ved `&quot;`/`&#39;`; test for citeret URL.
- R5-04 (low) ACCEPT: newsletter-sync 502 + rød health ved enhver fejl, også manglende token (ærlig: intet synkes = fejl).

## CHECKPOINT 25/9 aften — bølge 4a KLAR, IKKE DEPLOYET (`6d9fdb4`)
Indhold siden 0381ca0: Hermes' blog-backend (0011-0012) + SEO-gates (metaTitle/-beskrivelse/alt) + blog-board-UI med A/B-billedvalg; SEO-tjek-rapportmail (Kinly-design, 10 %-tilbud m. frist, kladde — Lucas sender); nyhedsbrev-snapshot (0013) + dagligt sync fra kundesite (kun aggregater) + Nyhedsbrev-fane; /kunder-billeder fra kinly.dk/projekter (kun kunder); gammel HQ-/seo-tjek-tragt udfaset (auto-mail dag 7 slettet, 308 til kinly.dk). Tests 536/536.

### DEPLOY-TJEKLISTE 26/9 (rækkefølge er hård)
1. Codex tilbage 18:05 → Sol-inspektion af `4111f58..6d9fdb4` (R5-rettelser berører senders.ts = send-vej). Fund rettes før deploy.
2. `git log HEAD..origin/main` = 0, ellers merge + fuld suite.
3. git-tag `pre-deploy-2026-09-26`.
4. Neon: migrationer 0011, 0012, 0013 (migrér FØR deploy). Tjek rækketal company/draft uændret.
5. Vercel env (HQ): `NYHEDSBREV_TOKEN_IKAST` fra fil (`--value`, aldrig stdin). Uden den: newsletter-sync 502 hver dag (bevidst rød).
6. Merge feature → main, push (Vercel deployer). Live-tjek: login 200, /kunder 307 uden session, /api/shot 401, /api/cron/health 200, /seo-tjek 308 → kinly.dk.
7. Derefter kinly-site: merge `claude/blog-redesign-0925` → main (sender telefon + seoTjek + nyhedsbrev til HQ; HQ skal være oppe først). Live-tjek /blog/, /blog/emne/*, /seo-tjek/, /nyhedsbrev/tak/ (noindex). Kinly-Brevo env (`BREVO_API_KEY`, `BREVO_LIST_ID`, `BREVO_DOI_TEMPLATE_ID`) sættes af nyhedsbrev-sessionen; uden dem springes DOI blødt over.
8. Efter deploy: 12 blog-idéer (vault `wiki/kinly/blogideer-2026-09-25.md`) som idé-kort i HQ-board; E2E-test af SEO-tjek-formular med buur.aigro.
