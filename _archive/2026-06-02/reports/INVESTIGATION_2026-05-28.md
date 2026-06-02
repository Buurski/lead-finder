# Investigation — 2026-05-28

Halt-flag verified: `PauseSchedule!A2 = "2026-07-01T00:00:00.000Z"` — intact.
No edits made to send-code during this investigation.

## 1. Spacing / timing

**Aktuel spacing er TO PARALLELLE PIPELINES med vidt forskellig spacing — Vercel-routes er det utætte led.**

| Sender | Spacing | Hvor i kode |
|---|---|---|
| `.send_queue/send.mjs` (lokal) | **4–14 min triangulær** + 60–180s warm-up | `nextDelayMs()` line 55 |
| Vercel cron `/api/cron/scheduled-send` | **8–15s jitter** | `MIN_DELAY_MS=8000 / MAX=15000`, line 20 |
| Vercel `/api/email/send-followups` POST | **150ms hardkodet** | `setTimeout(150)`, line 89 |
| Vercel `/api/email/bulk-send` POST | **default 500ms** (caller kan sætte 0–180000 via querystring) | line 40 |
| Vercel `/api/email/test-send` | ingen (synthetic, kun for tests) | n/a |
| Vercel `/api/leads/[id]/send-email` (single) | n/a (én ad gangen) | manuel |

### Hvad skete i går (May 27)

**Smoking gun fundet:** sheet `emailSentAt`/`followupSentAt` clustering viser:

```
2026-05-27T13:14 → 2 cold
2026-05-27T13:15 → 5 follow-ups
2026-05-27T13:16 → 5 follow-ups
2026-05-27T13:17 → 5 follow-ups
2026-05-27T13:18 → 4 follow-ups
2026-05-27T13:19 → 5 follow-ups
2026-05-27T13:20 → 3 follow-ups
```

29 mails på 6 minutter (≈ 1 mail / 12 sek). Match med **`/api/email/send-followups` POST** og dens 150ms-spacing (27 followups × 150ms + Sheets-writes ≈ 6 min).

**Det var IKKE send.mjs.** `send_log.txt` viser send.mjs kørte parallelt med korrekt 4–14 min spacing hele dagen — kontinuerlig række fra 09:11 til 12:08 UTC, 57→77 sends, 6–11 min mellem hver. send.mjs-pipelinen var ikke involveret.

Konklusion: 13:14-burst kom fra Vercel-routen, mens send.mjs allerede var færdig kl. 12:08. Nogen (cron eller manuel POST) trigge­de `/api/email/send-followups` kl. 13:14.

## 2. Personalisering — pipeline

**To uafhængige pipelines genererer mails:**

### Pipeline A — Lokal skill → send.mjs

