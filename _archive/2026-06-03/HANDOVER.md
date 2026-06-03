# HANDOVER — 2026-05-13 overnight session

## Metadata

| Field | Value |
|-------|-------|
| Date | 2026-05-13 |
| Session type | Overnight bulk send (multi-batch) |
| Status | Gmail daily limit hit again — 70 eligible leads remain |

## Session goal

Fix email template routing, audit last night's 64 sends, send cold emails to all eligible leads, sync replies.

## What was completed

### Email template fixes (email.ts)

Root cause: `BRANCH_GROUP_MAP` keys were too long — `branch.includes(key)` requires key shorter than actual Google Places category string. Fixed with shorter keys.

**Changes:**
- Gallery group added: galleri, kunstgalleri, kunsthandel → `buurfoto.vercel.app` with photographer disclaimer
- Beauty → NO demo. Copy: "Mange søger lokale X online". Removed vestfjends/restaurant demo.
- Broader keyword matching: foto, frisør, hår, hair, salon, klip, fysioterapi, tand, læge, kaffebar, pizzeria, burger, bistro, smørrebrød
- Food template: hardcoded "restauranter" → `v.branchDisplay` (cafés get "caféer")

### PROFESSIONAL_BRANCHES (bulk-send route)

Updated keys: "fysioterapi" (shorter), added kiropraktor, apotek.

### Overnight send — 3 batches total

| Batch | Time | Sent | Notes |
|-------|------|------|-------|
| 1 | ~3:04 AM | 64 | Previous session — hit daily limit |
| 2 | ~21:25 | 60 | Limit reset. 7 Sheets quota failures → PATCH'd |
| 3 | ~22:24 | 48 | Limit hit again mid-batch. 6 Sheets quota failures → PATCH'd |
| **Total** | | **172** | |

### Sheets quota failures (PATCH'd after each batch)
Emails were sent but Sheets write failed. All 13 PATCH'd successfully as sent.

### Reply sync results
- Batch 2 post-sync: 3 new replies (669 total checked)
- Batch 3 post-sync: 0 new replies

### Inbox replies (from previous session audit)
- **KT VVS ApS**: "Du er velkommen til at ringe til mig" → HOT lead, call them!
- Galleri Bo, Velodrom Kaffebar, Four Hands, Café Unika → declined
- Line Bjørn, KongChristian X → getting sites elsewhere

### Attractive leads list
Sent to buur.aigro@gmail.com — 12 Facebook/Messenger leads + 13 phone leads, score 75+, uncontacted.

## What's pending

### TONIGHT (retry when Gmail resets — ~3:25 AM rolling window)
```
curl -X POST "https://lead-finder-three-beta.vercel.app/api/email/bulk-send" --max-time 320
```
Then sync:
```
curl -X POST "https://lead-finder-three-beta.vercel.app/api/email/sync-replies"
```

70 eligible leads remain. Expected ~100 send capacity per reset.

### If Sheets quota hits again
PATCH the affected lead IDs:
```
curl -X PATCH "https://lead-finder-three-beta.vercel.app/api/email/bulk-send" \
  -H "Content-Type: application/json" \
  -d '{"ids":["<id1>","<id2>",...]}'
```
IDs come from GET /api/email/bulk-send — cross-reference emails from POST results that got Sheets quota error.

### Followup emails (next day)
Leads with cold email 7+ days ago: POST `/api/email/send-followups`

## File map (changed this session)

| File | What changed |
|------|-------------|
| `src/lib/email.ts` | Gallery group, beauty→no demo, broad keyword matching, food branchDisplay fix |
| `src/app/api/email/bulk-send/route.ts` | PROFESSIONAL_BRANCHES shorter keys + kiropraktor/apotek |

## Key invariants

- Row index = sheet row − 2 everywhere
- `emailSentAt` = dedup guard — once set, lead won't re-send
- `seenEmails` Set deduplicates within a single POST run
- `websiteQualityTier === "modern"` → excluded
- Professional branches: score ≥ 70 (uses PROFESSIONAL_BRANCHES in bulk-send)
- Gmail daily limit: ~100 emails. Rolling 24h from first send of that batch.
- PATCH /api/email/bulk-send recovers from partial Sheets quota failures

## Demo URLs per branch group

| Group | Demo URL |
|-------|---------|
| food | under-klippen.vercel.app + zaytoon-six.vercel.app |
| craft | vestfjends.vercel.app |
| beauty | NO demo — copy: "Mange søger lokale X online" |
| gallery | buurfoto.vercel.app (with "demo for photographer" disclaimer) |
| photo | buurfoto.vercel.app |
| professional | midtadvokaterne-dttc.vercel.app |
| service | no demo — copy focuses on local search visibility |

## Branch group keyword matching

Substring match (`branch.includes(key)`). Keys must be shorter than Google Places category names.

- **craft**: tømrer, maler, elektriker, vvs, blikkenslager, tagdæk, murermester, mekaniker, smed, snedker
- **service**: rengøringsvirksomhed, vinduespudser, anlægsgartner, sundhed, fitness, træningscenter
- **beauty**: skønhed, frisør, hår, hair, negle, nails, salon, klip, spa, velvære, wellness, massage, kosmetisk, kosmetolog, barbershop, barbersalon, barber, solcenter, solarium, hudpleje, hudklinik, body art
- **gallery**: galleri, kunstgalleri, kunsthandel
- **professional**: advokat, revisor, fysioterapi, tand, optiker, kiropraktor, apotek, læge, psykolog
- **food**: restaurant, café, cafe, bistro, sushi, kaffebar, pizzeria, burger, smørrebrød
- **photo**: foto
- **default (fallback)**: craft

## Active Vercel URL
https://lead-finder-three-beta.vercel.app/

## KT VVS ApS — HOT lead
Replied: "Du er velkommen til at ringe til mig"
Mark in sheet as "interesseret" or "called" when you call them.
