# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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

No test suite exists. Before writing any Next.js API or App Router code, read `node_modules/next/dist/docs/` — this project runs Next.js 16 with React 19, which has breaking changes from training data.

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
- `src/lib/email.ts` — branch-grouped email templates (Danish copy), tracking pixel/click URL builders, nodemailer transport.
- `src/lib/apify.ts` — Google Places API scraper + lead scoring logic + `BRANCHES`/`CITIES` constants.
- `src/lib/chains.ts` — unified chain detection (`isChain(name, extra?)`). Used by bulk-send and cleanup routes.
- `src/lib/folders.ts` — Google Drive folder creation for clients.

### Sheet columns

**Leads!A:U** — A–K core fields, L=websiteQualityTier, M=enrichedInfo (JSON), N=email, O=emailSentAt, P=emailOpenedAt, Q=emailClickedAt, R=emailStatus, S=followupSentAt, T=reviewsCount, U=callbackDate.

**Clients!A:I** — separate tab, populated when lead status → "client".

### Email tracking

Open tracking: 1×1 pixel at `/api/email/track/open/[leadId]`  
Click tracking: redirect at `/api/email/track/click/[leadId]?url=...`  
Reply tracking: IMAP scan via `/api/email/sync-replies` (imapflow, Gmail INBOX)

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
APP_URL                  # for tracking URLs (falls back to VERCEL_URL)
```
