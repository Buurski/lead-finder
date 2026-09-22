# Kinly HQ — Fase 1: Fundament (Postgres + per-bruger-login) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Flyt lead-finders CRM-kerne (leads, kunder, kladde-kø, fakturaer, kontakter/aktiviteter/opgaver) fra Google Sheets + KV til Postgres bag de eksisterende funktions-signaturer, og giv Lucas og Charlie hver sit magic-link-login.

**Architecture:** Strangler. `src/lib/db/` indeholder skema + klient (postgres.js mod Neon i prod, PGlite i dev/test). Hver eksisterende lib (`sheets.ts`, `queue.ts`, `invoices.ts`, `crm.ts`) får en PG-implementering i `src/lib/pg/*.ts`; den eksisterende eksporterede funktion delegerer når `DATA_BACKEND=pg`. Ingen kalder ændres. `company.row_no` bevarer Sheets-rækkenummeret, så `Lead.id = String(row_no)` og alle `rowIndex = row_no - 2`-kald virker uændret — og nummeret skifter aldrig mere.

**Tech Stack:** Next.js 16.2.4, React 19, Node 24, drizzle-orm + drizzle-kit, postgres (postgres.js), @electric-sql/pglite, node:test med `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md`

## Global Constraints

- `npm run verify` (lint + typecheck + test + build) grøn efter hver task.
- Imports i `src/lib` bruger `.ts`-endelse (eksisterende mønster, fx `import("./sheets.ts")`).
- `DATA_BACKEND` ukendt/tom ⇒ `sheets` (nuværende adfærd). Kun `pg` slår PG til.
- Alt med penge refererer `company_id`; navne-match kun ved migrering/overgang via eksisterende `canonicalClientName`.
- Ingen secrets i kode, commits eller chat. `DATABASE_URL` kun i Vercel env / VPS `credentials.env` / `.env.local`.
- Udgående mail: magic-link-mails er undtaget kladde-reglen (de går kun til Lucas'/Charlies egne adresser fra env).
- Auth fail-closed bevares på alle eksisterende ruter; `CRON_SECRET`, Hermes-HMAC, `/seo-tjek`-undtagelser urørt.
- Commit-trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Model-routing: Task 2, 6, 8, 9 (DB-kerne, penge, migrering, auth) = orkestrator selv + Codex `gpt-6-sol` review. Task 3, 4, 5, 7 = Sonnet/`gpt-6-luna` workers + verify.

**Bevidst UDE af fase 1 (forbliver på Sheets/KV):** pause-status, targets, snapshots, treat-as-alive-domæner, send-queue-fanen, skip-log, udgifter (`subscriptions.ts`), settings. De er ikke CRM-kerne, har få kaldere og ingen joins. Flyttes kun hvis en senere fase har brug for det.

---

## Filstruktur

| Fil | Ansvar |
|---|---|
| `src/lib/db/schema.ts` | Drizzle-tabeller (alle i spec §3 der bruges i fase 1) |
| `src/lib/db/client.ts` | `getDb()` → postgres.js (DATABASE_URL) eller PGlite; `__setDb()` til tests; `usePg()` |
| `src/lib/db/test-db.ts` | `freshTestDb()` — in-memory PGlite med migrationer kørt |
| `drizzle/` | Genererede SQL-migrationer (drizzle-kit) |
| `drizzle.config.ts` | drizzle-kit config |
| `scripts/db-migrate.mjs` | Kører migrationer mod DATABASE_URL |
| `src/lib/pg/leads.ts` | PG-udgave af lead-funktionerne i sheets.ts |
| `src/lib/pg/clients.ts` | PG-udgave af client-funktionerne i sheets.ts |
| `src/lib/pg/queue.ts` | PG-udgave af readQueue/writeQueue |
| `src/lib/pg/invoices.ts` | PG-udgave af invoice/subscription-lager |
| `src/lib/pg/crm.ts` | PG-udgave af kontakter/aktiviteter/opgaver |
| `src/lib/pg/*.test.ts` | Tests pr. modul mod PGlite |
| `scripts/migrate-to-pg.mjs` | Backup + tørkørsel + idempotent flytning Sheets/KV → PG + dublet-rapport |
| `src/lib/auth/magic.ts` | Token-udstedelse/indløsning, brugere fra env |
| `src/app/login/page.tsx`, `src/app/api/auth/magic/route.ts`, `src/app/api/auth/verify/route.ts`, `src/app/api/auth/logout/route.ts` | Login-flow |
| `src/proxy.ts` (modify) | Accepter bruger-session ved siden af Basic; sæt `x-cc-user` |
| `src/lib/current-user.ts` | `currentUser()` læser `x-cc-user` i route handlers/server components |

---

### Task 1: Baseline

**Files:** ingen ændringer.

- [ ] **Step 1:** `npm ci` i worktree `lead-system-crm`.
- [ ] **Step 2:** `npm run verify` — notér resultat (antal tests, evt. præ-eksisterende fejl) i `docs/superpowers/plans/fase-1-log.md`. Præ-eksisterende fejl rettes IKKE her; de noteres.
- [ ] **Step 3:** Commit log-filen: `git commit -m "chore(crm): fase 1 baseline"`.

### Task 2: DB-kerne — skema, klient, migrationer (orkestrator)

**Files:**
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/test-db.ts`, `drizzle.config.ts`, `scripts/db-migrate.mjs`, `src/lib/db/client.test.ts`
- Modify: `package.json` (deps + scripts `db:generate`, `db:migrate`)

**Interfaces — Produces:**
- `getDb(): Db` (Drizzle-instans, samme API for postgres.js og PGlite)
- `usePg(): boolean` — `process.env.DATA_BACKEND === "pg"`
- `__setDb(db: Db | null): void`
- `freshTestDb(): Promise<Db>` — PGlite in-memory + alle migrationer
- Tabeller: `appUser, company, contact, deal, activity, task, outreach, invoice, invoiceLine, subscriptionPlan, site, loginToken, counter, kvLegacyMap`

- [ ] **Step 1: Deps**
```bash
npm i drizzle-orm postgres
npm i -D drizzle-kit @electric-sql/pglite
```
- [ ] **Step 2: Failing test** `src/lib/db/client.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "./test-db.ts";
import { company } from "./schema.ts";

test("skema kan oprette og læse en virksomhed med fast row_no", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: 7, name: "Salon Artec", city: "Herning" });
  const rows = await db.select().from(company);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNo, 7);
  assert.equal(rows[0].lifecycle, "ny");
});

