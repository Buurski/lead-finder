# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

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
- `src/lib/folders.ts` — Google Drive folder creation for clients.

### Sheet columns

**Leads!A:S** — A–K core fields, L=websiteQualityTier, M=enrichedInfo (JSON), N=email, O=emailSentAt, P=emailOpenedAt, Q=emailClickedAt, R=emailStatus, S=followupSentAt.

**Clients!A:I** — separate tab, populated when lead status → "client".

### Email tracking

Open tracking: 1×1 pixel at `/api/email/track/open/[leadId]`  
Click tracking: redirect at `/api/email/track/click/[leadId]?url=...`  
Reply tracking: IMAP scan via `/api/email/sync-replies` (imapflow, Gmail INBOX)

### Lead scoring

`scoreLead()` in `apify.ts`: rating×log(reviews) normalized to 35pts + 30pts no-website bonus + 10pts any-reviews bonus. `websiteQualityBonus()` in `sheets.ts` adds up to 25pts during verification.

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
