# Kinly Lead System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the lead-system shell and major daily surfaces into a neutral Kinly-branded command center without changing backend behavior or safety gates.

**Architecture:** Keep the current Next.js 16 App Router, server-side read models, Sheets data source, approval queue, and API routes. Move visual decisions into a small token system and shared shell/page primitives; update existing pages to consume those primitives instead of inventing new data flows. Hide obsolete navigation entries rather than deleting their routes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4 import, existing CSS primitives, existing `lucide-react`, canonical Kinly SVG assets.

## Global Constraints

- Do not edit `.env`, `.git/`, `.send_queue/`, or secrets.
- Do not push or deploy to `main` without Lucas's explicit approval in this conversation.
- Do not change Sheets ranges, lead/client types, approval behavior, or email send gates.
- Do not add a dependency; use the packages already in `package.json`.
- Preserve direct routes `/studio/prompt-gen`, `/studio/compare`, and `/radar` even when hidden from the daily rail.
- Run `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` before claiming completion.
- Use screenshot-based browser checks on desktop and mobile after each visual slice.

---

### Task 1: Establish the verified baseline

**Files:**
- Read: `package.json`, `src/app/layout.tsx`, `src/app/globals.css`, `src/components/shell/AppShell.tsx`, `src/components/shell/Sidebar.tsx`, `src/lib/nav-config.ts`
- Test: no code changes; command output captured in the task log

**Interfaces:**
- Produces: baseline command results and current route inventory used by all later tasks.

- [ ] **Step 1: Run the existing checks**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: record the actual exit code and any pre-existing failures before changing code.

- [ ] **Step 2: Verify current git state**

```bash
git status --short --branch
git diff --stat
```

Expected: feature branch is clean before implementation.

- [ ] **Step 3: Record the baseline route set**

```bash
find src/app -maxdepth 3 -type f \( -name 'page.tsx' -o -name 'route.ts' \) | sort
```

Expected: existing routes remain the reference set; no route is removed during the overhaul.

---

### Task 2: Add monochrome Kinly brand assets and shell tokens

**Files:**
- Create: `public/brand/kinly-wordmark-neutral.svg`
- Create: `public/brand/kinly-wordmark-neutral-dark.svg`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/AppShell.tsx`

**Interfaces:**
- Produces: CSS tokens `--kinly-ink`, `--kinly-rail`, `--kinly-paper`, `--kinly-signal`, `--kinly-line`, and shared shell classes used by later tasks.

- [ ] **Step 1: Create neutral logo files from the canonical Kinly SVG**

Copy the canonical wordmark shape from `/root/kinly-site/public/brand/kinly-wordmark.svg` into the lead-system assets and replace only `#D4500F` with the foreground color for each variant:

```bash
mkdir -p public/brand
python3 - <<'PY'
from pathlib import Path
src = Path('/root/kinly-site/public/brand/kinly-wordmark.svg').read_text()
Path('public/brand/kinly-wordmark-neutral.svg').write_text(src.replace('#D4500F', '#171816'))
Path('public/brand/kinly-wordmark-neutral-dark.svg').write_text(src.replace('#191713', '#F3F4F1').replace('#D4500F', '#F3F4F1'))
PY
```

Expected: both files exist and contain no orange hex token.

- [ ] **Step 2: Replace the warm/Hermes shell token block**

In `src/app/globals.css`, add the Kinly tokens and change the shell background/surfaces to the neutral palette from the design spec. Keep legacy variables as aliases where existing pages still reference them. Remove `--hermes-ember`, `--hermes-ember-hover`, and `--hermes-ember-soft` from visual shell usage; do not remove API/Hermes logic.

- [ ] **Step 3: Update the app metadata and logo**

Change `src/app/layout.tsx` metadata to:

```ts
export const metadata: Metadata = {
  title: "Kinly Lead System",
  description: "Kinly · internt lead- og kundeoverblik",
};
```

Replace the inline AgenticOS SVG/wordmark in `Sidebar.tsx` with an `<img src="/brand/kinly-wordmark-neutral-dark.svg" alt="Kinly" />` and a small `Lead System` label.

- [ ] **Step 4: Add a distinct rail status block**

Keep the read-only/no-auto-send message, but place it in a styled footer with the new tokens. It must remain visible and must not imply that email is automatically sent.

