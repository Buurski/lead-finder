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
