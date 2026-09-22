# Kinly HQ — Fase 2: Skal, design, HQ, Virksomheder, Pipeline, Hermes-dock

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Byg den nye Kinly HQ-oplevelse oven på Postgres: nyt designsystem og skal, en HQ-forside på rigtige data, virksomhedsprofil med tidslinje og kundeviden, én pipeline med deals og næste skridt, Hermes-dock i stedet for Claude-chat samt "Flet virksomheder".

**Architecture:** Designet skiftes via tokens i `globals.css`, så alle gamle `cc-*`-sider arver det nye look uden omskrivning. Nye sider læser Postgres via små aggregat-moduler i `src/lib/hq/*` (rene funktioner + PGlite-tests). Skrivninger går gennem én `record()` pr. hændelse. Hermes-docken bor i `AppShell` og overlever navigation.

**Tech Stack:** Next 16.2.4 (App Router, `proxy.ts`), React 19, Tailwind 4, Drizzle/Neon, node:test + PGlite, Playwright til screenshots.

**Spec:** `docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md` (§4, §5, §6, §10). **Visuel reference:** `scratchpad/mockup/hq.html` + `hq-desktop.png`, med disse 5 rettelser: (1) rail fuld højde + sticky, (2) ingen tom venstre-kolonne (Penge flyttes under tabellen på desktop), (3) fanerne "I dag/Team/Penge" fjernes, (4) mobil: næste-skridt-rækker på én linje, (5) "Claude: færdig" → "Sessioner".

## Global Constraints

- `npm run verify` grøn efter hver task. Ingen ny npm-afhængighed uden begrundelse i commit.
- Farver KUN via tokens fra spec §5. Ember `#D4500F` bruges ingen steder. Kinly-mærke: `public/brand/kinly-mark-rail.svg` (rail) / `kinly-mark-light.svg`.
- Plus Jakarta Sans til alt; JetBrains Mono (next/font) kun til meta (datoer, tider, tællere i små bogstaver). Tal: `tabular-nums`.
- Al UI-tekst på dansk, kort, uden AI-slop (anti-slop-skill på nye tekster). Tomme tilstande siger hvad der mangler og hvad man gør.
- Ingen Claude-chat i UI'et. Hermes er eneste assistent.
- Ingen skrivning til Sheets. Ingen auto-send. Kladder forbliver kladder.
- Tilgængelighed: fokus-ringe, `aria-label` på ikon-knapper, kontrast ≥ 4.5:1 på brødtekst.
- Screenshot-loop på desktop (1440) + mobil (390) for hver side: max 2 runder.

---

### Task 1: Designfundament + skal (worker: Sonnet + frontend-design/impeccable)

**Files:** `src/app/globals.css` (tokens), `src/app/layout.tsx` (JetBrains Mono), `src/components/shell/{AppShell,Sidebar}.tsx` (rail/topbar/bundbar), `src/lib/nav-config.ts` (ny IA), `DESIGN.md` (erstattes), `next.config.ts` (redirects). Slet: `src/components/shell/ChatDock.tsx`, `src/app/api/chat/`, `src/app/radar/`, `src/app/send/`, `src/app/claude/`, `BUILD_STATUS.json`.

- Nav: HQ `/` · Pipeline `/pipeline` · Virksomheder `/virksomheder` · Indbakke `/approve` (omdøbes i fase 3) · Leadgen `/leadgen` · Økonomi `/okonomi` · Agenter `/agenter` (midlertidigt → `/hermes`). Mere: Studio, SEO, Indsigter.
- Redirects (permanent=false indtil fase 3): `/send→/approve`, `/radar→/leadgen`, `/claude→/hermes`, `/salg→/pipeline`, `/leads→/pipeline`, `/clients→/virksomheder`, `/clients/:id→/virksomheder/c/:id`.
- Done: alle eksisterende sider 200 og læsbare i nyt look (screenshot af `/approve`, `/fakturaer`, `/hermes` + mobil).

### Task 2: HQ-data (orkestrator)

