# Kinly Lead System Overhaul — Design Spec

**Status:** Approved by Lucas's request to proceed; implementation branch: `feature/kinly-command-center-overhaul`.

## Goal

Turn the existing lead-system into a calm, Kinly-branded internal command center that makes the next useful action obvious while preserving every current data flow, safety gate, route, and approval step.

## Product decision

This is not a new SaaS dashboard and not a backend rewrite. It is a visual/IA refit of the existing Next.js app:

- **Name:** Kinly Lead System
- **Primary user:** Lucas and Charlie, daily internal use
- **Primary job:** see what needs attention, move leads through the pipeline, approve drafts, manage active customer sites, and inspect SEO
- **Tone:** personal, quiet, precise; no corporate dashboard language
- **Safety:** no auto-send, no hidden side effects, no destructive cleanup, no new external integrations in this overhaul

## Visual direction

### Palette

Use a neutral Kinly treatment with no orange UI tones:

- Ink rail: `#171816`
- Ink rail elevated: `#22231f`
- Paper background: `#f3f4f1`
- White surface: `#ffffff`
- Soft surface: `#e8ebe6`
- Hairline: `#dfe3dd`
- Primary text: `#171816`
- Muted text: `#68716b`
- Kinly signal green: `#2b806d`
- Signal soft: `#dceee8`
- Warning: muted stone/amber only for status, never branding

The Kinly wordmark is rendered in monochrome in the app: use the existing Kinly SVG source, but neutralize the ember squares for the light/dark app variants. No orange accent, gradient, glow, or warm Hermes token remains in the shell.

### Typography

Keep the installed `Plus Jakarta Sans` for readable UI and use the existing display face sparingly for page titles/numbers. Do not introduce a new dependency. Use sentence case, compact labels, and real Danish verbs.

### Layout

- Dark, narrow left rail with the monochrome Kinly wordmark at the top.
- Light paper work area with a quiet sticky topbar.
- One primary content column, max-width around 1240px.
- Open grouping and hairline dividers before adding another card.
- Use cards only for a decision, a queue, or a preview; remove decorative card nesting.
- Keep dropdown groups collapsed by default unless they own the current route.
- Keep the main action visible in the first viewport.
- Responsive rule: rail becomes a drawer; data-heavy rows scroll inside their own wrapper; no horizontal page overflow.

### Motion

Use restrained transform/opacity transitions with the existing CSS approach. Respect reduced motion. No perpetual animation, no heavy blur, no animated gradients.

## Information architecture

### Primary rail

1. **I dag** → `/` (Mission Control)
2. **Arbejde**
   - Godkendelse → `/approve`
   - Pipeline → `/leads`
   - Find leads → `/leadgen`
   - Svar → `/replies`
3. **Kunder & sites** → `/clients`
4. **Synlighed**
   - SEO-overblik → `/seo`
   - Gratis SEO-tjek → `/seo-tjek`
   - Studio → `/studio`
5. **Forretning**
   - Økonomi → `/okonomi`
   - Fakturaer → `/fakturaer`
   - Salg → `/salg`
6. **Hjernen**
   - Hermes → `/hermes`
   - Mål → `/goals`
   - Indstillinger → `/settings`

Nav changes are presentation-only:

- Remove `Prompt-gen` from the visible rail. Keep `/studio/prompt-gen` reachable for legacy/internal use.
- Remove `Compare` from the visible rail. Keep `/studio/compare` reachable from Studio when needed.
- Keep `Radar` out of the active rail until it has a real data source; do not present a broken “soon” destination as daily work.
- Keep Messenger functionality reachable from approval/replies flows, but do not give it equal top-level weight.
- Do not delete working routes or API handlers as part of this visual overhaul.

## Screen contracts

### Mission Control

First viewport order:

1. Greeting + one-line status + one **Næste træk** button.
2. Compact “needs you” queue with the most urgent reply/draft/callback.
3. Four decision numbers without oversized hero-metric theatrics.
4. Pipeline snapshot with statuses and a clear link to full pipeline.
5. Collapsed/secondary cards for daily brief, cron/agent health, goals, and Hermes.

The existing server-side read model, keyboard triage, daily brief, spend alert, and cron health remain intact.

### Pipeline / Leads

Make the page read like a workbench:

- Header with total/new/interested/client counts.
- One filter/action bar.
- Lead table takes visual priority.
- Selected lead detail remains a side panel on desktop and a stacked panel on mobile.
- Verify-all and scrape remain explicit actions with current safety behavior.
- Bulk email approval remains visible, but is framed as a guarded action rather than a prominent CTA.

### Kunder & sites

Reframe the existing client list around active work:

- Summary row: active sites, paying customers, MRR/setup.
- Add-client action remains available but secondary.
- Cards show customer, branch, site status, next project action, and link; hide raw local paths.
- Empty state explains the exact next step: mark a lead as client.

### SEO-overblik

Use a per-site inspection table/card model inspired by the CMS:

- Each customer/site is a row with health score, top issue, schema, performance, Google index, and AI visibility.
- “Kør tjek” is the only prominent action.
- Detailed checks, report, schema snippet, and on-page list stay behind disclosures.
- Preserve current API contract and result data; improve hierarchy, grouping, and readability only.

### Studio / demos

Rename the surface around “Demoer & sites”:

- Built demos first.
- Branch filter second.
- Preview grid third.
- Legacy prompt generator and compare are available as quiet secondary links, not daily navigation.

### Goals / Settings / Hermes

Treat these as supporting tools, not primary daily work:

- Consistent page header and section hierarchy.
- Settings grouped into a small number of named sections with clear save/toggle semantics.
- Goals presented as a short active checklist, not a generic metrics dashboard.
- Hermes presented as the brain/ideas surface; no fake “soon” promises. Existing connection/status behavior remains.

## Component boundaries

- `src/components/shell/AppShell.tsx`: shell frame, product naming, topbar, breadcrumbs, global overlays.
- `src/components/shell/Sidebar.tsx`: rail, grouped navigation, logo, status footer.
- `src/lib/nav-config.ts`: source of truth for the new IA; preserve hrefs and command palette compatibility.
- `src/app/globals.css`: Kinly tokens, shell primitives, responsive behavior, shared page primitives.
- `src/components/shell/PageHeader.tsx`: reusable page heading/action layout.
- Existing page components: adopt shared classes/layout wrappers; do not rewrite their API/data logic unless required for visual grouping.
- `public/brand/*`: monochrome Kinly logo assets copied from the canonical Kinly source and checked into lead-system.

## Out of scope

- No new database.
- No route/API deletion.
- No new email sending behavior.
- No automatic pipeline/lead actions.
- No production deploy or main push without Lucas explicitly approving it in the same conversation.
- No “Radar” backend implementation in this overhaul.

## Acceptance criteria

- Product title and visible shell say Kinly Lead System, not AgenticOS Command Center.
- Monochrome Kinly wordmark appears in the upper-left rail; no orange branding remains in shell tokens or logo rendering.
- The daily rail has fewer, clearer groups and hides prompt-gen/compare/radar from daily navigation without breaking direct routes.
- Mission Control, Pipeline, Kunder & sites, SEO, Studio, Goals, Settings, and Hermes all share the new visual system.
- No existing API route, approval gate, email guard, sheet mapping, or keyboard flow is removed.
- `npm run lint`, `npm run typecheck`, `npm run test`, and `npm run build` pass.
- A real browser run verifies desktop and mobile screenshots, no console errors, no horizontal page overflow, and key navigation/actions remain reachable.
