# Lead System

Cold email CRM for selling websites to local Danish businesses. Scrapes Google Places → scores leads → sends personalized Danish emails → tracks opens/clicks/replies.

## Stack

- **Next.js 16** (App Router, React 19, TypeScript)
- **Google Sheets** — database (no SQL)
- **Google Places API** — lead scraping
- **Nodemailer + Gmail SMTP** — email sending
- **imapflow** — reply/bounce detection via IMAP
- **Vercel** — deployment

---

## Setup

### Environment variables

```env
GOOGLE_SHEET_ID=
GOOGLE_KEY_FILE=              # local path to service account JSON
GOOGLE_SERVICE_ACCOUNT_JSON=  # full JSON string (Vercel)
GOOGLE_PLACES_API_KEY=
GMAIL_USER=
GMAIL_APP_PASSWORD=
APP_URL=                      # for tracking URLs (falls back to VERCEL_URL)
```

### Commands

```bash
npm run build   # type-check + production build
npm run lint    # ESLint
```

No test suite. Never run `npm run dev` while deployed — port conflicts.

---

## Workflow

```
1. POST /api/scrape          → pulls leads from Google Places, scores, saves to sheet
2. POST /api/verify-all      → fetches each website, assigns quality tier, adjusts score
3. GET  /api/leads/cleanup   → preview chain leads to delete
4. POST /api/leads/cleanup   → delete chain leads
5. GET  /api/email/bulk-send → count of eligible leads (score ≥ 40, not modern website)
6. POST /api/email/bulk-send → send cold emails to all eligible leads
7. (wait 5 days)
8. POST /api/email/send-followups → stream follow-ups to unopened leads
9. POST /api/email/sync-replies   → scan IMAP for replies, update sheet
10. POST /api/email/sync-bounces  → scan IMAP for bounces, update sheet
```

**Critical:** Always run verify-all (step 2) before bulk-send (step 6). Otherwise leads with modern websites pass the email filter incorrectly.

---

## Lead Scoring

Score runs at scrape time, then verify-all adjusts it.

### At scrape (`scoreLead()` in `src/lib/apify.ts`)

| Signal | Points |
|--------|--------|
| Rating × log(reviews) normalized | 0–40 |
| No website | +30 |
| ≥ 20 reviews | +15 |
| **Max** | **100** (capped) |

### After verify-all (`websiteQualityBonus()` in `src/lib/sheets.ts`)

| Website tier | Bonus |
|---|---|
| dead | +25 |
| old | +20 |
| mediocre | +8 |
| modern | 0 (and blocked from emails) |

Base score is capped at 55 before bonus is added.

### Email eligibility tiers

| Tier | Score | Emailed? |
|------|-------|---------|
| A | ≥ 70 | ✅ |
| B | 40–69 | ✅ |
| C | < 40 | ❌ |

---

## Branches & Targeting

### Scrape targets (`BRANCHES` in `src/lib/apify.ts`)

| Group | Branches | Review minimum |
|-------|----------|---------------|
| Håndværk | tømrer, maler, elektriker, VVS-installatør, blikkenslager, tagdækker, murermester | none |
| Service | rengøringsvirksomhed, vinduespudser, anlægsgartner | none |
| Professionelle | advokat, revisor, fysioterapeut, tandlæge, optiker | none |
| Mad | restaurant, café | **30** |
| Foto | fotograf | none |
| Skønhed | skønhedsklinik, hudklinik, negle & vippeextensions salon | 15 |
| Skønhed | frisørsalon | **25** (high-end only) |

### Cities (`CITIES` in `src/lib/apify.ts`)

30 cities across all of Jutland — north, mid, south.

### Email templates

| Group | Demo | Angle |
|-------|------|-------|
| food | 2 restaurant demos | "Se hvad en hjemmeside kan gøre for jer" |
| craft | vestfjends.vercel.app | "Jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme" |
| photo | buurfoto.vercel.app | "Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem" |
| professional | midtadvokaterne-dttc.vercel.app | "I [city] kender folk jer. Hjemmesiden burde de også gøre." |
| service | (no demo) | "Mange i [city] søger lokale [branchDisplay] online" |

---

## Sheet Structure

### Leads tab — columns A:T

| Col | Field | Notes |
|-----|-------|-------|
| A | name | |
| B | branch | From Google Places categoryName |
| C | phone | |
| D | city | Extracted from address by regex |
| E | score | Updated by verify-all |
| F | source | "Google Maps" |
| G | website | |
| H | websiteStatus | "none" \| "ok" (set at scrape) |
| I | status | new → called → interested → client \| skip |
| J | notes | Free text |
| K | lastUpdated | ISO timestamp |
| L | websiteQualityTier | modern \| mediocre \| old \| dead (set by verify-all) |
| M | enrichedInfo | JSON, set on "interested" leads |
| N | email | Found by bulk-find or verify-all |
| O | emailSentAt | Cold email timestamp |
| P | emailOpenedAt | Tracking pixel timestamp |
| Q | emailClickedAt | Demo link click timestamp |
| R | emailStatus | sent → opened → clicked → replied \| bounced |
| S | followupSentAt | Follow-up email timestamp |
| T | reviewsCount | From Google Places at scrape time |

### Clients tab — columns A:I

| Col | Field |
|-----|-------|
| A | name |
| B | branch |
| C | phone |
| D | briefFilled (Yes/No) |
| E | projectFolder (Drive URL) |
| F | websiteStatus (demo/in progress/live) |
| G | monthlyFee |
| H | setupFee |

---

## Key files

| File | Role |
|------|------|
| `src/lib/apify.ts` | BRANCHES, CITIES, scoreLead(), buildQueries() |
| `src/lib/email.ts` | Templates, DEMO_URLS, BRANCH_GROUP_MAP, sendLeadEmail() |
| `src/lib/sheets.ts` | Lead/Client types, all Sheets reads/writes |
| `src/lib/folders.ts` | Google Drive folder creation |
| `src/app/api/scrape/route.ts` | POST — scrape + filter + save |
| `src/app/api/verify-all/route.ts` | POST — analyze websites, update scores |
| `src/app/api/email/bulk-send/route.ts` | GET count / POST send cold emails |
| `src/app/api/email/send-followups/route.ts` | GET list / POST stream follow-ups |
| `src/app/api/leads/cleanup/route.ts` | GET preview / POST delete chains |

---

## Invariants

- `lead.id` = sheet row (1-based). `rowIndex` = `id - 2`.
- `LEADS_RANGE = "Leads!A2:T"` — 20 columns. Do not change without updating Lead interface.
- `getBranchGroup()` uses partial lowercase matching — key order in BRANCH_GROUP_MAP matters.
- Always run verify-all before bulk-send on any new scrape batch.
- Never commit service account JSON. Use env vars.
