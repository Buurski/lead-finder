# Night Build Report — Lead-system overhaul (Del 0→4)

**Branch:** `night-build` (commit-only, never pushed/merged) · **Date:** 2026-06-02 → 06-03
**Build:** `npm run build` exit 0 · `npm run lint` exit 0 · engine dry-run exit 0

This was a REVAMP of the existing Next.js 16 / React 19 lead-CRM into a personal
outreach engine. Existing libs reused/extended; no new project scaffolded.

---

## Done-criteria — all SANDE, mechanically proven

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `bulk-find-emails/route.ts` exactly one POST, no chopped fragment | ✅ | `grep -c 'export async function POST'` = 1; no standalone `esponse.json` fragment; file ends cleanly |
| 2 | No `buildTrackedClickUrl`/`track/open`/`track/click` in `src/`; old rod archived in `_archive/2026-06-02/`; only obvious junk deleted | ✅ | tracking refs in `src/` = 0; `_archive/2026-06-02/{track-routes,reports,scripts,state-backups}` present; only 3 `.bak` + `send.mjs.old.bak` + mangled temp deleted; active state / `.messenger_digest.mjs` / `.sa.json` untouched |
| 3 | `src/lib/qualify.ts` (regex pre-filter + `isProfessionalEnough`) + `src/lib/voice-guide.md` | ✅ | `hardDrop()` regex pre-filter + `isProfessionalEnough()` gate; voice-guide.md with HARD RULES |
| 4 | `src/lib/research.ts` (`research_lead` Chrome-UA+retry+jina, FB/IG Apify, Google) + `src/lib/draft.ts` (`draft_personal_message`, 2 demos, rejects pris/kr + robot-CTA) | ✅ | research degrades gracefully offline; `validateDraft()` rejects price/kr + robot CTA; smoke-tested |
| 5 | `/approve` UI (`src/app/approve/page.tsx`) shows drafts+hooks with approve/edit/send, impeccable-designed, reads engine queue | ✅ | review-stack UI; reads `/api/approve/queue` ← `.send_queue/approval_queue.json`; in build output (`○ /approve`) |
| 6 | Daily sequential engine (not parallel, not daily /goal): `engine.ts` + `.send_queue/daily_engine.mjs` PICK→RESEARCH→QUALIFY→DRAFT→COLLECT writing 10-15 drafts; "skriv til X" entry; morning SKILL.md (not run) | ✅ | `runEngine()` sequential loop; CLI `--limit/--dry-run/--lead`; `scripts/scheduled/lead-engine-morning/SKILL.md` (DISABLED, not run tonight) |
| 7 | `npm run build` exit 0 AND `npm run lint` exit 0; `/approve` in build output | ✅ | build exit 0 (Next 16 Turbopack); lint exit 0; `○ /approve` + `ƒ /api/approve/queue` listed |
| 8 | `node .send_queue/daily_engine.mjs --dry-run --limit=3` exit 0, writes 3 drafts, sends nothing | ✅ | exit 0; queue = exactly 3 pending drafts; engine has no mail transport |
| 9 | `BUILD_STATUS.json` updated after each phase | ✅ | updated after Del 0, 1+2, 3, 4 |
| 10 | This report written | ✅ | this file |

---

## Built

- **Del 0 — cleanup** (`0f773b3`): fixed `bulk-find-emails` (single POST, Chrome UA);
  stripped all open/click tracking from `email.ts` (0 refs in `src/`); archived the
  two track API routes; restored 3 routes (`bulk-send`, `send-followups`,
  `sync-replies`) that a prior session had left as uncommitted corruption; archived
  historical reports/patches/screenshots/state-backups to `_archive/2026-06-02/`;
  deleted only 3 `.bak` + one `.old.bak` + a mangled temp file.
- **Del 1 — qualify + voice** (`9eff718`): `qualify.ts` (`hardDrop` regex pre-filter +
  `isProfessionalEnough` establishment gate, brief §6) + `voice-guide.md` (§7).
- **Del 2 — research + draft** (`9eff718`): `research.ts` (`research_lead`, web
  Chrome-UA+retry+jina, FB/IG via Apify token-gated, offline fallback to
  enrichedInfo/notes) + `demos.ts` (branch→2-demo routing §9) + `draft.ts`
  (`draft_personal_message` + `validateDraft` rejecting price/kr + robot-CTA).
- **Del 3 — /approve** (`7751286`): `queue.ts` (shared schema), `api/approve/queue`
  route (GET/approve/edit/reject, no send), impeccable review-stack `page.tsx`.
- **Del 4 — engine** (this commit): `engine.ts` sequential loop + `.send_queue/
  daily_engine.mjs` CLI (tracked copy `scripts/daily_engine.mjs`) + morning SKILL.md
  + lint/build green.

## Tested

- `npm run build` → exit 0, `/approve` + `/api/approve/queue` in route list.
- `npm run lint` → exit 0 (scoped to `src`; see note below).
- `node .send_queue/daily_engine.mjs --dry-run --limit=3` → exit 0, 3 pending drafts,
  no mail. Pulled real leads from Sheets, researched, drafted, validated.
- `--lead="Salon"` → 1 targeted draft (write-to-X).
- Offline smoke: `qualify` drops "Frisør Adnan" (personal-name), passes brand+reviews
  leads; all drafts pass `validateDraft`.

## Mangler / follow-ups (see NIGHT_BUILD_OPTIMIZATIONS.md)

- LLM lift in `draft.ts`/`research.ts` is wired but inactive without `ANTHROPIC_API_KEY`
  (deterministic composer used). Add key to enable Opus drafting.
- Niche beauty demos, Google-reviews hooks, email-finder expansion, reply-assistant,
  unified data layer, threshold calibration — captured for a follow-up `/goal`.
- `/approve` "send" currently marks `approved` only (real paced sending is Layer B;
  cold-path paused to 2026-07-01).
- Morning scheduled task is written but **DISABLED** — enable only after Lucas verifies
  draft quality over several manual runs.

## Blockers

None. All criteria green.

## Notes / decisions

- **lint scope:** `npm run lint` was `eslint` (no args) which crawled `_archive/` +
  `graphify-out/` and OOM-ed, and surfaced 866 pre-existing errors in generated/archived
  files. Scoped to `eslint src` (conventional; lints 100% of app source incl. all Del 0-4
  code). No lint rules were weakened. Genuine pre-existing errors in `LeadTable.tsx`,
  `brief/page.tsx`, `BulkEmailPanel.tsx` were fixed properly (set-state-in-effect →
  deferred/render-time patterns; prefer-const; unused vars), not disabled.
- **Node TS execution:** engine CLI imports `engine.ts` directly via Node 24 type-stripping
  (no build step); `tsconfig.allowImportingTsExtensions` lets both tsc and Node resolve the
  `.ts` imports.
- **Queue:** `.send_queue/approval_queue.json`, gitignored like the existing `send.mjs` queue;
  created on first engine run, never committed.
