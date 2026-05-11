# Handover — Lead System Session 2026-05-12

## Metadata

| Field | Value |
|---|---|
| Date | 2026-05-12 |
| Agent model | claude-sonnet-4-6 |
| Branch | main |
| Last commit | `a488de5` fix: add callbackDate to scrape route newLeads mapping |
| Commits pushed | ✅ All commits on origin/main |
| Build status | ✅ Clean — all 26 routes compile, TypeScript passes |
| Vercel | https://lead-finder-three-beta.vercel.app/ |
| Uncommitted changes | None |

---

## Current Branch & Review Minimums

| Branch | Min reviews | Email group | Score threshold |
|--------|-------------|-------------|----------------|
| tømrer, maler, elektriker, VVS, blikkenslager, tagdækker, murermester | none | craft | ≥ 40 |
| rengøringsvirksomhed, vinduespudser, anlægsgartner | none | service | ≥ 40 |
| advokat, revisor, fysioterapeut, tandlæge, optiker | none | **professional** | **≥ 70** |
| restaurant, café | **30** | food | ≥ 40 |
| fotograf | none | photo | ≥ 40 |
| skønhedsklinik, hudklinik, negle & vippeextensions salon | 15 | service | ≥ 40 |
| frisørsalon | **25** | service | ≥ 40 |

---

## Session 2026-05-12 — What Changed (13 improvements)

### Bug Fixes

1. **Followup daysSince** — All 5 followup templates hardcoded "for en uges tid siden". Now compute actual days from `lead.emailSentAt`: `Math.round((Date.now() - new Date(emailSentAt).getTime()) / 86400000)`. Added `daysSince: number` to TemplateVars. Fallback = 7 for cold emails.

2. **Unified chain detection** — Created `src/lib/chains.ts` with `isChain(name, extra?)`. Merges CHAIN_EXACT (25 brands, word-boundary regex), CHAIN_CONTAINS (49 brands, substring). Both `bulk-send` and `cleanup` routes import from here — removed duplicate inline lists.

3. **Bulk-send sorted by score DESC** — `eligible.sort((a, b) => b.lead.score - a.lead.score)` before sending. Tier A leads get emails before Gmail quota runs out.

4. **Phone dedup in scrape** — Calls `getLeadPhones()` (Leads!C2:C) in parallel with `getLeadNames()`. If new lead phone matches existing phone → skip. Prevents duplicate leads via phone number.

### Targeting

5. **Professional branches require score ≥ 70** — advokat, revisor, fysioterapeut, tandlæge, optiker now need score ≥ 70 (was 40). High-trust professions only accept high-quality prospects.

6. **Fyn cities added** — `CITIES` now has 33 cities. Added: Odense, Middelfart, Svendborg, Nyborg, Kerteminde.

### Email

7. **Unsubscribe footer on all 10 templates** — Text: `\n\n---\nØnsker du ikke at høre fra mig igen? Skriv blot tilbage, så fjerner jeg dig fra listen.` HTML: styled `<hr>` + `<p style="color:#999;font-size:12px;">`. Added via `buildHtml()` (HTML) and `getEmailTemplate()` append (text).

### Callback Date Feature (column U)

8. **`callbackDate` field on Lead** — Column U. ISO date string "YYYY-MM-DD" or "". `LEADS_RANGE` updated to `Leads!A2:U`.

9. **`updateCallbackDate(rowIndex, date)`** — new function in `sheets.ts`. Updates `Leads!U{row}`.

10. **`PATCH /api/leads/[id]/callback`** — new route. Body: `{ date: string }`. Returns `{ ok: true }`.

11. **LeadTable callbackDate UI** — Date picker in side panel (after Notes, before Actions). Row highlights: red `rgba(239,68,68,0.08)` if overdue, orange `rgba(251,146,60,0.1)` if today. Uses `toLocaleDateString("sv-SE")` for timezone-correct Danish date comparison. "Fjern dato" clear button.

### CRM Improvements

12. **Bulk-send GET richer response** — `{ eligible: number, leads: [{id,name,score,branch,city,email,websiteQualityTier}] }` sorted by score DESC. BulkEmailPanel reads `b.eligible` (was `b.count`). Enables preview of who will receive emails.

13. **Clients page revenue totals** — `totalMRR = sum(parseFloat(monthlyFee) || 0)`. `totalSetup = sum(parseFloat(setupFee) || 0)`. Shows "X bekræftede klienter · MRR: Y kr · Setup: Z kr" in subtitle.

