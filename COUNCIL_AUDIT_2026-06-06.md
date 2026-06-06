# Council Audit — 2026-06-06

5 roller, sekventielt (token-disciplin). Klassificering: **P0** kritisk · **P1** høj ·
**P2** nice-to-have · **DELETE**. Branch `command-center-v3` @ `fd7b477`.

---

## 1. Architect (redundans / overlap)

- **A1 [DELETE]** Deep Research-systemet er nu UI-løst (panel fjernet fra /leads):
  `src/components/DeepResearchPanel.tsx`, `src/lib/cowork-prompt.ts`,
  `src/lib/deep-research-queue.ts`, `/api/leads/queue-deep-research`,
  `/api/leads/cowork-batch`. → erstattet af lead-gen ingest + daily-ops. **Behold**
  `/api/leads/deep-research-result` (motoren læser `enrichedInfo.deepResearch`).
- **A2 [P2]** Demo-URLs duplikeret 3 steder: `demos.ts`, `email.ts`, `messenger/compose.ts`.
  Én kilde (`demos.ts`) bør eje dem; de andre importerer.
- **A3 [P2]** To branch→demo-mappere: `pickDemoPair` (demos.ts) + `demoUrlFor`
  (messenger/compose.ts). Konsolidér.
- **A4 [P1]** "Hvad er en kvalificeret lead?" ejes to steder: review-floor i
  `apify.ts:28-35` + `qualify.ts`. Flyt floor ind i qualify (pending-todo P2.3).
- **A5 [P2]** `/api/leads/[id]/analyze` + `/enrich` overlapper `verify-all`
  (pending-todo P2.1). LeadTable bruger dem stadig (side-panel) — verificér før delete.

## 2. Security

- **S1 [P1]** Producer-POST-endpoints (`/api/leads/ingest`, `/api/inbox/digest`,
  `/api/leads/deep-research-result`) tillader ALT når secret er unset. De er bag
  basic-auth-proxy, men **verificér at `LEADGEN_INGEST_SECRET` / `INBOX_DIGEST_SECRET`
  / `DEEP_RESEARCH_SECRET` er sat i prod** (ellers kan enhver med login poste).
- **S2 [P1]** `/api/cron/*` er UNDTAGET basic-auth (proxy-matcher) → beskyttet KUN af
  `CRON_SECRET`. **Verificér `CRON_SECRET` er sat i prod**, ellers kan `/api/cron/engine`
  og `/api/cron/inbox-triage` kaldes uautentificeret (fylder kø / bruger tokens; sender
  ikke mail).
- **S3 [P2]** `?force=1` på cron-routes bypasser secret — OK fordi de bruges fra
  app-knapper bag basic-auth, men dokumentér det.
- **S4 [OK]** Mobile-login-rate-limit fixet (`7456853`). Auth-proxy ellers solid
  (HMAC-session, ct-compare, KV-rate-limit på forkerte passwords).

## 3. UX

- **U1 [P0 — FIXED]** Mobile view-switcher flyttet til toppen (`84e440f`).
- **U2 [P2]** `/leads` capped til top-1000; klient-søgning finder kun i de 1000.
  Server-side søgning ville være bedre, men cap fjerner mobil-crashet nu.
- **U3 [P1 — adressed]** Messenger/Lead-gen-sider var tomme fordi daily-ops ikke kørte
  (data/-mappe manglede). Fixet (`ac4bb62`) — kører daily-ops og fylder dem.
- **U4 [P2]** 13 nav-items. Overvej at gruppere/skjule lidt (Hermes "snart", evt.
  Memory/SEO/Studio hvis sjældent brugt).

## 4. Performance

- **P1 [P2]** `deck.buildDeckSummary` laver nu getLeads + getClients + readQueue +
  loadDigest + readVaultJson + getSuppressed pr. Mission Control-load. Overvej en kort
  (30-60s) cache på hele deck-summary.
- **P2 [OK]** vault-json cache 90s, vault-note 5min, readVaultJson cached. Fint.
- **P3 [P2]** LeadTable filtrerer over 1000 rækker pr. tastetryk — fint nu (var 8000).

## 5. Devil's advocate (slet / over-engineering)

- **D1 [DELETE]** Deep Research-filerne (se A1) — ~5 filer, ikke længere i UI.
- **D2 [P2]** `/hermes` ghost-side (nav "snart") — skjul fra nav til den bygges
  (pending-todo P2.1).
- **D3 [P2]** `.send_queue/_*.mjs` scratch-scripts (gitignored, lokale) — clutter, ikke
  shippet. Kan ryddes lokalt.
- **D4 [behold]** Test-suiterne (37 nu) — god dækning, behold.
- **D5 [P2]** Gamle plan-/report-filer i root (`NIGHT_BUILD_REPORT_v2.md`,
  `PLAN_DAGENS.md`, `DASHBOARD_OVERHAUL_GOAL.md` m.fl.) — arkivér eller slet (se
  CLEANUP_PROPOSAL).

---

## Top 10 (handlingsprioritet)
1. [S2] Verificér `CRON_SECRET` sat i prod.
2. [S1] Verificér ingest/digest-secrets sat i prod.
3. [DELETE/A1/D1] Fjern Deep Research-dødkode (efter Lucas-OK).
4. [U3] Bekræft daily-ops nu skriver data/ + app viser det.
5. [A4] Konsolidér review-floor → qualify.
6. [A2/A3] Konsolidér demo-URLs + branch→demo-mapper.
7. [P1-perf] Cache deck-summary 30-60s.
8. [D2] Skjul Hermes fra nav.
9. [U2] Server-side lead-søgning (senere).
10. [D5] Ryd root-junk (CLEANUP_PROPOSAL).

Ingen P0-sikkerhedshul fundet (auth solid efter mobile-fix). Største værdi: slet
Deep Research-dødkode + verificér prod-secrets.