1. Lokal skill (Lucas's `lead-batch-morning`-flow) skriver `.send_queue/pending_batch.json` med fuldt personaliseret copy (specifik per-lead, ikke template). Eksempel-skip-rules fra `pending_batch_meta.json`:
   - `no kr-amount in body`
   - `no HTTP status codes in body`
   - `hobby-rate framing`
   - `Mvh, Lucas signature`
2. Lokal proces (ikke fundet i denne investigation — sandsynligvis en Claude-skill-kørsel der bygger `queue.json` fra `pending_batch.json`) appender til `.send_queue/queue.json`.
3. `send.mjs` reader `queue.json` og sender via Gmail SMTP med 4-14 min spacing.

**Kritisk fund:** `pending_batch.json` fra i morges (2026-05-28T05:55Z) indeholder bogstavelig string `"min salgselev-plads, så det er prisvenligt"` i body. Dette er en **direkte overtrædelse af absolut regel #4** ("aldrig sig 'salgselev' priser"). Halt-flag forhindrede afsendelse, men generatoren producerer stadig forbudte strenge. Skill-rules-listen `no kr-amount` matchede ikke ordet "prisvenligt" eller "salgselev".

### Pipeline B — Vercel routes → email.ts templates

1. `computeTodaysQueue()` (i `queue.ts`) finder eligible cold + followup leads vha. den nye `lib/eligibility.ts`.
2. Når en send-route kaldes (cron 10:00 UTC eller manuel POST), looper den eligible-listen og kalder `sendLeadEmail(lead, kind)`.
3. `sendLeadEmail` → `getEmailTemplate(branch, kind, vars)` → fast template fra `TEMPLATES[group][kind]` i `email.ts`. Templates er **branch-group-skabeloner**, ikke per-lead personaliseret.
4. Skabelonerne bruger `pickGroup(name, branch)` med NAME_OVERRIDES (foto/advokat/fysio/vvs/maler/tømrer/restaurant/galleri/frisørsalon) og BRANCH_GROUP_MAP (>50 keys for at fange Google Places-varianter).
5. Efter PR #2: hvis `pickGroup` returnerer `null` → `NoMatchingTemplateError` → lead skippes med `skipReason=wrong_template`.

**Branche-detection — usikkerheder:**

- BRANCH_GROUP_MAP har enkelt-ord-substring match (fx `"butik"` matcher `"Butik med vvs-udstyr"`). Dette gjorde at 100 VVS-retailere blev klassificeret som dropped Group B i fase-4 retro-skip.
- NAME_OVERRIDES tjekkes FØRST og kan rette branch-fejl (`/foto|photo|fotograf/` fanger fotografer selv hvis branche er "Tjenester").
- Public-sector (`isPublicSector`) er konservativ — kun 11 træf på 8.459 leads (0 false positives).
- Chains-listen er apostrof-insensitive efter PR #1.

**Hvor ender mails i sending-kø:**
- Pipeline A (lokal personaliseret): kun via `queue.json` → send.mjs. Ikke via /review.
- Pipeline B (Vercel templates): direkte fra cron eller manuel POST til send-route. Ingen /review-godkendelse i sending-pathen — /review viser bare hvad der VILLE blive sendt og lader Lucas markere skip.

**To pipelines deler ikke kø, deler ikke spacing-regler, deler ikke godkendelsesflow.**

## 3. Review-page current state

**Filer:**
- `src/app/review/page.tsx` — server-component, kalder `computeTodaysQueue()` + `getPauseStatus()`, sender til client
- `src/components/ReviewQueueClient.tsx` — 600+ lines, alt UI logikken

**Hvad ses i dag:**
- Header (sticky, mørk slate-900): titel, count (`X / 75 planlagt`), rød "🛑 Stop alt i dag"-knap, evt. en pause-status-linje, og (efter PR #2) en rød Genoptag-panel når pause er aktiv.
- 3 sektioner med farvet venstre-border: 🚨 Mulige kæder (rød), ⚠️ Broken-website claims (gul), ✅ Standard (grøn). Per concern.
- Hver row: lead-navn + chips (kind/tier/claim broken/treated-as-alive) + 80×56 microlink-screenshot + Skip-dropdown (6 reasons inkl. "other" m. textarea).
- Footer: "Sender automatisk kl. 10:00 UTC".

**Hvad er IKKE der:**
- ❌ Approve / "Send nu" knap
- ❌ Edit-knap (kan ikke ændre subject/body inline)
- ❌ Auto-refresh / SSE — siden er statisk, opdateres kun ved manuelt refresh (`force-dynamic` + `revalidate=0` på server-componenten).
- ❌ Granular toggles (cold / followup / manual separat) — kun master pause+resume.
- ❌ Personlig-mail (preview af den faktiske body Lucas ville sende) — bare lead-metadata.

**Hvad den faktisk gør i forhold til pipeline:**
- Viser Pipeline B's `computeTodaysQueue` (template-baseret cold + followup).
- Viser **IKKE** Pipeline A's `pending_batch.json` (lokal-skill-genereret personaliseret kø).
- Skip skriver til column V (skipReason) — næste `scheduled-send` cron springer dem over.
- Halt skriver til PauseSchedule!A2 — blokerer **alle** Vercel-routes (men ikke send.mjs, som kører lokalt uden at læse pause-flaget).

## Tre kerne-punkter

1. **Aktuel spacing er forskellig per pipeline.** send.mjs har 4-14 min (godt). Vercel send-followups POST har 150ms (katastrofalt). Vercel scheduled-send cron har 8-15s (også for hurtigt). May 27-bursten kom fra send-followups POST.
2. **Aktuel review-flow er kun-skip.** Ingen approve, ingen edit, ingen auto-refresh. Pipeline B-skabelon-sends vises men ingen Pipeline A-personaliserede sends vises.
3. **Aktuel personalisering er to-sporet.** Pipeline A (lokal skill → send.mjs) genererer per-lead personaliseret copy — har lige nu en regelovertrædelse (`"salgselev-plads"` + `"prisvenligt"` i pending_batch.json). Pipeline B (Vercel routes → email.ts) bruger branch-group-templates med ny null-fallback. De to deler ikke kø, ikke spacing, ikke godkendelse.
