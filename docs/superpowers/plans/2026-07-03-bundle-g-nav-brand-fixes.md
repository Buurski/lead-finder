# Bundle G Implementation Plan — Nav-model A + AgenticOS rebrand + fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** Dropdown-based sidebar (nav-model A), rebrand internal UI buurski → AgenticOS, signature post-generation injection, goals widget on Mission Control, delete /welcome, plus 4 operator-flow extras.

**Architecture:** nav-config.ts gets `children[]` on NavItem; Sidebar renders accordion dropdowns (open state per group, mobile = same accordion). NAV_FLAT flattens children for ⌘K. Signature: prompts stop asking model to sign; pipeline appends `formatSignature(sender).closing` after generation (senders.ts is already the data source — no senders.json needed). Goals backend already works; only widget is new.

**Tech stack:** Next.js 16, React 19, existing cc-* CSS system, node test suites in scripts/test_all.mjs.

## Global constraints

- Branch: `feat/bundle-g-nav-brand-fixes-2026-07-03`. Commit-only, push branch, NEVER merge/deploy.
- Never `npm run dev`. Verify via `npm run build` + `node scripts/test_all.mjs` + short `next start` if needed.
- No em-dashes in user-facing copy. Danish UI copy.
- Internal tool (Lucas + Charlie): operator efficiency over polish.
- Customer-facing brands (Vida, seo-tjek "Buur Web", cold-mail voice) untouched.
- GitHub org refs `Buurski/KnowledgeOS`, `Buurski/lead-system` untouched (real org name).

## Findings from exploration (facts that change the spec)

1. **GoalsClient is ALREADY wired** to POST /api/goals toggle/add/remove with optimistic UI. Task 4 = widget only + verify.
2. **senders.ts already exists** with per-sender name/phone/title/tagline + formatSignature/applySignature/stripSignature. No senders.json needed.
3. **Real signature bug:** draft.ts LLM path prompt says "Signaturen tilføjes separat af pipeline" but draft_personal_message never appends it → LLM drafts have NO signature (or model improvises one).
4. messenger/compose.ts patterns hardcode "Mvh, Lucas" + validator requires exact suffix.
5. engine.ts:146 fallback voice line says "end 'Mvh, Lucas'".
6. /radar, /sms do not exist (archive branch). /messenger, /leadgen, /claude, /hermes, /goals, /studio/compare, /studio/prompt-gen exist.
7. No "Buurski" in mail-sending code — internal mails have no brand signature. Rebrand = UI + docs/brand only. logo filenames contain no "buurski"; SVG <title> text does.
8. approve page Filter = status tabs, no channel param. Messenger godkendelse lives on /messenger.

### Task 1: Nav-model A
- nav-config.ts: add `children?: NavItem[]`; restructure NAV per spec. Radar → `/radar` with `soon` flag + create real coming-soon page (avoid 404). "Alle kanaler" → `/approve` is duplicate href; instead Godkendelse dropdown = Email (/approve), Messenger (/messenger) — 2 items, SMS dead, "Alle kanaler" dropped (no unified page exists; approve IS the queue). Documented in DONE.
- Svar ▾ → Email-indbakke (/replies), Messenger-indbakke → /messenger#indbakke fallback: point to /messenger (marker-sendt flow lives there).
- Sidebar.tsx: accordion — parent row toggles open; auto-open group containing active route; children indented; works as-is on mobile drawer.
- NAV_FLAT flattens parents+children, dedupe by href.

### Task 2: Rebrand
- Sidebar brand name text, layout.tsx title, BRAND.md name refs (keep tokens/fonts), SVG <title> text in docs/brand/*.svg.

### Task 3: Signature
- draft.ts: after LLM body validated, `body = applySignature(body, sender)`-style append of `formatSignature(sender).closing` (cold mail bodies end med closing, full sig med telefon renderes i email.ts templates — match deterministic path som slutter med signature.closing).
- messenger/compose.ts: patterns lose hardcoded "\n\nMvh, Lucas"; draftMessenger appends `Mvh, ${name}` from formatSignature(sender).closing, sender param default "lucas"; validator takes optional sender.
- engine.ts fallback line sender-neutral. voice-guide.md line 28/55 → "Slut med Mvh + valgt afsender (tilføjes af pipeline)".
- Tests: extend senders/draft/messenger suites; run test_all.

### Task 4: Goals widget
- `src/components/mission/MaalWidget.tsx` (client): fetch GET /api/goals, show first 3-5 undone, checkbox → POST toggle, link /goals.
- Mount in MissionControl layout.

### Task 5: Delete /welcome
- rm src/app/welcome; grep links.

### Task 6 extras (chosen 4, ~30 min each)
1. Batch-godkend on /approve: checkboxes + "Godkend valgte (N)".
2. Keyboard shortcuts: g/s/l/m/k quick-nav + ? overlay (skip when typing in input).
3. Bell in topbar: queue+needs sum, dropdown links.
4. Breadcrumbs in topbar title for subroutes.
Dropped: universal ⌘K search over leads (needs new search API — 30 min cap blown), focus mode (Esc conflicts palette; low value), pinned items, dark mode (no theme infra), Stripe-status (buur-cms domain), empty-state pass (most pages have cc-empty already).

### Task 7: Council + finalize
- 4-lens council (A upside / B risks / C keep / D wildcard), incorporate, self-review, build+tests, DONE doc, push, mail via SMTP creds i .env.local.