**Files:** `src/lib/hq/summary.ts` + `summary.test.ts`.
**Produces:** `getHqSummary(db, now): Promise<HqSummary>` med `{ kpi: { draftsPending, newReplies, newReplyInterested, inbound, overdueNextSteps }, funnel: Array<{ stage, n }>, nextSteps: Array<{ companyId, company, deal, step, owner, due, state: "forfalden"|"snart"|"ok" }>, money: { mrr, outstanding, overdueCount }, team: Array<{ person, current, lastTouchedAt }> }`. Agenter/Omverden hentes separat (Hermes/vault, kan fejle uden at vælte siden).
- Tests mod PGlite: funnel tæller kun `row_no > 0 && !archived`, forfalden-beregning i Europe/Copenhagen, MRR = sum af aktive `subscription_plan`-linjer.

### Task 3: HQ-side (worker)

**Files:** `src/app/page.tsx` (erstatter deck), `src/components/hq/*`. Server component; Hermes/omverden i `Suspense` med skeleton + fejltilstand.

### Task 4: Virksomheder + profil (worker, data-del orkestrator)

**Files:** `src/lib/hq/dossier.ts` (+test): `getDossier(db, companyId)` → company, deals, contacts, activities (20 seneste), invoices + saldo, site, vault-noter (fra `vault.ts`, match på slug/navn). `src/app/virksomheder/page.tsx` (liste: søg, filtre livsfase/kunde/ejer), `src/app/virksomheder/[id]/page.tsx` (profil), `src/app/virksomheder/c/[clientNo]/page.tsx` (redirect fra gammelt kunde-id).
- Profil: header (livsfase, Jev-karakter, site-status, MRR), deals m. næste skridt, tidslinje, kontakter, fakturaer, site-kort, kundeviden (vault-note renderet) + knap "Opdater vidensbase" (Task 7).
- "Log arbejde": activity `arbejde` (+ valgfrit beløb = billable) via `POST /api/virksomheder/[id]/activity` (assertWriteRequest, actor = currentUser()).

### Task 5: Pipeline + deals (worker, API orkestrator)

**Files:** `src/app/pipeline/page.tsx`, `src/app/api/deals/route.ts` + `[id]/route.ts`, `src/lib/hq/deals.ts` (+test).
- Funnel-bar (livsfaser) + kanban (deal-faser `tilbud|aftalt|i_gang|leveret|betalt|tabt`). Kort viser næste skridt + forfald; rødt ved overskredet eller manglende næste skridt.
- Opret deal, skift fase, sæt næste skridt → hver ændring = activity `fase` med actor.
- Migrér gamle `Client.stage`-værdier til deal-faser (mapping i `deals.ts`, testet): won/delivering → `i_gang`, live → `leveret`, offer/negotiation → `tilbud`, lost → `tabt`.

### Task 6: Flet virksomheder (orkestrator + Sol-review)

**Files:** `src/lib/pg/merge.ts` (+test), `POST /api/virksomheder/merge`, knap på profil "Flet med…".
- `mergeCompanies(db, keepId, dropId)`: i én transaktion flyttes deals/contacts/activities/tasks/invoices/sites til keep; lead-felter udfyldes kun hvor keep er tom; clientNo bevares hvis kun én har det (begge har → afvis); drop arkiveres (`archived=true`, `lifecycle='flettet'`), row_no bevares; activity `fase` "Flettet med X". Aldrig slet.
- Første brug: KT VVS (kunde −1) ← lead 18 "KT VVS ApS".

### Task 7: Hermes-dock + kontekst-pakke + dossier-endpoint (orkestrator)

**Files:** `src/components/shell/HermesDock.tsx` (erstatter ChatDock), `src/app/api/hermes/ask/route.ts` (bygger kontekst-pakke og kalder `hermesChat`), `src/app/api/hermes/crm-dossier/route.ts` (HMAC, til Hermes' egne jobs), `src/lib/hq/context-pack.ts` (+test, ≤12k tegn).
- Dock: ⌘J, åbner fra højre, samtale i `sessionStorage` + Hermes-session-id; svar der ankommer efter navigation vises med badge. 3 forslag pr. sidetype.
- Svar-tid vises ærligt ("Hermes tænker … 6 s"). Ingen fake streaming.
- "Opdater vidensbase": `POST /api/virksomheder/[id]/kb-draft` → Hermes-udkast → diff-visning → `POST .../kb-commit` via `vault.ts` (kræver klik).

### Task 8: Council + prod

- Council (3 friske Sonnet-linser: design/UX, korrekthed/data, sikkerhed) + Sol på Task 6/7-diff. Ret fund.
- Merge til main, prod-verifikation (status-commit, 401 uden login), screenshots til Lucas.