- [ ] **Step 5: Run focused checks**

```bash
npm run lint && npm run typecheck
```

Expected: exit 0. If not, fix only errors introduced by this task.

- [ ] **Step 6: Run the first council review**

Dispatch the four council roles against the changed shell and tokens. Integrate only findings that preserve clarity, no-orange branding, responsive behavior, and current navigation semantics.

---

### Task 3: Refactor navigation into Kinly daily IA

**Files:**
- Modify: `src/lib/nav-config.ts`
- Modify: `src/components/shell/Sidebar.tsx`
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/CommandPalette.tsx` only if labels require it

**Interfaces:**
- Consumes: existing `NavNode`, `NavItem`, `NAV_TREE`, `NAV_FLAT`, `ownerGroupFor` contracts.
- Produces: same hrefs and command-palette search behavior with new labels/groups.

- [ ] **Step 1: Update `NAV_TREE` to the new groups**

Use these visible labels and hrefs:

```ts
[
  { href: "/", label: "I dag", icon: "LayoutDashboard", hint: "Dagens overblik" },
  { href: "/approve", label: "Arbejde", icon: "Inbox", children: [
    { href: "/approve", label: "Godkendelse", icon: "CheckCheck" },
    { href: "/leads", label: "Pipeline", icon: "Users" },
    { href: "/leadgen", label: "Find leads", icon: "Radar" },
    { href: "/replies", label: "Svar", icon: "Mail" },
  ]},
  { href: "/clients", label: "Kunder & sites", icon: "Briefcase" },
  { href: "/seo", label: "Synlighed", icon: "Search", children: [
    { href: "/seo", label: "SEO-overblik", icon: "Search" },
    { href: "/seo-tjek", label: "Gratis SEO-tjek", icon: "Gauge" },
    { href: "/studio", label: "Studio", icon: "LayoutGrid" },
  ]},
  { href: "/okonomi", label: "Forretning", icon: "CircleDollarSign", children: [
    { href: "/okonomi", label: "Økonomi", icon: "Target" },
    { href: "/fakturaer", label: "Fakturaer", icon: "Receipt" },
    { href: "/salg", label: "Salg", icon: "Workflow" },
  ]},
  { href: "/hermes", label: "Hjernen", icon: "Sparkles", children: [
    { href: "/hermes", label: "Hermes", icon: "Sparkles" },
    { href: "/goals", label: "Mål", icon: "Target" },
    { href: "/settings", label: "Indstillinger", icon: "Settings" },
  ]},
]
```

Keep `/udgifter` and `/indsigter` in the command palette or a secondary Forretning submenu if they are already used by existing workflows. Do not include `/studio/prompt-gen`, `/studio/compare`, or `/radar` in the visible daily rail.

- [ ] **Step 2: Preserve shared route ownership**

Run existing nav tests and verify `ownerGroupFor("/studio/compare")`, `ownerGroupFor("/seo")`, and `NAV_FLAT` still return deterministic results. Fix labels without changing href semantics.

- [ ] **Step 3: Make topbar breadcrumbs match Kinly labels**

Update fallback “Command Center” to “Kinly Lead System” and keep breadcrumb links keyboard-accessible.

- [ ] **Step 4: Run route/navigation checks**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: exit 0.

- [ ] **Step 5: Run the council and integrate only high-confidence IA fixes**

Review criticism for hidden routes, duplicate hrefs, and discoverability. Do not re-add obsolete daily nav merely because it exists in code.

---

### Task 4: Rebuild shared visual primitives and page headers

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/shell/PageHeader.tsx`
- Modify: `src/components/shell/Icon.tsx` only if a missing existing icon is required
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/Sidebar.tsx`

**Interfaces:**
- Produces: shared classes `.kinly-page`, `.kinly-page-head`, `.kinly-section`, `.kinly-surface`, `.kinly-stat-row`, `.kinly-table-wrap`, `.kinly-quiet-action`.

- [ ] **Step 1: Add open-layout primitives**

Implement shared CSS for page max-width, section rhythm, hairline separators, compact status chips, and focus states. Keep existing `.cc-*` classes as compatibility aliases during the migration.

- [ ] **Step 2: Refactor `PageHeader`**

Use a compact eyebrow/icon, sentence-case title, plain subtitle, and right-side action. Avoid nested cards around the heading. Preserve props so existing pages compile unchanged.

- [ ] **Step 3: Refactor topbar and content gutters**

Give the paper workspace a subtle contrast against the dark rail, keep the topbar sticky, and add mobile bottom padding so `ChatDock` cannot cover the final action row.

- [ ] **Step 4: Add responsive table/wrapper rules**

Use local horizontal scrolling for data tables and `overflow-wrap:anywhere` for long domain/path/code values. Page body must not overflow horizontally.

- [ ] **Step 5: Verify styles compile**

```bash
npm run lint && npm run typecheck
```

Expected: exit 0.

---

### Task 5: Redesign Mission Control around the next action

**Files:**
- Modify: `src/components/mission/MissionControl.tsx`
- Modify: `src/components/mission/CronHealth.tsx`
- Modify: `src/components/mission/MaalWidget.tsx`
- Modify: `src/components/mission/OmverdenCard.tsx`
- Modify: `src/components/mission/HermesRuns.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: existing `DeckSummary`, `SpendSummary`, `DailyBrief` and current API endpoints.
- Produces: same buttons/links and same read model, with a new layout hierarchy.

