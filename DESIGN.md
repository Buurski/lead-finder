# DESIGN.md — Command Center design system

The implemented system behind Command Center v3. Tokens live in
`src/app/globals.css`; the shell lives in `src/components/shell/`. Warm, light,
calm, room-like. Not dark, not corporate.

## Color

Strategy: **Restrained** — tinted warm-creme neutrals + one quiet accent. OKLCH
throughout; every neutral is tinted toward the warm hue (~70–85), never `#000`
or `#fff`.

- Paper / surfaces: `--bg` `oklch(97.2% 0.012 85)` → `--surface`
  `oklch(99.2% 0.006 85)`. Warm creme, not cool grey.
- Ink: `--text` `oklch(24% 0.020 70)`, `--text-muted`, `--text-dim`.
- Borders: hairline, warm (`--border` `oklch(90% 0.014 85)`).
- The single accent — sage/calm green: `--accent` `oklch(58% 0.085 150)`,
  `--accent-ink` for text on light. Used ≤10% of surface (active nav, primary
  buttons, progress fills, focus rings).
- Status hues kept muted and used sparingly: `--amber` (callbacks / warnings),
  `--blue` (warm leads), `--red` (errors). Never decorative.

## Typography

- Display: **Fraunces** (`--font-display`), weight 600, letter-spacing −0.02 to
  −0.03em. Page titles, card headings, stat numbers.
- Body: **Plus Jakarta Sans** (`--font-body`), 400–600. Body letter-spacing
  −0.011em.
- Scale jumps with clear contrast (stat 30px / h1 27px / card-head 15–16px /
  body 13.5–14px / dim 12px). Body measure capped ~72ch (MarkdownLite).

## Shape & elevation

- Radius: `--radius` 14px, `--radius-sm` 10px, `--radius-lg` 20px, pills 999px.
- Shadows soft and barely there: `--shadow-card` (1px inset highlight + 3px
  ambient), `--shadow-soft` for floating elements. No heavy drop shadows.
- Borders do the structural work, not shadows.

## Layout

- Shell: sticky left sidebar (`--sidebar-w` 248px) + main column with a sticky,
  lightly blurred topbar. Content max-width 1180px, generous padding.
- Mission Control uses an **asymmetric** two-column grid (needs-you wide,
  queue + pipeline stacked beside it), not a uniform card wall.
- Spacing varies for rhythm (18–22px between sections, tighter inside cards).
- Cards are used where a card is the right affordance (one decision / one
  action per card). No nested cards. Numbers use hairline grid dividers that
  collapse cleanly on wrap.

## Motion

- `cc-fade` entrance (220ms ease, 4px rise). Progress/width transitions use
  ease-out cubic `cubic-bezier(0.22, 1, 0.36, 1)`. No bounce, no elastic.
- `prefers-reduced-motion`: all transitions/animations zeroed.

## Components (reusable primitives)

- `cc-card` / `cc-card-pad` — surface + hairline border + soft shadow.
- `cc-btn`, `cc-btn-accent` — 36px controls; accent = sage on white text.
- `cc-chip` — pill tag. `cc-kicker` — uppercase micro-label.
- `cc-tabs` / `cc-tab` — pill tab group (Mission Control, Studio filter).
- `cc-stat-n` / `cc-stat-l` — Fraunces number + dim label.
- `cc-empty` — centered calm empty state (icon + line + hint).
- `cc-skel` — shimmer skeleton for loading.
- Shell: `Sidebar`, `Topbar` (in `AppShell`), `Clock`, `CommandPalette`,
  `ChatDock`, `Icon` (lucide map), `PageHeader`, `FaseNote`, `MarkdownLite`.

## States (every surface)

Hover, active, focus-visible (2px accent ring), empty, loading, error, and an
honest "wired in Fase C" state (`FaseNote`) instead of fake data. Sheets-offline
shows a calm amber banner and a queue-only view, never a crash.

## Accessibility

- WCAG AA contrast on text. `aria-current` on active nav, `role=dialog/listbox/
  tablist` on palette and tabs, `aria-label`s on icon-only controls.
- Keyboard-first: ⌘K / Ctrl+K palette, ↑/↓/Enter/Esc within it.
- Responsive: sidebar collapses to a drawer < 860px; grids reflow; numbers go
  2-up on mobile.

## Icons

lucide-react, used sparingly, 14–20px, resolved through `Icon` so names stay
data-driven (shared by sidebar + palette).
