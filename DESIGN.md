# DESIGN.md — Kinly HQ design system

Fase 2 redesign (2026-09-22). Replaces the "Command Center v3" system below it
— same repo, new visual world. Tokens live in `src/app/globals.css`; the
shell lives in `src/components/shell/{AppShell,Sidebar}.tsx`. Spec:
`docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md` §4–§5. Reference:
`docs/superpowers/plans/fase-2-mockup-hq.html`.

Mode: **Operate**. This is a daily work tool for Lucas + Charlie — scanability
and native affordances outrank expression. Brand shows up in precise details
(the lime accent, the dark rail, the K-mark), not in decoration.

## Color

Strategy: **Restrained** — warm off-white paper + a dark rail + ONE loud
accent (lime), used sparingly (active nav, primary/AI actions, focus rings).

- Paper: `--bg` `#EDEDEA` → `--surface` `#FFFFFF`, `--surface-2` `#F5F5F2`.
- Ink: `--text` `#191713`, `--text-muted` `#55504A`, `--text-dim` `#8A847B`.
- Borders: hairline, `--border` `#E4E4DF`.
- Accent — lime: `--accent` `#C8F04B` with `--accent-ink` `#191713` for text
  *on* lime (lime is bright — always pair it with dark ink, never white).
- Status: `--green` (success), `--amber` + `--amber-dim` (snart/warn), `--red`
  (forfalden/risk). Never decorative.
- Dark surface: `--kinly-rail` `#16130F` — the rail, and any "agent" card
  (Hermes/AI cards in Task 3+).
- Ember `#D4500F` is banned everywhere in this app (kinly.dk keeps it; this
  system does not).

## Typography

- Body + display: **Plus Jakarta Sans** everywhere (`--font-jakarta`,
  loaded in `layout.tsx`). No serif, no second display face.
- Meta only — dates, timestamps, "6 min siden", counters — **JetBrains Mono**
  (`--font-jbmono` / `--font-mono`, `.cc-mono` utility), 13px, tabular-nums.
  Never body text.
- All numbers: `font-variant-numeric: tabular-nums`.

## Shape & elevation

- Radius: `--radius` 24px (cards), `--radius-sm` 16px (inner elements), pills
  hardcoded 999px.
- **No shadows.** `--shadow-soft` / `--shadow-card` are `none`. Surfaces are
  separated by hairline borders and flat color contrast against `--bg`, not
  drop shadows. (A few pre-existing low-alpha card shadows outside the shell
  were left as-is in fase 2 Task 1 — see plan note; not part of the new shell.)

## Layout — shell

- **Rail** (desktop, ≥768px): dark (`--kinly-rail`), icon-only, 88px
  (`--rail-w`), full height, `position: sticky`. K-mark top
  (`public/brand/kinly-mark-rail.svg`), 7 icon links, avatar bottom. Active
  item: lime background + dark ink icon (never white-on-lime).
- **Topbar**: page title (from `pageTitleFor()` in `nav-config.ts`) + search
  pill (⌘K, opens `CommandPalette`) + bell (`Bell.tsx`) + black "+ Ny" pill.
- **Mobile** (<768px): rail hides; a fixed dark bottom bar takes over — HQ,
  Indbakke, Pipeline, Mere. "Mere" opens a bottom sheet with the full IA
  (`NAV_PRIMARY` + `NAV_MORE`). No horizontal scroll at 390px.
- Content: `max-width: 1400px`, centered; most pages additionally wrap in
  `.cc-fade` (max-width 1180px) for reading measure.

## Information architecture

Single source of truth: `src/lib/nav-config.ts` — `NAV_PRIMARY` (rail, 7
items), `NAV_MORE` (⌘K + mobile sheet only), `NAV_FLAT` (both, for search).
`isNavActive()` / `pageTitleFor()` are shared by the rail, bottom bar, sheet
and topbar so the active state and page title never drift apart.

## Motion

- `cc-fade` entrance (220ms ease, 4px rise). `prefers-reduced-motion` zeroes
  all transitions/animations.

## Components (reusable primitives)

- `cc-card` / `cc-card-pad` — surface + hairline border, no shadow.
- `cc-btn`, `cc-btn-accent` (ink pill, white text) — the accent is `--text`,
  not lime (lime never carries white text).
- `cc-chip`, `cc-kicker`, `cc-tabs` / `cc-tab`, `cc-stat-n` / `cc-stat-l`.
- `cc-empty`, `cc-skel` — calm empty/loading states.
- Shell: `AppShell` (topbar + palette + pause-banner host), `Sidebar` (rail +
  bottom bar + "Mere"-sheet, self-contained), `Bell`, `CommandPalette`, `Icon`
  (lucide map, data-driven by name). `ChatDock` is gone — Hermes is the only
  assistant; its dock mounts in `AppShell` in fase 2 Task 7.

## States (every surface)

Hover, active, focus-visible (2px lime ring via `.cc-focus`), empty, loading,
error, and an honest "wired senere" state instead of fake data. Sheets/DB
offline shows a calm amber banner, never a crash.

## Accessibility

- WCAG AA contrast on text — this is why lime never carries white text or
  sits under white icons; pair it with `--accent-ink` instead.
- `aria-current` on active nav, `aria-label` on every icon-only control,
  `role="dialog"` on the mobile sheet and command palette.
- Keyboard-first: ⌘K/Ctrl+K palette from anywhere in the shell, Esc closes
  palette and mobile sheet.

## Icons

lucide-react, 16–20px, resolved through `Icon.tsx` so names stay data-driven
(shared by rail, sheet, bell and palette).

---

## Superseded — Command Center v3 (pre-2026-09-22)

Kept for history only; no longer the active system. Sidebar was a light,
248px, accordion-style sidebar with grouped nav; topbar showed breadcrumbs;
accent was a muted sage green; display font was Fraunces. See git history for
the full text if needed — none of it applies to fase 2 onward.