- [ ] **Step 1: Keep the existing `nextAction`, keyboard triage, daily brief, spend alert, and vitals logic**

Do not change the decision rules. Only change markup/classes and the order of visual blocks.

- [ ] **Step 2: Make the first viewport explicit**

Render greeting/status, next action, needs-you queue, and compact numbers first. Move detailed pipeline/goals/agents into the existing details disclosure or secondary sections.

- [ ] **Step 3: Reduce decorative metric cards**

Use a hairline-separated stat row and one stronger needs-you surface instead of repeated boxed cards. Keep numbers and labels identical.

- [ ] **Step 4: Make supporting surfaces collapsible/quiet**

Daily brief, Hermes, goals, and health remain available but should not compete with the next action. Use native `<details>` where the existing component is not interactive; preserve explicit links.

- [ ] **Step 5: Verify behavior**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: exit 0; no snapshot/test contract changes needed.

- [ ] **Step 6: Run council on the screenshot and integrate**

Use critic/optimist/innovator/pragmatist feedback to remove one more noisy element, not add more widgets.

---

### Task 6: Redesign Pipeline, Kunder & sites, and Studio surfaces

**Files:**
- Modify: `src/app/leads/page.tsx`
- Modify: `src/components/EmailDashboardClient.tsx`
- Modify: `src/components/BulkEmailPanel.tsx`
- Modify: `src/app/clients/page.tsx`
- Modify: `src/components/ClientCard.tsx`
- Modify: `src/components/AddClientForm.tsx`
- Modify: `src/app/studio/page.tsx`
- Modify: `src/app/studio/StudioGrid.tsx`
- Modify: `src/app/studio/compare/page.tsx` only for quiet legacy link if needed
- Modify: `src/app/studio/prompt-gen/page.tsx` only for quiet legacy link if needed

**Interfaces:**
- Consumes: existing Sheets reads, lead table props, studio demo catalog and `/api/studio/list`.
- Produces: same actions, links, filters, selection, and data contracts.

- [ ] **Step 1: Make Pipeline the workbench**

Use `PageHeader`, a compact status summary, an action strip, and a table wrapper. Keep Verify-all, Scrape, bulk email, and lead detail exactly wired.

- [ ] **Step 2: Improve mobile lead behavior**

Ensure the filter/action row wraps; keep selected detail stacked below the table under 860px; add visible selected-state affordance.

- [ ] **Step 3: Reframe clients around active sites**

Keep all client data and actions, but present status/MRR/next action first. Hide raw Windows project paths from the visible card; show a safe project label or existing link instead.

- [ ] **Step 4: Make Studio a gallery/workbench**

Show built demos first, branch filters second, catalog previews third. Add small secondary links to Compare and Prompt-gen without putting them in the main nav.

- [ ] **Step 5: Verify behavior and route reachability**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: exit 0. Direct routes `/studio/compare` and `/studio/prompt-gen` still resolve.

- [ ] **Step 6: Run council and integrate**

Prioritize useful scanning and discoverability over visual novelty.

---

