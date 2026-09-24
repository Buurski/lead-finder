# Personligt Kinly HQ Implementation Plan

> For agentic workers: use test-driven development; implement in isolated worktrees, review differences before integration.

**Goal:** Personligt login og private rum til Lucas/Charlie i fælles Kinly HQ, Hermes med sikre handlinger og ingen udgående beskeder.

**Architecture:** Bevar eksisterende fælles CRM og session-cookie, udvid `app_user` additivt med password/setup-hash og byg private nøgler/queries på server-verificeret bruger. Del Hermes på to rigtige profiler; giv agenten smalle HQ-handlinger via server-allowlist og audit, ikke fri mail-adgang.

**Tech Stack:** Next.js 16, React 19, TypeScript, Drizzle/Postgres, KV store, Node `crypto.scrypt`, Hermes API v3 på VPS.

## Global Constraints
- Ingen automatisk mail/besked eller invite-notifikationer. Ingen betalte kald, ingen sletning af eksisterende data, ingen live-kundesider.
- Ingen fulde credentials i chat, kildekode, tests eller commits; første-login-koder kun i chmod 600 fil uden for repo.
- `lucas@kinly.dk`, `charlie@kinly.dk`; fælles CRM uændret; private samtaler/noter/councils og HQ-kalender.
- Legacy Basic bevares som midlertidig nødvej indtil BEGGE personlige logins virker.
- Build og tests grønne før main; kun egne filer stages. Prod-QA med afviste payloads, aldrig accepterede mutationer af eksisterende data.

---

### Task 1: Login og setup uden mail

**Files:** `src/lib/db/schema.ts`, ny additiv `drizzle/*.sql`, `src/lib/auth/password.ts` + test, `src/app/api/auth/password/route.ts`, `src/app/api/auth/setup/route.ts`, `src/app/login/page.tsx`, `src/proxy.ts`, `src/lib/hermes-client.ts`, `scripts/hq-bootstrap.mjs` + test.

**Interfaces:** `app_user` har id/email/password_hash/setup_hash/setup_expires_at; `POST /api/auth/password {email,password}` sætter personlig signeret `cc_sess`; `POST /api/auth/setup {email,code,password}` atomisk forbruger kode og sætter hash/session. CLI udsteder koder offline til fil og skriver kun hash til DB. For private routes skal `currentUser()` altid returnere `lucas`/`charlie`, aldrig `delt`.

- [ ] Step 1: Test scrypt hash/verify og hash mismatch; test setup replay og cross-user afvist med PGlite. Run `node --test --experimental-strip-types --conditions react-server src/lib/auth/password.test.ts` og se forventet FAIL.
- [ ] Step 2: Udvid tabel additivt; implementér scrypt/DB CAS og ruter. Ingen sendMail. `email` normaliseres og slås op i `app_user`, ikke requestens `userId`.
- [ ] Step 3: Behold gamle tokenruter uændret bag eksisterende flag, men login-siden bruger kun kode/password. Proxy accepterer gyldige sessions uafhængigt af Basic-env; prod fejler lukket uden session-secret. Basic stadig nødvej.
- [ ] Step 4: Fjern hardcoded Basic Authorization i klientbundle. Test forkert password, ukendt mail, udløbet/forbrugt setup-kode, to forskellige sessions, gammel Basic-kode som nødvej.
- [ ] Step 5: Kør målrettede tests og lint; commit ændringer kun på auth-branch, ingen push/deploy/migration mod prod.

### Task 2: Privat samtale og personligt rum

**Files:** `src/lib/hermes.ts`, `src/app/api/hermes/ask/route.ts`, `src/app/api/hermes/sessions/route.ts`, `src/app/api/hermes/chat/route.ts`, `src/app/api/hermes/chat/stream/route.ts`, `src/components/shell/HermesDock.tsx`, `src/components/shell/AppShell.tsx`, `src/app/layout.tsx`, `src/app/api/mit-rum/route.ts`, `src/app/mit-rum/page.tsx`, relevante tests.

**Interfaces:** Kun `currentUser()` bestemmer profil/owner. Session-liste, transcript og append er owner-scopet; session-ID uden ejer er afvist som privat. Private noter/council-udkast gemmes i `store` under `private/<user>/...`, udelukkende personens egne nøgler må tilgås fra API. Delte CRM-data forbliver fælles.

- [ ] Step 1: Skriv regressionstest der beviser at Lucas ikke kan læse/skrive Charlies sessionId eller noter, selv om ID er kendt. Run test og se FAIL.
- [ ] Step 2: Bind website-session og Hermes-profile til signeret `currentUser()`, ikke body/query. Nye messages/session-nøgler owner-scope; bevar gamle KV-nøgler urørte men vis dem ikke som private.
- [ ] Step 3: Scope dockens sessionStorage pr. person og ryd ved logout. `delt`/ukendt får intet privat rum; fælles CRM fortsætter.
- [ ] Step 4: Byg én lille `Mit rum`-side med private noter og council-udkast (ingen ekstern deling); afvis blandede owner-ID'er server-side.
- [ ] Step 5: Kør tests/lint; commit på privacy-branch, ingen push/deploy.

### Task 3: Hermes og handlinger

**Files:** `/opt/hermes-api/hermes_api.py`, `src/app/api/hermes/ask/route.ts`, smalle `src/app/api/agent-actions/*`, `src/lib/hq/tasks.ts`, evt. additiv private kalender-tabel + UI og tests.

- [ ] Step 1: Opret uafhængige Hermes-profiler for Lucas og Charlie uden kopieret privat hukommelse eller Charlie-adgang til Lucas' Composio. Verificér hver profil lokalt uden betalingskald hvis muligt.
- [ ] Step 2: Giv Hermes read-only CRM-kontekst samt tilladte actions `task.create`, `task.update`, `task.complete`, `calendar.create`, `calendar.update`; server-bound actor, validerede IDs og input; afvis email/send/delete/fri kommando.
- [ ] Step 3: Først test afvisninger på prod/sandbox, derefter create/update/read-back på TESTDATA i PGlite. Ingen events med attendees eller automatiske invitationer.
- [ ] Step 4: Angiv ærligt i UI at ekstern Google Calendar endnu ikke er koblet for Charlie; kræver hans eget login, aldrig Lucas' konto.

### Task 4: Integration og udrulning

- [ ] Step 1: Merge begge branches til integration i rækkefølge; læs diff for kollisioner, bevar andres ændringer.
- [ ] Step 2: `npm run lint`, `/root/.hermes/scripts/tung.sh npm run typecheck`, `npm test`, `/root/.hermes/scripts/tung.sh npm run build` uden pipe; failures skal rettes før push.
- [ ] Step 3: Rebase fra origin/main, kun egen branch integreres; én production-push efter grøn build. DB-migration additiv og sikkerhedskopieret, generer opsætningskoder til lokal fil uden at udskrive dem.
- [ ] Step 4: Verificér Vercel READY-commit og login-/privacy-afvisninger live; ingen ægte kundemutationer eller send. Verificér begge konti før legacy-login udfases; ellers rapportér konkret blokering.