test("row_no er unik", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: 3, name: "A" });
  await assert.rejects(db.insert(company).values({ rowNo: 3, name: "B" }));
});
```
- [ ] **Step 3:** `npm test` → FAIL (modul findes ikke).
- [ ] **Step 4: Skema** `src/lib/db/schema.ts` — kolonner præcis som spec §3, plus:
  - `company`: `rowNo integer notNull unique`, `lifecycle text default 'ny'`, `leadStatus text default 'new'` (rå `LeadStatus` for loss-fri roundtrip), `lead jsonb` NEJ — alle Lead-felter som typede kolonner: name, branch, phone, city, score(int), source, website, websiteStatus, notes, lastUpdated, websiteQualityTier, enrichedInfo(text), email, emailSentAt, emailOpenedAt, emailClickedAt, emailStatus, followupSentAt, reviewsCount(int), callbackDate, skipReason, archived(bool default false), clientNo(int unique null), briefFilled(bool), createdAt, updatedAt.
  - `deal`: + `isPrimary boolean default false`, `stage text` (ingen CHECK i fase 1 — rå Client.stage), `package text`, `source text`, `setupFeeRaw text`, `monthlyFeeRaw text` (Client-felterne er strenge i dag; bevar dem ordret).
  - `site`: `status text` (rå Client.websiteStatus), `projectFolder text`.
  - `outreach`: typede søgekolonner (id text PK = QueueDraft.id, companyRowNo int null, status, sender, sentBy, createdAt, updatedAt) + `draft jsonb notNull` (hele QueueDraft, loss-fri).
  - `invoice`: `number text PK`, `companyId uuid null`, `clientName text` (overgang), `status`, `issueDate`, `dueDate`, `data jsonb notNull` (hele Invoice), `dineroId text null`.
  - `subscriptionPlan`: `clientName text PK` (overgang), `companyId uuid null`, `data jsonb notNull`.
  - `activity`/`contact`/`task`: + `clientName text` (overgang, crm.ts nøgler på navn) + `legacyId text unique null` (CrmActivity.id etc.).
  - `counter`: `name text PK`, `value integer notNull`.
  - `loginToken`: `tokenHash text PK`, `userEmail text`, `expiresAt timestamptz`, `usedAt timestamptz null`.
- [ ] **Step 5: Klient** `src/lib/db/client.ts`:
```ts
import "server-only";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