### Task 7: Redesign SEO, Goals, Settings, and supporting tools

**Files:**
- Modify: `src/app/seo/SeoClient.tsx`
- Modify: `src/app/seo/page.tsx`
- Modify: `src/app/goals/GoalsClient.tsx`
- Modify: `src/app/settings/SettingsClient.tsx`
- Modify: `src/app/hermes/page.tsx`
- Modify: `src/app/messenger/MessengerPanel.tsx` only if shared layout is needed
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: current SEO result shape, settings APIs, goals data, Hermes page behavior.
- Produces: same API calls and data shape, clearer visual grouping and disclosure states.

- [ ] **Step 1: Convert SEO result cards into a site inspection surface**

Keep one customer/site as the primary row. Show health score, top issue, and key checks first. Put schema snippet, on-page checklist, and report behind disclosures. Preserve `run()` POST payload and all result fields.

- [ ] **Step 2: Use muted status hierarchy**

Green means healthy, stone/amber means attention, red means failure. No orange branding. Remove emoji status glyphs in new markup; use existing `Icon` or text labels.

- [ ] **Step 3: Make Goals a short active checklist**

Group active goals, progress, and next action. Hide empty/legacy explanation content behind a details section if the existing data remains useful.

- [ ] **Step 4: Group Settings by decisions**

Use named sections for cadence, safety, integrations, and appearance. Keep all current controls and APIs, but make save/toggle feedback explicit.

- [ ] **Step 5: Keep Hermes available as the “brain” surface**

Improve header, session/status grouping, and empty/error states without inventing a new agent backend.

- [ ] **Step 6: Run checks and council**

```bash
npm run lint && npm run typecheck && npm run test
```

Expected: exit 0. Integrate only changes that clarify the existing controls.

---

### Task 8: Browser screenshot loop and regression verification

**Files:**
- Create: `/tmp/kinly-lead-system-qa.mjs` or a repo-local ignored QA script
- Modify: code files only if verification finds a defect

**Interfaces:**
- Consumes: built app and existing routes.
- Produces: screenshots, console/error report, and a route/action checklist.

- [ ] **Step 1: Run the webapp helper help command**

```bash
python3 /root/.hermes/skills/web/webapp-testing/scripts/with_server.py --help
```

Expected: usage output; use the helper as a black box.

- [ ] **Step 2: Build a production server for browser checks**

```bash
npm run build && npm run start -- -p 3100
```

Use the tracked process/session; do not run `npm run dev`.

- [ ] **Step 3: Run Playwright smoke checks**

Check desktop 1440×1000 and mobile 390×844 for `/`, `/leads`, `/clients`, `/seo`, `/studio`, `/goals`, `/settings`, `/hermes`:

- page loads without an uncaught console error
- no `document.documentElement.scrollWidth > window.innerWidth`
- Kinly wordmark is visible in the rail/drawer
- “Kinly Lead System” appears in title or visible shell
- hidden legacy routes are still reachable directly
- top-level links navigate
- dropdowns open/close
- mobile menu opens and closes
- no fixed chat control covers the final primary action

- [ ] **Step 4: Inspect screenshots visually**

Use the browser screenshot/vision loop. Remove one remaining noisy element or fix spacing/contrast issues found in each viewport.

- [ ] **Step 5: Run the complete verification command**

```bash
npm run verify
```

Expected: lint, typecheck, tests, and production build all exit 0.

- [ ] **Step 6: Review git diff and status**

```bash
git diff --stat
git diff --check
git status --short --branch
```

Expected: only intended overhaul files/assets/docs changed; no secrets, env files, or main push.

---

### Task 9: Final council, evidence review, and handoff

**Files:**
- Read: final diff, screenshots, verification output
- Modify: only if a council finding is concrete and verified

- [ ] **Step 1: Run a final four-role council against screenshots and diff**

Ask for only concrete defects or high-value polish, not a new feature list.

- [ ] **Step 2: Apply only fixes with a clear acceptance test**

For each accepted finding, make the smallest change and rerun the affected check.

- [ ] **Step 3: Run `npm run verify` again**

Expected: exit 0 after the final diff.

- [ ] **Step 4: Report only verified evidence**

Include branch name, changed surfaces, verification commands/results, and the fact that no production deploy/main push occurred.
