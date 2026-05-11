# Handover — Lead System Session 2026-05-11

## Metadata

| Field | Value |
|---|---|
| Date | 2026-05-11 |
| Agent model | claude-sonnet-4-6 |
| Branch | main |
| Last commit | `6faee78` fix: raise restaurant/café review minimum from 15 to 30 |
| Commits pushed | ✅ All 11 commits on origin/main |
| Build status | ✅ Clean — all 25 routes compile, TypeScript passes |
| Uncommitted changes | None |

---

## Current Branch & Review Minimums

| Branch | Min reviews | Email group | Demo |
|--------|-------------|-------------|------|
| tømrer, maler, elektriker, VVS, blikkenslager, tagdækker, murermester | none | craft | vestfjends.vercel.app |
| rengøringsvirksomhed, vinduespudser, anlægsgartner | none | service | none |
| advokat, revisor, fysioterapeut, tandlæge, optiker | none | professional | midtadvokaterne-dttc.vercel.app |
| restaurant, café | **30** (was 15) | food | 2 demos |
| fotograf | none | photo | buurfoto.vercel.app |
| skønhedsklinik, hudklinik, negle & vippeextensions salon | 15 | service | none |
| frisørsalon | **25** (re-added) | service | none |

---

## What This Session Did

### Lead Targeting (commits d434d3f → a459ae7)
- Expanded cities 10 → 30 (all Jutland)
- Removed frisørsalon (later re-added with 25-review minimum)
- Added skønhedsklinik, hudklinik, negle (min 15 reviews)
- fotograf properly mapped to photo group

### Scoring (commit f1f404b)
- Base max 35 → 40 pts
- Old: `reviews > 0 → +10`. New: `reviews >= 20 → +15`

### Email Templates (commits 22467b7, 60e3b98)
- 5 template groups: food (2 demos), craft, photo, professional, service (no demo)
- Removed "Jeg hedder Lucas, er salgselev fra Ikast" opener
- Added DEMO_URLS constant, fixed BRANCH_GROUP_MAP

### Lead Cleanup (commit 4cb709a)
- Column T: reviewsCount stored at scrape time
- deleteLeadRows() — deletes in descending order to avoid index shift
- GET /api/leads/cleanup — dry run
- POST /api/leads/cleanup — delete chains (55+ keywords)

### Follow-up Streaming Fix (commit b69ce34)
- Replaced blocking JSON response with NDJSON stream
- Delay 500ms → 150ms per email
- Live counter in UI: "Sender 47/204..."

### This Session (commits 6051961, 6faee78)
- frisørsalon re-added with 25-review minimum (high-end only)
- restaurant/café minimum raised 15 → 30
- README.md rewritten from boilerplate to full project docs

---

## Pending / Next Steps

### Cleanup existing leads (manual)
~2400 existing leads have reviewsCount=0 (column T empty — predates this field).
1. `GET /api/leads/cleanup` — review chain list
2. `POST /api/leads/cleanup` — delete chains
3. Fresh scrape — new leads will have reviewsCount and proper scoring

### Known issues to fix (not done this session)
1. **food followup hardcodes "for en uges tid siden"** — should be dynamic based on actual daysSince
2. **Chain lists diverge** — bulk-send has 61 chain patterns, cleanup has 55+ (different format). Should share a single source (`src/lib/chains.ts`)
3. **Bulk-send sends Tier A and B together** — no Tier A prioritization. If Gmail caps at ~100/day, Tier B leads eat quota before all Tier A are sent
4. **service template has no demo** — frisørsalon, skønhedsklinik etc. get generic pitch. Conversion will be limited until a beauty demo site exists
5. **"called" status is misleading** — in code, bulk-send sets status → "called" when email is sent. But "called" implies phone call. Confusing if used as a true "called" flag

### Push to GitHub
✅ All 11 commits pushed to origin/main.

---

## Critical File Map

| File | What it does |
|------|--------------|
| `src/lib/apify.ts` | BRANCHES, CITIES, scoreLead(), buildQueries(). Named "apify" but uses Google Places API |
| `src/lib/email.ts` | DEMO_URLS, BRANCH_GROUP_MAP, BRANCH_DISPLAY, TEMPLATES, sendLeadEmail() |
| `src/lib/sheets.ts` | Lead type (col A–T), all Sheets read/write, websiteQualityBonus(), deleteLeadRows() |
| `src/app/api/scrape/route.ts` | POST — scrapes, filters (review minimums), saves to sheet |
| `src/app/api/verify-all/route.ts` | POST — analyzes websites, scores quality, extracts emails from HTML |
| `src/app/api/leads/cleanup/route.ts` | GET/POST — chain lead cleanup |
| `src/app/api/email/bulk-send/route.ts` | GET count / POST send cold emails (500ms delay) |
| `src/app/api/email/send-followups/route.ts` | GET list / POST stream send (150ms delay, NDJSON) |
| `src/components/FollowupReviewClient.tsx` | Follow-up review UI, stream reader |

---

## Key Invariants

- `lead.id` = sheet row (1-based). `rowIndex` = `id - 2`.
- `LEADS_RANGE = "Leads!A2:T"` — 20 columns A–T. Column T = reviewsCount.
- `getBranchGroup()` uses partial lowercase matching (`normalized.includes(key)`) — key order matters.
- `frisørsalon` is mapped to "service" group (no demo). Previously removed — now back with 25-review filter.
- Always run verify-all before bulk-send. websiteQualityTier="" until verify-all runs.
- The `apify.ts` file is the Google Places API client despite the name — do not add actual Apify SDK imports.
- websiteQualityBonus() caps base score at 55 before adding bonus. Max after verify-all = 55 + 25 = 80.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Streaming for follow-up send | Browser fetch timeout at ~2 min. Streaming keeps connection alive regardless of batch size. |
| 150ms delay for followups, 500ms for bulk-send | Gmail rate limit is ~15/sec; pool:true + maxConnections:1 is the real throttle. Follow-ups run more often so lower delay is fine. |
| reviewsCount in column T, not enrichedInfo | enrichedInfo is only populated for "Interesseret" leads. reviewsCount needed at scrape time for scoring. |
| deleteLeadRows() fetches sheetId dynamically | Hardcoding sheetId=0 is fragile if sheet tab order changes. |
| service group handles beauty + frisørsalon | No demo site exists. Generic pitch until one is built. |
| restaurant minimum 30 (not 15) | 15 reviews = brand new. 30 reviews = established restaurant that can afford a website. |
| frisørsalon minimum 25 (not 15) | Poor conversion was from cheap salons. 25+ reviews = high-end, established salon. |
| websiteQualityBonus base cap at 55 | Prevents double-rewarding leads that already scored high from no-website bonus. |

---

## Failed / Rejected Approaches

- **Re-scoring existing 2400 leads**: Not possible — reviewsCount was never stored pre-session.
- **Deleting all 2400 leads and starting fresh**: User rejected — keep leads with active statuses.
- **500ms delay removal without streaming**: Would have worked for 204 leads but fails at 500+. Streaming solves root cause.
- **Adding arkitekt/ejendomsmægler**: Rejected — no suitable demo exists.
- **Removing frisørsalon permanently**: Reconsidered — problem was cheap salons, not the branch. Re-added with 25-review minimum.