export type Db = ReturnType<typeof pgDrizzle<typeof schema>>;
let _db: Db | null = null;

export function usePg(): boolean {
  return (process.env.DATA_BACKEND || "").toLowerCase() === "pg";
}

export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATA_BACKEND=pg men DATABASE_URL mangler");
  // prepare:false = kompatibel med Neons pgbouncer-pooler
  _db = pgDrizzle(postgres(url, { prepare: false, max: 5 }), { schema });
  return _db;
}

export function __setDb(db: Db | null): void {
  _db = db;
}
```
  `test-db.ts`: PGlite in-memory → `drizzle-orm/pglite` → `migrate(db, { migrationsFolder: "drizzle" })` → cast til `Db` (samme query-API); kalder `__setDb(db)` og returnerer den.
- [ ] **Step 6:** `drizzle.config.ts` (dialect postgresql, schema `src/lib/db/schema.ts`, out `drizzle`), `npx drizzle-kit generate` → `drizzle/0000_*.sql`. `scripts/db-migrate.mjs` kører `migrate` fra `drizzle-orm/postgres-js/migrator` mod `DATABASE_URL`. Scripts: `"db:generate": "drizzle-kit generate"`, `"db:migrate": "node scripts/db-migrate.mjs"`.
- [ ] **Step 7:** `npm test` → PASS. `npm run verify` → grøn.
- [ ] **Step 8: Commit** `feat(db): Postgres-skema + klient (Neon/PGlite) bag DATA_BACKEND`.

### Task 3: Leads på PG (worker, Sonnet/Luna)

**Files:** Create `src/lib/pg/leads.ts`, `src/lib/pg/leads.test.ts`. Modify `src/lib/sheets.ts` (én linje øverst i hver af funktionerne nedenfor).

**Interfaces:** Consumes `getDb, usePg, company` (Task 2). Produces PG-funktioner med IDENTISKE signaturer som sheets.ts: `getLeads, updateLeadStatus, appendLeads, getLeadNames, getLeadPhones, saveEnrichedInfo, batchUpdateLeadVerifications, batchSetLeadStatus, saveLeadEmail, batchSaveEmails, updateLeadEmailStatus, updateLeadEmailStatusBulk, updateCallbackDate, updateLeadSkipReason, updateLeadWebsiteStatus, deleteLeadRows, moveLeadsToDeadLeads, purgeAndArchiveLeads`.

Regler (verbatim til worker):
1. `rowIndex` ⇔ `row_no = rowIndex + 2`. `Lead.id = String(row_no)`. `sheetRowNumbers` (deleteLeadRows) = `row_no` direkte.
2. `getLeads()` returnerer kun `archived = false`, sorteret `row_no ASC` — samme form som Sheets-mapperen (tomme strenge, ikke null).
3. `appendLeads` tildeler `row_no = max(row_no)+1…` i én transaktion.
4. `deleteLeadRows`/`moveLeadsToDeadLeads`/`purgeAndArchiveLeads` sletter IKKE — sætter `archived = true` (+ `lifecycle='ikke_egnet'`); returværdier som i sheets.ts.
5. Læs HVER sheets.ts-funktions krop først og spejl dens semantik (hvilke kolonner, timestamps, "kun hvis tom"-logik). Ingen nye features.
6. I sheets.ts: første linje i hver funktion: `if (usePg()) return (await import("./pg/leads.ts")).<samme navn>(<samme args>);`
7. Test pr. funktion mod `freshTestDb()`: seed 3 leads, kald, assert på DB-rækker + returværdi. Mindst: getLeads-form, appendLeads row_no-tildeling, updateLeadStatus, updateLeadEmailStatusBulk, deleteLeadRows arkiverer (vises ikke i getLeads, row_no genbruges ikke af appendLeads).

- [ ] Step 1: tests (failing) · Step 2: implementering · Step 3: `npm run verify` · Step 4: commit `feat(pg): leads bag DATA_BACKEND`.

### Task 4: Kunder på PG (worker)

**Files:** Create `src/lib/pg/clients.ts` + test. Modify `src/lib/sheets.ts` (client-funktionerne).

**Interfaces:** Produces samme signaturer: `getClients, addClient, addClientManual, removeClient, updateClientFees, updateClientDeal, updateClientFolder, markBriefFilled`.

Mapping (verbatim): Client-række ⇔ `company` (clientNo = client-rækkenummer, `lifecycle='kunde'`, name/branch/phone, briefFilled) + primær `deal` (`isPrimary=true`: stage, wonAt←wonDate, expectedClose, source, owner, package, lostAt←lostDate, setupFeeRaw, monthlyFeeRaw) + `site` (status←websiteStatus, projectFolder). `Client.id = String(clientNo)`. `addClient(lead)` genbruger lead-virksomheden (match row_no = Number(lead.id)) og sætter clientNo = max+1. `removeClient(name)` matcher via `canonicalClientName`, sætter `clientNo = null`, `lifecycle='tabt'`, returnerer `{removed}`. Læs sheets.ts-kroppene og spejl semantikken. Tests: roundtrip getClients efter addClientManual, updateClientDeal patch, removeClient.

- [ ] tests · implementering · verify · commit `feat(pg): kunder bag DATA_BACKEND`.

### Task 5: Kladde-kø på PG (worker)

**Files:** Create `src/lib/pg/queue.ts` + test. Modify `src/lib/queue.ts` (`readQueue`, `writeQueue`).

Regler: `readQueue()` = alle `outreach.draft` sorteret `createdAt ASC` (spejl nuværende rækkefølge — læs queue.ts). `writeQueue(drafts)` = i én transaktion: upsert hver (id → draft jsonb + typede kolonner, `companyRowNo = Number(leadId)` hvis numerisk), slet rækker hvis id ikke er i `drafts`. `appendDrafts`/`updateDraft` røres ikke (de bruger read/write). Tests: roundtrip lossless (deepEqual), sletning af manglende id, rækkefølge.

- [ ] tests · implementering · verify · commit `feat(pg): kladde-kø bag DATA_BACKEND`.

### Task 6: Fakturaer + kundeabonnementer på PG (orkestrator — penge)

**Files:** Create `src/lib/pg/invoices.ts` + test. Modify `src/lib/invoices.ts` (store-backed funktioner linje ~212-260).

Regler: `nextInvoiceNumber` = `UPDATE counter SET value = value + 1 WHERE name='invoice' RETURNING value` (INSERT ON CONFLICT først) — atomisk, genbruger aldrig numre. `saveInvoice` upsert på number, `companyId` = virksomhed hvis `canonicalClientName` matcher en kunde, ellers null. `deleteInvoice` sletter række + asset (som i dag). `listInvoices` sortering identisk. `listInvoicesFor` filtrerer på companyId hvis kunden findes, ellers canonical-navn. `getSubscriptions/saveSubscriptions` = hele listen (saveSubscriptions erstatter alle rækker i én transaktion). Tests: nummerering 001→002 uden genbrug efter delete, lossless roundtrip, listInvoicesFor alias ("Vida" vs "VIDA Skønhedsklinik"), eksisterende `validInvoiceLines`/`applyStatusChange`-tests forbliver grønne.

- [ ] tests · implementering · verify · Codex `gpt-6-sol` review af diff · commit `feat(pg): fakturaer på Postgres (atomisk nummerering)`.

### Task 7: CRM-kontakter/aktiviteter/opgaver på PG (worker)

**Files:** Create `src/lib/pg/crm.ts` + test. Modify `src/lib/crm.ts` (`listContacts, saveContact, deleteContact, listActivities, addActivity, appendSystemActivity, listTasks, saveTask, updateTask, deleteTask`).

Regler: samme signaturer og valideringer (validering sker før delegation — flyt kun lager-delen). `legacyId` = eksisterende id-felt. `appendSystemActivity` idempotent på `eventKey` (spejl nuværende logik). `companyId` sættes via canonical-navn når muligt. Tests: create→list→delete for hver.

- [ ] tests · implementering · verify · commit `feat(pg): crm-kontakter/aktiviteter/opgaver bag DATA_BACKEND`.

### Task 8: Migreringsscript (orkestrator)

**Files:** Create `scripts/migrate-to-pg.mjs`, `scripts/migrate-to-pg.test.mjs`.

Flow: (1) læs Sheets Leads + Clients via eksisterende `sheets.ts` (DATA_BACKEND=sheets), KV via `store` (queue, `invoice/*`, `invoice-subscriptions`, `invoice-counter/all`, crm-nøgler); (2) skriv fuld JSON-backup til `--backup-dir` (default scratchpad) FØR noget andet; (3) `--dry-run` (default) udskriver tællinger + dublet-rapport og skriver intet; (4) `--apply` upserter på `row_no`/`clientNo`/`number`/`legacyId` (idempotent — to kørsler = samme tilstand), sætter `counter.invoice = max(KV-counter, højeste fakturanummer)`; (5) efter apply: sammenlign tællinger kilde↔PG, exit 1 ved afvigelse. Dublet-rapport: grupper på lower(email) og normaliseret navn+by; ved ≥2 → Jev-spørgsmål "samme forretning?" (valgfrit `--jev`, kræver TYPESAFE_API_KEY) → CSV i backup-dir. **Ingen automatisk sammenlægning.**

Test: kør mod fixture-data (in-memory store + fake sheets-rækker via injicerbare loaders) — dry-run skriver 0 rækker; apply to gange = samme tællinger; counter = max.

- [ ] tests · implementering · verify · commit `feat(pg): migreringsscript med backup, tørkørsel og dublet-rapport`.

### Task 9: Magic-link-login pr. bruger (orkestrator — sikkerhed)

**Files:** Create `src/lib/auth/magic.ts` + test, `src/lib/current-user.ts`, `src/app/login/page.tsx`, `src/app/api/auth/{magic,verify,logout}/route.ts`. Modify `src/proxy.ts` (matcher-undtagelser `login`, `api/auth/magic`, `api/auth/verify`; session-payload får `u`).

Regler:
- Brugere fra env: `CC_USERS="lucas:<email>,charlie:<email>"` (fallback: `GMAIL_USER`→lucas, `CHARLIE_GMAIL_USER`→charlie). Ukendt email ⇒ samme svar som kendt ("Tjek din mail") — ingen enumeration.
- Token: 32 random bytes base64url; kun SHA-256-hash gemmes (`loginToken`, eller KV `login-token/<hash>` når DATA_BACKEND≠pg); TTL 15 min; engangs (`usedAt`).
- Mail via eksisterende Gmail-transport (lucas-afsender) til brugerens egen adresse. Link = `${APP_URL}/api/auth/verify?t=<token>`.
- Verify: gyldig ⇒ sæt eksisterende `cc_sess`-cookie med payload `{ u: "lucas"|"charlie", exp }` (samme HMAC-format som i dag, udvidet) ⇒ redirect `/`. Ugyldig/brugt/udløbet ⇒ `/login?fejl=1`.
- Proxy: gyldig session med `u` ⇒ sæt request-header `x-cc-user` (strip indkommende først, som auth-markøren). Basic auth virker fortsat i fase 1 (bruger = "delt"); fjernes i fase 2 når begge har logget ind. Sider uden session ⇒ redirect `/login` (i stedet for Basic-prompt) når `CC_USERS`/mail er konfigureret.
- Rate limit: genbrug proxy'ens KV-IP-limit på `/api/auth/magic` (5/60 s).
- Tests: token hash/TTL/engangs, ukendt email = samme respons, cookie-payload parse, header-strip.

- [ ] tests · implementering · verify · Codex `gpt-6-sol` + frisk Opus-review · commit `feat(auth): magic-link-login pr. bruger`.

### Task 10: Cutover (gates — kræver Lucas)

- [ ] **Gate A (Lucas):** OK til `vercel integration add neon` (Neon Free, region eu-central-1 / Frankfurt) på projekt `lead-finder`. Uden OK: stop her; alt ovenfor er merge-klart bag flag.
- [ ] `npm run db:migrate` mod Neon. `node scripts/migrate-to-pg.mjs` (dry-run) → læs rapport → `--apply`.
- [ ] Preview-deploy med `DATA_BACKEND=pg` (preview-env): `/leads`, `/clients`, `/approve`, `/fakturaer`, `/crm` 200 + tal matcher prod-sheets-tal. Screenshot.
- [ ] **Gate B:** VPS: `DATABASE_URL` + `DATA_BACKEND=pg` i `/root/lead-system/credentials.env`, `git pull`, `vps-run.sh` manuelt én gang, læs log, tjek at nye leads lander i PG.
- [ ] Prod: `DATA_BACKEND=pg` (via `vercel env add ... --value`, aldrig stdin), redeploy, samme tjek. Rollback-kommando noteret i log.
- [ ] Sheets bliver skrivebeskyttet i praksis (ingen kode skriver dertil med pg). Behold som arkiv.
