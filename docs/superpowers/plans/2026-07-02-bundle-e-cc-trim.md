# Bundle E — Command Center faerdiggoer + trim — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — autonomous session, max 1-2 subagents.

**Goal:** Freeze Command Center scope: finish /approve (godkendelse), /replies, /leads end-to-end; archive 7 thin pages to `archive/thin-pages-2026-07-02`; trim sidebar to 8 items; fix double primary CTA in Mission Control.

**Architecture:** Next.js 16 App Router, src/app pages, nav single-source in src/lib/nav-config.ts (sidebar + command palette). Archive = branch pointer at pre-delete state + deletion commit on feature branch (history preserved).

**Tech Stack:** Next.js 16, React 19, inline-style design system (cc-* classes).

## Global Constraints

- Branch: `feat/bundle-e-cc-trim-2026-07-02` (based on origin/main @97c11b4). Push, never merge.
- Archive branch: `archive/thin-pages-2026-07-02` (points at origin/main pre-delete; push).
- Never run `npm run dev`. Verify via build + curl on Vercel preview (git push deploys).
- Never Vercel CLI. Test mail only buur.aigro@gmail.com.
- No em-dashes/emojis/AI-phrases in DONE doc + mail.
- Council (3-lens, Sonnet 5 + Haiku 4.5) after each major part; Fable self-review of code.

---

### Task 1: Archive branch + delete thin pages

**Files:**
- Delete: `src/app/radar/` (page.tsx, RadarClient.tsx), `src/app/sms/` (page.tsx, SmsClient.tsx), `src/app/spend/page.tsx`, `src/app/memory/page.tsx`, `src/app/build-guide/page.tsx`, `src/app/followup-review/page.tsx`, `src/app/journal/page.tsx`
- Delete: `src/app/api/radar/route.ts`, `src/app/api/sms/route.ts` (only consumers are archived pages)
- Delete: `src/components/FollowupReviewClient.tsx` (only used by followup-review)

**Steps:**
- [ ] `git branch archive/thin-pages-2026-07-02 origin/main` (pointer, no checkout)
- [ ] `git rm -r` the 7 page dirs + 2 api routes + FollowupReviewClient
- [ ] Grep confirms no remaining imports of deleted files
- [ ] Commit `feat(cc): archive thin pages (radar/sms/spend/memory/build-guide/followup-review/journal)`

### Task 2: Fix dead references to archived pages

**Files:**
- Modify: `src/components/mission/MissionControl.tsx` (spendAlert Link -> div, line ~156; remove AgentsTab "/spend Detaljer" link ~731; remove DailyBriefCard "/journal" links ~297+~320)
- Modify: `src/app/claude/page.tsx:66` (remove /build-guide button)
- Modify: `src/components/BulkEmailPanel.tsx` (remove followup-review section lines 117-130 + followupCount state + its fetch)

**Steps:**
- [ ] Apply edits; grep `"/(journal|spend|radar|sms|memory|build-guide|followup-review)"` in src -> only nav-config (fixed Task 3)
- [ ] Commit `fix(cc): remove links to archived pages`

### Task 3: Trim nav to 8 items

**Files:**
- Modify: `src/lib/nav-config.ts` — keep: Mission Control (/), Leads, Godkendelse (/approve, badge queue), Svar (/replies), Klienter, SEO, Studio, Indstillinger. Two groups: workspace (first 5) + self (seo, studio, settings). Drop agents group. NavGroup id type loses "agents".

**Steps:**
- [ ] Edit nav-config; check Sidebar.tsx + CommandPalette.tsx compile (both consume NAV/NAV_FLAT)
- [ ] Commit `feat(cc): trim sidebar nav to 8 core items`

### Task 4: Mission Control CTA fix

**Files:**
- Modify: `src/components/mission/MissionControl.tsx` QueueCard (~line 437): demote full-width `cc-btn` "Åbn godkendelse" to `cc-link` text link — NeedsYouCard queue-row is THE primary pointer.

**Steps:**
- [ ] Edit; commit `fix(cc): single primary CTA for approval queue on Mission Control`

### Task 5: Finish /approve

**Files:**
- Modify: `src/app/approve/page.tsx`

**Changes:**
- Loading: show 3 skeleton cards (`cc-skel`) instead of blank while `loading`
- Error: replace bare red `<p>` with proper error card + "Prøv igen" button calling `load()`; when error, do NOT render EmptyState (currently shows misleading "Køen er tom")

**Steps:**
- [ ] Edit; commit `fix(approve): loading skeleton + real error state with retry`

### Task 6: Finish /replies

**Files:**
- Modify: `src/app/replies/RepliesClient.tsx`

**Changes:**
- Error card: add "Prøv igen" retry button calling `load()`
- ScanNowButton: surface failure (currently silently ignores) — set brief error text

**Steps:**
- [ ] Edit; commit `fix(replies): retry on error + scan failure feedback`

### Task 7: Finish /leads

**Files:**
- Modify: `src/components/BulkEmailPanel.tsx`

**Changes:**
- fetchCounts: try/catch -> on failure show muted "Kunne ikke hente status — prøv Opdater" + retry button; no unhandled rejection
- (followup section already removed Task 2)

**Steps:**
- [ ] Edit; commit `fix(leads): panel error handling`

### Task 8: Council + self-review + verify

- [ ] Council A (efter Task 1-4): 3 parallel subagents (improvements / risks / keep) over diff; incorporate
- [ ] Council B (efter Task 5-7): same over diff; incorporate
- [ ] Fable self-review full diff
- [ ] `npm run build`, `npm run lint`, `node scripts/test_all.mjs` all green
- [ ] Commit fixes

### Task 9: Ship

- [ ] Push `archive/thin-pages-2026-07-02` + `feat/bundle-e-cc-trim-2026-07-02`
- [ ] Find Vercel preview URL via gh api deployments; curl verify (200/401-basic-auth acceptable)
- [ ] Write `docs/bundles/bundle-e-DONE.md` (resume + preview URL + archived list); commit + push
- [ ] Mail buur.aigro@gmail.com "AgenticOS Bundle E - CC færdiggør + trim faerdig" via nodemailer + .env.local creds
