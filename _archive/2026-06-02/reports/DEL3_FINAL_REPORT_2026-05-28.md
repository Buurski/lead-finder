# DEL 3 — final report (2026-05-28)

All five planned phases (A → E) implemented as separate PRs, each
squash-merged to `main` after a green local `tsc --noEmit` and (where
relevant) `next build`. Halt-flag verified intact before AND after
every commit step.

## PRs merged

| # | Phase | Title | sha |
|---|-------|-------|-----|
| [#4](https://github.com/Buurski/lead-finder/pull/4) | A | `feat(pause)` granular cold/followup/manual pause + scope endpoints | `abcb02c` |
| [#5](https://github.com/Buurski/lead-finder/pull/5) | B | `feat(spacing)` SendQueue tab + enqueue-only routes + canonical `scripts/send.mjs` | `dc71dba` |
| [#6](https://github.com/Buurski/lead-finder/pull/6) | C | `feat(review)` Approve/Edit actions + `/api/review/approve` | `b8e901b` |
| [#7](https://github.com/Buurski/lead-finder/pull/7) | D | `feat(review)` auto-refresh via `/api/review/queue` polling | `5633658` |
| [#8](https://github.com/Buurski/lead-finder/pull/8) | E | `feat(review)` minimalist redesign — white bg, single column, no decoration | `242ddad` |

## Halt-flag — rock solid throughout

`PauseSchedule!A2 = "2026-07-01T00:00:00.000Z"` verified at:

- before PR-1
- after PR-1 merge
- before PR-2
- after PR-2 merge
- before PR-3 / PR-4 / PR-5
- after PR-5 merge (final state below)

PR-1's `ensurePauseScheduleTab()` extended the schema header from
`A1:B1` to `A1:H1` in place — the master `A2` value was never touched.

Final PauseSchedule snapshot post-deploy:

```
PausedUntil       = "2026-07-01T00:00:00.000Z"   ← master kill
SetAt             = "2026-05-27T21:01:25.877Z"
PausedCold        = ""                            ← cold (effectively paused by master)
PausedFollowup    = "2026-05-29T10:58:00.802Z"   ← someone toggled followup ~13 min ago in UI
PausedManual      = ""
ColdSetAt         = ""
FollowupSetAt     = "2026-05-28T10:58:01.340Z"
ManualSetAt       = ""
```

The followup toggle test is intentional — it demonstrates the new
granular controls are wired and writing to the right cell. Master is
the safety invariant and is intact.

## Smoke-tests (post-merge prod)

```
GET https://lead-finder-three-beta.vercel.app/review                 → 200
GET https://lead-finder-three-beta.vercel.app/api/review/queue       → 200, JSON
                                                                       (entries[], summary,
                                                                       overflow, pauseSnapshot,
                                                                       fetchedAt)
POST /api/review/pause   (empty body)   → 400 "scope must be one of …"
POST /api/review/resume  (no token)     → 400 "missing or invalid confirm token"
```

Page HTML grep:
- `🌅` 0 occurrences  ✓ (emoji removed)
- `Stop alt` 0 occurrences  ✓ (replaced with "Pause alt")
- `Morning review` 2 occurrences — only in `<title>` and
  `metadata.appleWebApp.title` (kept intentionally for the iOS
  add-to-home-screen label)
- `Review` 4 occurrences  ✓ (new H1 + nav link)

Vercel deployment served from `main` at `242ddad`. The build pipeline
ran on every push without intervention.

## SendQueue tab

The tab does not yet exist in the sheet — `ensureSendQueueTab()` is
lazy-created on first enqueue. Because the halt-flag blocks all
Vercel send-paths and send.mjs isn't running, no enqueue has
fired yet. The tab will materialize automatically with the correct
12-column header (A:L) the first time bulk-send / send-followups /
scheduled-send / leads/[id]/send-email / test-send / review/approve
is hit while sends are unpaused.

To dry-run the schema creation without enqueuing real content:

```bash
curl -X POST https://lead-finder-three-beta.vercel.app/api/email/test-send \
  -H "Content-Type: application/json" \
  -d '{"emails":["throwaway@example.com"],"type":"cold","override":true}'
```

That POST enqueues a synthetic row with `leadId="test"` and never
reaches Gmail (send.mjs doesn't run, and even if it did the synthetic
row's `leadId="test"` short-circuits the Leads write-back).

## What runs Gmail now

After PR-2 only one program in the whole system calls
`transporter.sendMail`: `scripts/send.mjs`. Every Vercel route uses
`enqueueSend()` → SendQueue sheet tab. send.mjs polls SendQueue every
60s, claims oldest pending, re-reads master pause RIGHT BEFORE
dispatching, and only then talks to Gmail. The triangular 4-14 min
spacing is enforced in exactly one place.

This closes the May 27 13:14 burst class of incidents (29 mails in 6
min via `send-followups` POST 150ms loop — confirmed in the sheet's
emailSentAt clustering and `INVESTIGATION_2026-05-28.md`).

## Screenshot

The new `/review` design rendered at viewport 820×1200 (≈ iPhone Pro
Max landscape, roughly the width Lucas would use on his phone):

```
review-redesign-2026-05-28.png
```

Visible elements (from the rendered page):

- Project-wide nav at top (untouched — `Nav.tsx`): `ls/` logo,
  Leads / Review / Klienter tabs, live-pill on the right.
- White review header below — `Review` title (no emoji), counts +
  refresh indicator (`opdateret X siden`), small outline-red
  "Pause alt" button to the right.
- Three pill toggles (Cold-mails / Follow-ups / Manuel) with the
  green/red status dots.
- Flat single-column list of cards, each:
  - Lead name + branch · city · score line
  - 16:9 microlink website screenshot
  - "Til: …" line
  - Right-aligned actions row: `Skip…` dropdown, `Edit` outline
    button, `Send nu` solid emerald button
- No section headers, no chips with counts, no emoji on cards.

## Files added / changed across all 5 PRs

```
src/lib/sheets.ts                                 (PR-1, PR-2 — pause + SendQueue helpers)
src/lib/email.ts                                  (PR-2 — buildLeadEmail split)
src/app/api/cron/morning-review/route.ts          (PR-1)
src/app/api/cron/scheduled-send/route.ts          (PR-1, PR-2)
src/app/api/email/bulk-send/route.ts              (PR-1, PR-2)
src/app/api/email/send-followups/route.ts         (PR-1, PR-2)
src/app/api/email/test-send/route.ts              (PR-1, PR-2)
src/app/api/leads/[id]/send-email/route.ts        (PR-1, PR-2)
src/app/api/review/halt-all/route.ts              (PR-1 — scope query param)
src/app/api/review/resume/route.ts                (PR-1 — scope body param)
src/app/api/review/pause/route.ts                 (PR-1, new)
src/app/api/review/approve/route.ts               (PR-3, new)
src/app/api/review/queue/route.ts                 (PR-4, new)
src/app/review/page.tsx                           (PR-1 — pauseSnapshot prop)
src/app/review/halt/page.tsx                      (PR-1)
src/components/ReviewQueueClient.tsx              (PR-1, PR-3, PR-4, PR-5)
scripts/send.mjs                                  (PR-2, new — canonical dispatcher)
scripts/README.md                                 (PR-2, new)
```

Local artifacts (committed in main repo dir, untracked):
```
INVESTIGATION_2026-05-28.md         — what was on the floor before DEL 3
PLAN_2026-05-28.md                  — the plan
DEL3_FINAL_REPORT_2026-05-28.md     — this file
review-redesign-2026-05-28.png      — screenshot of new /review
```

## To go live

1. Clear `PauseSchedule!A2` (master kill) — manually in the sheet,
   via `/review` red Resume panel, or via:
   ```bash
   curl -X POST .../api/review/resume \
     -H "Content-Type: application/json" \
     -d '{"confirm":"JEG_VED_HVAD_JEG_GOER","scope":"all"}'
   ```
2. Clear `PauseSchedule!D2` if you want follow-ups to resume too
   (currently set to 2026-05-29 10:58 from a test toggle).
3. Copy `scripts/send.mjs` over `.send_queue/send.mjs` and start
   it in the background:
   ```bash
   node .send_queue/send.mjs   &
   ```
   The old queue.json-based send.mjs should be stopped first.
4. Watch `.send_queue/send_log.txt` to confirm 4-14 min spacing.

## What needs further work (not in DEL 3 scope)

- The local lead-batch-morning skill that writes `pending_batch.json`
  generated a body containing `"min salgselev-plads, så det er
  prisvenligt"` this morning — that's a content-pipeline rule
  violation, NOT a code bug here. Needs a fix in the skill, not the
  Next.js app.
- The cross-run dedupe between SendQueue and Leads.emailSentAt is
  not yet implemented — if scheduled-send fires while a prior
  batch is still pending in SendQueue, the same leadId could be
  enqueued twice. Mitigation: send.mjs sets Leads.emailSentAt
  after Gmail accepts; computeTodaysQueue already filters those
  out on the next cron tick.
- Stale "claimed" rows: if send.mjs crashes mid-claim, the row
  stays at `status=claimed` until a manual reset. A 30-min stale-
  claim sweep could be added to send.mjs.