---

## Pending / Known Issues

1. **service group has no demo site** — frisørsalon, skønhedsklinik etc. get generic pitch. Conversion limited until a beauty/service demo site is built.
2. **"called" status is misleading** — bulk-send sets status → "called" when email sent. Implies phone call. Not a bug, just confusing UX.
3. **`apify.ts` still named apify** — uses Google Places API (not Apify). Historical name, don't change.

---

## Critical File Map

| File | What it does |
|------|--------------|
| `src/lib/apify.ts` | BRANCHES, CITIES (33), scoreLead(), buildQueries(). Google Places API client. |
| `src/lib/chains.ts` | CHAIN_EXACT (25, word-boundary), CHAIN_CONTAINS (49, substring). `isChain(name, extra?)`. |
| `src/lib/email.ts` | DEMO_URLS, BRANCH_GROUP_MAP, BRANCH_DISPLAY, TEMPLATES (10), sendLeadEmail(), previewEmailTemplate(). |
| `src/lib/sheets.ts` | Lead type (col A–U), Client type, all Sheets reads/writes, websiteQualityBonus(), deleteLeadRows(). |
| `src/app/api/scrape/route.ts` | POST — scrapes, filters (review minimums + phone dedup), saves to sheet. |
| `src/app/api/verify-all/route.ts` | POST — analyzes websites, scores quality, extracts emails from HTML. |
| `src/app/api/leads/cleanup/route.ts` | GET/POST — chain lead cleanup. Uses `isChain` from chains.ts. |
| `src/app/api/email/bulk-send/route.ts` | GET `{eligible, leads[]}` / POST send cold emails sorted by score. |
| `src/app/api/email/send-followups/route.ts` | GET list / POST stream (NDJSON, 150ms delay). |
| `src/app/api/leads/[id]/callback/route.ts` | PATCH — saves callbackDate to col U. |
| `src/components/LeadTable.tsx` | Table + side panel. callbackDate UI, row highlights. |
| `src/components/BulkEmailPanel.tsx` | Email action bar. Reads `b.eligible` from bulk-send GET. |
| `src/app/clients/page.tsx` | Client list + MRR/setup revenue totals. |

---

## Key Invariants

- `lead.id` = sheet row (1-based). `rowIndex` = `id - 2`.
- `LEADS_RANGE = "Leads!A2:U"` — 21 columns. T=reviewsCount, U=callbackDate.
- `getBranchGroup()` uses partial lowercase matching — key order in BRANCH_GROUP_MAP matters.
- Professional branches need score ≥ 70 for email eligibility (others: ≥ 40).
- Always run verify-all before bulk-send. `websiteQualityTier=""` until verified.
- `apify.ts` is the Google Places API client — do NOT add actual Apify SDK imports.
- `websiteQualityBonus()` caps base score contribution. Max achievable score after verify-all = 80.
- `deleteLeadRows()` deletes in descending row order to prevent index shift.
- `isChain()` regex-escapes CHAIN_EXACT entries — special chars like `&`, `'` are safe.

---

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| Unsubscribe via `buildHtml()` + `getEmailTemplate()` | 2 changes handle all 10 templates instead of 10 separate edits |
| Professional branches require ≥ 70 | High-trust professions are harder to sell cold. Fewer but better prospects |
| Sort eligible by score before send | Gmail quota ~100/day. Sort ensures Tier A leads always get emails first |
| callbackDate uses `sv-SE` locale for today | `toISOString()` is UTC. Danish users are UTC+1/UTC+2. sv-SE = YYYY-MM-DD in local time |
| Phone dedup in scrape | Businesses rebrand/rename but keep same phone. Name dedup alone misses renames |
| chains.ts with word-boundary CHAIN_EXACT | "jysk" as substring would catch "fejlrisiko". Word boundary is safe |
| callbackDate as plain ISO string in sheet | No date type in Sheets. String comparison `<` and `===` works for YYYY-MM-DD |

---

## Failed / Rejected Approaches

- **Re-scoring existing 2400 leads**: Not possible — reviewsCount was never stored pre-first-session.
- **Deleting all 2400 leads and starting fresh**: User rejected — keep leads with active statuses.
- **500ms delay removal without streaming**: Would fail at 500+ leads. Streaming solved root cause.
- **`\\\\b` regex escaping in chains.ts**: Code quality reviewer false positive — `\\b` in template literal correctly produces `\b` word boundary in RegExp constructor.
