# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project direction (updated 2026-06-03) — READ FIRST

This is becoming **Lucas's personal agentic OS**, not just a lead-tool website.
The lead-CRM is one module inside it. The next big build is the **UI / command
center** — a calm, personal, "room-like" space Lucas runs his work from, with a
Claude agent at the center, live panels, one-click automations, notes, and daily
briefs. Think operating system for one person, not a SaaS dashboard.

**Working agreement for this phase:**
- **Do NOT build the OS UI yet.** Lucas will bring external examples (YouTube
  builds of other people's agentic OSes) first; we design *our* twist from those.
  Until then, only do explicitly-requested, scoped work.
- **Vibe:** personal, warm, calm, room-like. Not corporate, not a generic
  Tailwind dashboard. Quality and feel matter more than feature count.
- **Obsidian:** keep an open mind — likely the notes / knowledge layer. Don't
  commit to an architecture yet; it's a live option, not a decision.
- `COMMAND_CENTER_VISION.md` is the current blueprint (throwaway-able — we may go
  bigger once Lucas shares examples).

**Lead targeting (preference, 2026-06-03):** **keep restaurants — they work** —
but don't let a batch be *only* restaurants. What's been most successful is a
**mix**, and especially **beauty salons** (and similar: hair/negle/hudpleje/
barber/clinic). The recent batch was 100% food, which is the problem, not food
itself. So: **diversify the PICK** — restaurants + beauty/personal-care +
service/trades/retail/professional, with beauty weighted up. The demo library is
thin on non-food branches — note when a demo is a weak branch match.

## Hermes (24/7-agent på VPS — live 2026-06-11)

**Hermes Agent** (Nous Research, v0.16) kører 24/7 på Contabo-VPS'en
(`ssh hermes-vps`). Telegram-gateway + natligt "dreaming"-cron (02:00) der
skriver analyser til vaulten (`daily/<dato>-*.md`). Website-kanal: `/hermes`
chatter synkront via **hermes-api-shimmen** (`vps/hermes_api.py`, port 8787,
HMAC-auth; klient: `src/lib/hermes.ts`). Tre profiler: default ("Hjernen") /
lucas / charlie. Samtalehistorik gemmes website-side i KV; "Gem i vault"
eksporterer til `wiki/os/sessions/`.

**Regler:** Hermes sender ALDRIG selv eksterne beskeder (kun drafts), og
Claude rører ALDRIG Hermes' cron-config/.env — cron-idéer lægges i vaulten
(`wiki/os/hermes-cron-ideer.md`), Lucas opretter selv. Shim-redeploy:
se `vps/README.md`. Env: `HERMES_API_URL` + `HERMES_API_SECRET`.
Fejlsøgning: `/api/hermes/status` er offentlig (uden basic auth) og viser
`shimStatus` (0=ingen forbindelse, 401=forkert secret) + secret-fingerprint.

## Søsterprojekt: buur-cms (kunde-CMS — planlagt 2026-06-07)

Et multi-tenant CMS hvor kunder selv retter deres site (tekst, billeder,
dansk AI-chat, Udgiv/rollback, senere ægte SEO-tal). De to systemer
arbejder SAMMEN, og dokumenterne findes BEVIDST begge steder:

- **Projektmappen `Workflows/buur-cms/`** (eget repo/Vercel-projekt ved
  byggestart): CLAUDE.md (byggeplan), CMS_MASTERPLAN.md, CMS_LUCAS_TODO.md,
  CLIENT_CMS_BLUEPRINT.md, .env.local (Anthropic+Google-nøgler kopieret
  herfra; Mongo/Vercel-placeholders).
- **Kopier her i lead-system:** CMS_CLAUDE_CODE_PLAN.md (= buur-cms'
  CLAUDE.md), CMS_MASTERPLAN.md, CMS_LUCAS_TODO.md, CLIENT_CMS_BLUEPRINT.md.

**SYNK-REGEL:** ret du et CMS-dokument ét sted → kopiér det STRAKS til
det andet sted. Agenter i buur-cms SKAL læse denne CLAUDE.md (denne
sektion + arkitektur/mønstre); agenter her bør kende buur-cms/CLAUDE.md.

**Obsidian er hovedhukommelsen:** vault-noten er
`KnowledgeOS/wiki/os/buur-cms.md`; beslutninger i
`alle-beslutninger-log.md`; kundeviden i `wiki/kunder/`; tone i
`context/brand-og-tone.md`. CMS-arbejde skriver status TILBAGE til
vaulten (jf. byggeplanens §E).

Hvorfor separat mappe/repo: kundevendt app må aldrig dele deploy/kodebase
med dette interne system (risiko + secrets). Eget Vercel-projekt.

**Sammenhæng:** lead → kunde her → site tilkobles buur-cms → abonnement.
Genbrug mønstre (ai.ts-gateway, approval-kø, basic auth, Google-creds) —
aldrig delt deploy. Vault: `KnowledgeOS/wiki/os/buur-cms.md`; beslutninger
i `alle-beslutninger-log.md` (2026-06-07).

## Commit / deploy discipline

Commit-only on feature branches; **never push/merge to main or deploy** unless
Lucas explicitly says so. Never run `npm run dev` (port conflicts) — use a short
`next start` for browser checks and close it. Test-mail target, if ever needed,
is `buur.aigro@gmail.com` ONLY — never real leads. The engine never sends; it
only fills the approval queue.

## Lucas's communication preferences (updated 2026-05-28)

**Primary inbox: `buur.aigro@gmail.com`.** This is where Lucas checks email and where the daily lead-system artifacts land (morning lead-batch digest, morning messenger digest, etc.). Send all routine system output here.

**Dispatch** remains the channel for ad-hoc chat / questions / status pings that don't warrant an email.

**Previous policy (2026-05-26) reserving buur.aigro for "TRULY URGENT only" is superseded** — Lucas confirmed 2026-05-28 that the daily messenger digest and other recurring system mails should go to buur.aigro. The `shadowporo123@gmail.com` address is Claude account/identity only, not a working inbox.

**Still avoid:** spamming buur.aigro with mid-task progress chatter. Send the artifact (digest, completed deliverable, real blocker) — not running commentary. Use Dispatch for that.

## Commands

```bash
npm run build    # type-check + production build
npm run lint     # ESLint
```

Offline lib tests: `node scripts/test_all.mjs` (112 checks across qualify/research/
draft/ai/email-finder/reply/datalayer; no key/network needed). Before writing any
Next.js API or App Router code, read `node_modules/next/dist/docs/` — this project
runs Next.js 16 with React 19, which has breaking changes from training data.

## Architecture

**Lead CRM** for outbound sales. Google Sheets is the database — no SQL, no ORM.

### Data flow

```
Google Places API → /api/scrape → Sheets (Leads tab)
                                      ↓
                         /api/verify-all → score + websiteQualityTier
                                      ↓
                    /api/email/bulk-find-emails → email column
                                      ↓
                    /api/email/bulk-send → Gmail (nodemailer)
                                      ↓
                    /api/email/sync-replies → IMAP scan → Sheets
```

### Key files

- `src/lib/sheets.ts` — all Sheets reads/writes. `Lead` and `Client` types live here. Row index = sheet row − 2 throughout the codebase.
- `src/lib/apify.ts` — Google Places API scraper + lead scoring logic + `BRANCHES`/`CITIES` constants.
- `src/lib/chains.ts` — unified chain detection (`isChain(name, extra?)`).
- `src/lib/folders.ts` — Google Drive folder creation for clients.
- `src/lib/email.ts` — Danish email templates + nodemailer transport (open/click tracking was removed in Del 0; no tracking pixels exist anymore).

**Outreach engine (the personalization pipeline, strip-safe so the node CLI can import the .ts directly):**
- `src/lib/engine.ts` — sequential PICK→RESEARCH→QUALIFY→DRAFT→COLLECT loop; writes to the approval queue, never sends. CLI: `.send_queue/daily_engine.mjs` (`--limit` / `--dry-run` / `--lead="X"`).
- `src/lib/qualify.ts` — `hardDrop` pre-filter + `isProfessionalEnough` gate. Single-token names drop only if a known first name (don't false-drop brands like Lumière/Vida).
- `src/lib/research.ts` — hooks from lead/web(Chrome UA+jina)/Google reviews(+AI refine, Sonnet); `useAI`/`useNetwork` flags (off in dry-run). Apify is OFF unless `ENABLE_APIFY=1`.
- `src/lib/draft.ts` — deterministic composer (varied, validated, customer-review-quote opener) + optional Opus lift; `validateDraft` enforces no price/kr, no robot-CTA.
- `src/lib/demos.ts` — branch→2-demo routing. Thin on non-food branches.
- `src/lib/ai.ts` — single model gateway: Vercel AI Gateway (AI SDK) → Anthropic direct → deterministic null. DRAFT=Opus 4.8, RESEARCH+QUALIFY=Sonnet 4.6. No key ⇒ deterministic everywhere.
- `src/lib/queue.ts` — approval queue schema (`.send_queue/approval_queue.json`, gitignored).
- `src/lib/datalayer.ts` — queue↔Sheets bridge (lazy sheets import). Registers approve/sent/reply outcomes back to the CRM.
- `src/lib/reply.ts` — reply-assistant: classify inbound + auto-client detect + in-voice draftReply.
- `/approve` (+ `/api/approve/queue`) — review/approve/edit/reject UI over the queue. No send.

### Sheet columns

**Leads!A:U** — A–K core fields, L=websiteQualityTier, M=enrichedInfo (JSON), N=email, O=emailSentAt, P=emailOpenedAt, Q=emailClickedAt, R=emailStatus, S=followupSentAt, T=reviewsCount, U=callbackDate.

**Clients!A:I** — separate tab, populated when lead status → "client".

### Email status

Open/click tracking was **removed** in Del 0 (no pixels, no redirect routes).
Reply tracking only: IMAP scan via `/api/email/sync-replies` (imapflow, Gmail
INBOX) → feed through `reply.ts` for classification.

### Lead scoring

`scoreLead()` in `apify.ts`: rating×log(reviews) normalized to 40pts + 30pts no-website bonus + 15pts ≥20 reviews bonus. `websiteQualityBonus()` in `sheets.ts` adds up to 25pts during verification. Professional branches (advokat, revisor, fysioterapeut, tandlæge, optiker) require score ≥ 70 for email eligibility.

## Required environment variables

```
GOOGLE_SHEET_ID
GOOGLE_KEY_FILE          # local path to service account JSON
GOOGLE_SERVICE_ACCOUNT_JSON  # full JSON string (Vercel)
GOOGLE_PLACES_API_KEY
GMAIL_USER
GMAIL_APP_PASSWORD
APP_URL                  # falls back to VERCEL_URL
```

Optional:
```
AI_GATEWAY_API_KEY       # Vercel AI Gateway (preferred) — turns on live model lift
ANTHROPIC_API_KEY        # OR Anthropic direct. None set ⇒ deterministic everywhere.
AI_MODEL_DRAFT / AI_MODEL_RESEARCH / AI_MODEL_QUALIFY  # model overrides
AI_DISABLED=1            # force deterministic even with a key
ENABLE_APIFY=1           # opt-in FB/IG scraping (OFF by default — cost). Apify was
                         # dropped as too expensive; Google reviews replaces it.
APIFY_TOKEN              # only used when ENABLE_APIFY=1
```

Claude Max ≠ API access: the Max subscription gives no programmatic key. Live
model output needs API credits (Anthropic direct, ~$5, or AI Gateway) — only
buy at deploy time. Until then the system runs fully on the deterministic path.
