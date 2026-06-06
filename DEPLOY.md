# DEPLOY — Command Center til produktion

Ét sted med hele tjeklisten for at få `command-center-v3` i produktion på Vercel
(projekt `lead-finder`, org `buurskis-projects`). Skrevet 2026-06-06.

## Status lige nu

- ✅ Kode pushet til `origin/command-center-v3` (24 commits: 2 nætters hærdning + council + Cowork/demo).
- ✅ `ANTHROPIC_API_KEY` sat i Vercel-prod → live AI virker.
- ✅ KV (Upstash Redis) tilføjet via Vercel → godkendelses-køen kan persistere i prod.
- ⏳ 4 auth-env-vars skal tilføjes (se nedenfor) → ellers er appen offentlig.
- ⏳ Merge til `main` + deploy mangler.

## Det DU gør (Vercel-dashboard — copy/paste, ingen kode)

### 1. Auth (ellers er din CRM offentlig)
vercel.com → projekt `lead-finder` → **Settings → Environment Variables**.
Tilføj disse 4 (Environment: **Production**):

| Name | Value |
|---|---|
| `VERCEL_BASIC_AUTH_USER` | (dit brugernavn) |
| `VERCEL_BASIC_AUTH_PASS` | (dit password) |
| `AUTH_SESSION_SECRET` | (64-tegns tilfældig hex — Claude genererer) |
| `DEEP_RESEARCH_SECRET` | (64-tegns tilfældig hex — Claude genererer) |

`src/proxy.ts` håndhæver KUN login når USER+PASS+SECRET alle tre er sat.

### 2. Blob — spring over
Ikke nødvendig for at shippe. Bruges kun af demo-byggeren i `/studio`. Tilføj
senere hvis du begynder at bygge demoer i prod (Vercel → Storage → Blob).

### 3. KV — færdig
Upstash er tilføjet. Vores kode (`@vercel/kv` i `src/lib/store.ts`) læser de
`KV_REST_API_URL`/`KV_REST_API_TOKEN` Upstash leverer. Ingen kodeændring.
(Du skal IKKE bruge `@upstash/redis`-snippet'en — allerede håndteret.)

## Det Claude gør (med dit go)

1. Merge `command-center-v3` → `main` + push.
2. Deploy til production (`vercel --prod`, eller auto hvis Git-integration er til).
3. Browser-verificér: login → live data → godkendelse populeret → 0 fejl → mobil.

## Verifikation efter deploy

- Åbn prod-URL → login-prompt (LucasCharlie/…) → Mission Control loader.
- `/leads` + `/clients` viser tal (ikke amber fejl-banner).
- `/approve` (godkendelse) er populeret — KV persisterer køen.
- 0 console-fejl. Mobil (390px) ser ren ud.
- `vercel env ls production` viser KV_*, AUTH_*-vars.

## Hvis KV fejler i prod (lav risiko)

`@vercel/kv` v3 mod Upstash burde virke (samme env-vars). Hvis kø-skrivning
fejler i prod-logs: migrér `KVStore` i `src/lib/store.ts` til `@upstash/redis`
(`Redis.fromEnv()` — lille isoleret ændring) + re-deploy.

## Sikkerhed

- Pause-flaget (`PauseSchedule!A2 = 2026-07-01`) er urørt → ingen mails går ud
  uanset deploy. Systemet er read-only i prod.
- Upstash-tokens blev delt i chat under setup → rotér dem i Upstash-dashboardet
  hvis samtalen ikke er privat.
- Login-password kan styrkes senere i samme env-var-skærm.

## Næste skridt efter prod kører (Fase 1)

Se `docs/night-reports/` + KnowledgeOS `pending-todo-ranked.md`:
dead-code-oprydning → composite→scrape → Charlie på → **derefter Hermes** (Fase 2).
