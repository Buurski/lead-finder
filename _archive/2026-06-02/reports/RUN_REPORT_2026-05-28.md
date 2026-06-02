# Autonomous run report — 2026-05-28

Continuation of the overhaul started in the prior session. Lucas at work
during the run; no clarifying questions were available. Halt-flag was the
sacred invariant — verified intact at start, after every sheet write, and
at end of run.

## TL;DR

- **3 PRs merged** to `Buurski/lead-finder` (#1, #2, #3). All squash-merged
  to `main`. Production deploy live and responding at
  https://lead-finder-three-beta.vercel.app.
- **138 leads retroactively skipped** in the Sheet (Group A: 35 / B: 100 /
  C: 3). All carry `skipReason` in column V plus an entry in the
  `SkipReasons` audit tab (`SkipReasons` rows: 143).
- **Halt-flag intact**: `PauseSchedule!A2 = "2026-07-01T00:00:00.000Z"`
  — verified at start, after each write, and at end of run. No mails went
  out during the run.
- **No mails sent.** All send paths still gated by pause check (which
  defends the halt-flag in 6 places: `bulk-send`, `send-followups`,
  `scheduled-send` cron, `leads/[id]/send-email`, `test-send`,
  `bulk-send` mid-run recheck).

## PRs

| # | Title | Branch | What |
|---|-------|--------|------|
| [#1](https://github.com/Buurski/lead-finder/pull/1) | night audit | `night/audit-optimize-2026-05-27` | 5-commit bundle from overnight audit: chains apostrophe fix, queue isChain guard, sheets fail-CLOSED, public-sector exclusion, manual-send pause respect |
| [#2](https://github.com/Buurski/lead-finder/pull/2) | refactor + resume | `refactor/eligibility-and-fallback` | New `src/lib/eligibility.ts` (single source of truth), no silent template fallback (NoMatchingTemplateError + skipReason=wrong_template), `POST /api/review/resume` + UI button |
| [#3](https://github.com/Buurski/lead-finder/pull/3) | polish | `polish/nav-review-link-and-template-warmth` | /review nav link, warmer service+gallery templates |

## Skridt 1 — night bundle: ✅ done

Bundle (5 commits, base = origin/main tip `230cab8`) fetched into worktree
off origin/main. Skipped a stale local rebuild (`tsc --noEmit` already
green per night audit; verified by next build later). Pushed and merged
PR #1.

PR #1 merge sha: `9313634`.

## Skridt 2 — Phase 4 retroactive skip: ✅ done

Wrote a local Node script (`__phase4_retroskip.mjs`) that:
1. Read PauseSchedule!A2 first and **refused to run** unless pause is
   set ≥ 2026-07-01.
2. Loaded all 8,459 lead rows.
3. Classified each row by Lucas's spec (Groups A/B/C).
4. Skipped any row with `status=client` (no overwriting active clients).
5. Wrote column V (`skipReason`) and column J (`status=skip`) in one
   `batchUpdate`, then appended one row per lead to the `SkipReasons`
   audit tab.

Recomputed group counts (broader than Lucas's estimate — ran on full
8,459 rows with name + branch fuzzy matching):

| Group | Criteria | Count | Lucas's estimate |
|-------|----------|-------|------------------|
| A | `emailStatus=replied AND followupSentAt non-empty` (markedsføringslov risk) | 35 | 26 |
| B | branch matches dropped-list (advokat/læge/tandlæge/fysio/kiropraktor/psykolog/apotek/optiker/konsulent/hovedentreprenør/butik) AND cold-mailed | 100 | 77 |
| C | strict public-sector domains (state/kommune/silkeborg.dk) + name keywords (retshjælp/sundhedscenter) | 3 | 3 |
| **Total unique** | after dedup | **138** | **106** |

Reason A is higher: any lead that was followed up after a reply now
qualifies (Lucas estimated 26, my filter found 35). Reason B is higher
because `"Butik med vvs-udstyr"` (a substring of dropped key "butik")
matched the VVS retailers — strict reading of Lucas's spec, but worth
noting these are VVS suppliers not pure butiks. **All writes are
reversible** (clear column V + column J = "skip"); if any of the 138
turn out to be wrong, Lucas can flip them back.

Sample of each group is in the dry-run log output.

## Skridt 3 — close items 3a/3b/3c: ✅ done (squashed into PR #2)

**3a. Craft-template fallback returns null.** `getBranchGroup`,
`pickGroup`, `getEmailTemplate`, `previewEmailTemplate` now return
`string | null` / `EmailTemplate | null`. `sendLeadEmail` throws a typed
`NoMatchingTemplateError`. Callsites (`bulk-send`, `send-followups`,
`leads/[id]/send-email`, `leads/[id]/email-preview`) handle the error
explicitly — bulk paths write `skipReason=wrong_template` + log to
audit; manual paths return 422 with a hint at where to extend
`BRANCH_GROUP_MAP` / `NAME_OVERRIDES`.

**3b. lib/eligibility.ts.** Single source of truth for `isCleanEmail`,
`isProfessional`, `isEligibleForCold`, `isEligibleForFollowup`, plus the
`PROFESSIONAL_BRANCHES` and `FOLLOWUP_DAYS` constants. `queue.ts`,
`bulk-send/route.ts`, `send-followups/route.ts` all import from it; the
previous three-way-duplicated copies are gone.

**3c. Resume endpoint + UI.** `POST /api/review/resume` requires
`{ confirm: "JEG_VED_HVAD_JEG_GOER" }`; 400 otherwise. On success it
empties `PauseSchedule!A2` (the empty-string branch in `getPauseStatus`).
UI: red panel on `/review` shown only when `paused === true`, with a
required checkbox + `window.confirm` + a final `Genoptag alle
automatiserede mails` button. The halt button is unchanged.

Verified live: `POST /api/review/resume` with empty body returns 400 +
the expected error JSON.

## Skridt 4 — Phase 3 architecture: ⚠️ partial, awaits Lucas's call

Per the night-audit report itself, the bulk of Phase 3 already exists on
`main` (review dashboard, halt endpoints, PauseSchedule/TreatAsAlive/
SkipReasons tabs, the cron pipeline). The audit explicitly flagged the
`PendingBatch` tab as "sandsynligvis overflødig (dækkes af
computeTodaysQueue + PauseSchedule). Afventer din arkitektur-beslutning."

Concrete progress in this run:
- ✅ **Review link in nav** (PR #3) — was the single named gap.
- 🟡 **watch_approval.mjs + send.mjs mark-sent callback** — NOT built.
  The current local send.mjs reads `queue.json` whose entries have no
  `leadId` field, only `to` (email). Wiring the callback requires the
  queue-generation step to embed a leadId too, which is a deeper change
  to whatever produces `pending_batch.json` / `queue.json`. Flagging
  for a dedicated session.
- 🟡 **PendingBatch sheet tab** — NOT built. Per the audit it's likely
  redundant. Decision needed: re-use `computeTodaysQueue` (already
  drives /review) and the `skipReason` column, or build a parallel
  approval queue. Recommend re-use; happy to implement either.

## Skridt 5 — brand voice polish: ✅ done

Audited every template in `email.ts` against the rules: humble
salgselev-tone (no "din hjemmeside er dårlig"), no price/kr/dkk
mention (none found), concrete value ("kan måske lave en hurtig
skitse"), opt-out ("ét 'nej tak' er nok"), varied openers.

food / craft / beauty / professional / photo were already in good
shape after the May 20 softening. **service + gallery were noticeably
shorter and colder** — both now have a `complimentLine()` opener, a
concrete uforpligtende-skitse offer, and the opt-out line in the body
(not just the footer).

The `complimentLine()` function does produce varied openers across
groups, so "Variér åbnings-linjer" is satisfied at the per-group level.
Within a single group (e.g. all food leads on a given day) the opener
is currently identical; if Lucas wants per-lead variation we can add a
deterministic small pool keyed on lead.id.

## What I did NOT do (and why)

- **Vercel build-log inspection** — the Vercel MCP returned 403 (auth
  scope mismatch). Verified deploy succeeded indirectly by hitting
  `/review` (200) and `/api/review/resume` (correct 400 response).
- **Push from local main** — local was 21 commits behind origin and
  dirty (21 modified files); the prior agent flagged this in
  NIGHT_AUDIT_REPORT. All work was done in `../lead-system-s3` worktree
  off `origin/main`. The dirty local main is untouched — Lucas can
  decide whether to reset or stash.
- **Forced merge without `next build`** — ran `next build` locally
  before merging PR #2. EXIT 0, 36 routes including the new
  `/api/review/resume`. PR #3 was a tiny diff on top.
- **Fix pre-existing broken pause-mid-run in send-followups POST**
  (returns `NextResponse.json` inside a ReadableStream `start` callback
  — that's a no-op). Out of scope here; flagged.
- **Apply the narrow 4-lead PHASE4 list separately** — those 4 leads
  (Bone's x3 + Tønder Sygehus) are all caught by Groups A/B/C above
  and were skipped as part of the 138-write.

## Files added / changed

```
src/lib/eligibility.ts                          (new)
src/lib/queue.ts                                (use eligibility lib)
src/lib/email.ts                                (null fallback + warmer service/gallery)
src/app/api/email/bulk-send/route.ts            (use eligibility, handle NoMatchingTemplateError)
src/app/api/email/send-followups/route.ts       (use eligibility, handle NoMatchingTemplateError)
src/app/api/leads/[id]/send-email/route.ts      (422 on NoMatchingTemplateError)
src/app/api/leads/[id]/email-preview/route.ts   (422 on null template)
src/app/api/review/resume/route.ts              (new)
src/components/Nav.tsx                          (Review link)
src/components/ReviewQueueClient.tsx            (red Resume button gated behind checkbox + confirm)
```

Local artifacts (NOT committed — Lucas's repo):
```
__phase4_retroskip.mjs   — the Phase 4 retro-skip script
RUN_REPORT_2026-05-28.md — this file
```

## What needs Lucas's decision

1. **Phase 3 PendingBatch architecture** — re-use `computeTodaysQueue` or
   build a parallel approval pipeline? Night audit recommends re-use.
2. **Group B "butik" matches** — should "Butik med vvs-udstyr" suppliers
   stay skipped (current state) or be re-eligible? They are pure-butik
   per spec but functionally VVS retailers.
3. **send.mjs mark-sent loop** — needs a leadId field added to
   queue.json upstream before the callback can be wired.
4. **Per-lead opener variation** — current state varies per group only.

## Halt flag — final state

```
PauseSchedule!A2 = "2026-07-01T00:00:00.000Z"
PauseSchedule!B2 = "2026-05-27T21:01:25.877Z"
```

Untouched throughout the run. Verified at start, after each sheet write
(2 batchUpdates + 1 append for Phase 4), and at end of run. No clearance
attempt was made.
