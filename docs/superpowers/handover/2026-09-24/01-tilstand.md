# 01 — Tilstand pr. 24/9-2026 kl. 23 (hvad findes, hvor, hvad kører)

> Skrevet af Claude Opus-sessionen der byggede Kinly HQ 22.–24/9. Verificér før du stoler på
> det: tal og SHA'er er et øjebliksbillede. "Ved"/"tror" er markeret.

## Repos og hvor de bor

| Ting | Sted | Deploy |
|---|---|---|
| **Kinly HQ / lead-finder** (CRM, godkendelse, send, crons) | GitHub `Buurski/lead-finder`. Lokale worktrees under `C:\Users\Buur\Documents\Workflows\`: `lead-system` (main), `lead-system-crm` (branch `feat/crm-hq-2026-09-22`), `crm-ui-*` (gamle agent-worktrees), `crm-hotfix` | Vercel-projekt `lead-finder` → https://lead-finder-three-beta.vercel.app (auto-deploy fra **main**) |
| Samme repo på VPS | `/root/lead-system` (leadgen-scripts, `.env.pg`) + flere Hermes-worktrees `/root/lead-hq-*`, `/root/lead-crm-reply-0924` | — |
| **kinly.dk** | VPS `/root/kinly-site` (Next 16) | Vercel, fra main |
| **buur-cms** (kundernes CMS) | lokalt `Workflows/buur-cms*`, VPS `/root/buur-cms` | Vercel-projekt `kinly-cms` (kinly-cms.vercel.app) |
| Kundesites | VPS `/root/vida`, `/root/ikast-autoservice`, `/root/Jernbane-cafeen`, `/root/Lejen-kok`, `/root/kinly-demo` | Vercel |
| **KnowledgeOS-vault** | `C:\Users\Buur\Documents\KnowledgeOS` (+ VPS `/root/KnowledgeOS`) | aldrig `git push` direkte — `pull --rebase --autostash` først |
| **Hermes** (AI-agent) | VPS `ssh hermes-vps`, `~/.hermes`, profiler: default, lucas, charlie, cofounder, marketing, kundeplejer | 18 cronjobs — Claude rører ALDRIG cron-config/.env; skriv til Hermes i stedet (`ssh hermes-vps 'hermes -p <profil> -z "…"'` eller Hermes-MCP) |

## ⚠ Den vigtigste kendsgerning: main og feature-branchen er gået fra hinanden

- **main** (= prod) har **28 commits** som feature-branchen ikke har — bygget 24/9 af en anden session ("personligt HQ"):
  mail + adgangskode-login med opsætningskode (scrypt), log ud + indstillinger, `/api/agent/*` HMAC-ruter
  (tasks, read, replies) til Hermes, async/streamende Hermes-chat i docken, Svar-indbakke med tråd-resumé,
  "Scan nu" (VPS-digest fra lucas@kinly.dk), "Åbn i Gmail" åbner tråden, "Svaret"-knap.
  Spec: `docs/superpowers/specs/2026-09-23-personligt-hq-design.md` (på main).
- **feat/crm-hq-2026-09-22** har **16 commits** som main ikke har (se 02-mangler, afsnit A).
- `git merge-tree` viser kun 3 tekst-konflikter: `src/proxy.ts`, `src/components/shell/Sidebar.tsx`,
  `src/app/replies/RepliesClient.tsx`. MEN også en **migrations-kollision**:
  - Neon (prod-DB) har 8 migrationer = main's `0000…0007` (`0006_superb_shadowcat`, `0007_seed_app_users`).
  - Feature har `0006_task_priority`, `0007_company_relation`, `0008_seo_snapshot` — **ikke i `_journal.json`, ikke kørt på Neon**.
  - → omdøb til `0008_…`, `0009_…`, `0010_…`, registrér i journal, kør `scripts/db-migrate.mjs` med `DATABASE_URL_UNPOOLED` **før** koden deployes.
- Auth: feature har magic-link (CC_MAGIC); main har erstattet det med personlig adgangskode. **Main's model vinder** (godkendt spec). Fjern/deaktivér magic-link-vejen ved merge, hvis den dublerer.

## Prod-miljø (Vercel `lead-finder`, production)

- `DATA_BACKEND=pg` (Neon `kinly-hq`, fra1). Scratchpad-fil med DB-URL: se afsnit "Hemmeligheder".
- **Mail skiftet 23/9:** `GMAIL_USER=lucas@kinly.dk` + nyt app-password (lokalt i `~/.kinly/lucas-app-password`). kinly.dk har SPF + DKIM (`google._domainkey`) + **DMARC p=quarantine**. Før sendte systemet via buur.aigro@gmail.com med From lucas@kinly.dk ⇒ DMARC-fejl ⇒ spam. Nu aligned for Lucas.
- **Charlie** sender stadig via `1charlie.nielsen@gmail.com` (env `CHARLIE_GMAIL_*`, værdien står i klartekst i Vercel — sæt den til sensitive). Feature-branchen retter From til hans gmail indtil han får et kinly.dk-app-password; **prod (main) har stadig From charlie@kinly.dk = spam-risiko** indtil merge.
- `LIVE_SEND_ARMED=1` (sat 23/9 efter Lucas' ønske) — tænder "Send svar direkte" (findes kun på feature-branchen endnu).
- `CC_USERS`, `CC_MAGIC`, `APP_URL`, `CRM_API_KEY`, `CMS_URL` sat 23/9. `PAGESPEED_API_KEY` findes (bruges af SEO-historik).
- `ANTHROPIC_API_KEY` findes (kan bruges til Hermes-dock intent-parsing, hvis det ikke løses via Hermes selv).

## Data (Neon, 24/9 aften)

- `company` 1.427 · `outreach` 770 (pending 55, approved 1, sent 142, rejected 572) · 4 rigtige kunder (VIDA=2, KT VVS=3, Ikast=5, Jernbanecaféen; Lej en Kok hører under Jernbanecaféens ejer — **findes ikke som virksomhed i CRM'et endnu**).
- Den ene "godkendte" (Frederiksberg Skønhedsklinik) har **ingen modtager-mail** → kan ikke sendes. 14 af de åbne leadgen-kladder manglede mail 23/9; en anden session lavede `941d4f7 fix(leadgen): backfill places-direct draft emails` — verificér hvor mange der stadig mangler.
- 107 gamle kladder arkiveret 23/9 (backup af alle 152 i scratchpad før); 34 kladder omskrevet af Codex Sol.

## Lokal udvikling

- `npm run verify` = lint + typecheck + test + build. Tests: `node --test --experimental-strip-types --conditions react-server <fil>`.
- Lokal DB: PGlite-snapshot af Neon (`scripts/dev-db-snapshot.mjs` → `.pglite-dev`) + pglite-server `-m 1` + `DB_POOL_MAX=1` (samtidighed giver ECONNRESET — kendt, kun lokalt). Launcher i gammel scratchpad `start-local.mjs`.
- Aldrig `npm run dev`; brug `next start` på en build. Windows: junction-`node_modules` knækker Turbopack → rigtig `npm ci` i hvert worktree.

## Hemmeligheder (aldrig i chat/git)

- `~/.kinly/lucas-app-password`, `~/.kinly/crm-api-key`, `~/.typesafe/key` (Jev), Neon-URL i den gamle sessions scratchpad `.env.neon` (kopiér til ny scratchpad; print aldrig).
- Vercel env: `vercel env add NAME production --value "…" -y < /dev/null` (uden `< /dev/null` hænger den). Aldrig stdin-pipe.
- ⚠ Lucas indsatte app-passwordet i chatten 23/9. Det ligger nu i transcriptet. Anbefal at han laver et nyt og smider det gamle, når alt kører.
