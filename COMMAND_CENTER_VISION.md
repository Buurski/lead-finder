# COMMAND CENTER VISION

**Status:** vision / blueprint only — **no UI is built in this phase.** This
document is the contract for the next `/goal` that builds the command-center UI.
It maps every proposed surface to data and libraries that **already exist** on
`night-build`, so the build phase is wiring, not invention.

> Guiding principle: one screen Lucas opens in the morning that answers
> *"what needs me, and what can I fire off in one click?"* — then gets out of the
> way. Calm, fast, keyboard-first. Not a dashboard graveyard.

---

## 0. What already exists to build on

| Capability | Where | Surfaced as |
|------------|-------|-------------|
| Lead database | Google Sheets `Leads!A:U` via `src/lib/sheets.ts` | `/api/leads` |
| Daily draft engine (PICK→RESEARCH→QUALIFY→DRAFT) | `src/lib/engine.ts` + `.send_queue/daily_engine.mjs` | CLI / cron |
| Approval queue | `.send_queue/approval_queue.json` + `src/lib/queue.ts` | `/api/approve/queue`, `/approve` |
| Research + hooks (web/Apify/Google reviews/AI) | `src/lib/research.ts` | engine |
| Qualification | `src/lib/qualify.ts` | engine |
| Draft composer (Opus + deterministic) | `src/lib/draft.ts` + `src/lib/ai.ts` | engine, /approve edit |
| Email discovery | `src/lib/email-finder.ts` | `/api/email/bulk-find-emails` |
| Reply-assistant (classify + draft + auto-client) | `src/lib/reply.ts` | (needs route) |
| Queue↔Sheets bridge | `src/lib/datalayer.ts` | /approve approve action |
| Model gateway (Gateway→Anthropic→deterministic) | `src/lib/ai.ts` | all of the above |

The command center is a **read/act layer over these** — it adds almost no new
backend, mostly new routes that expose libs that already work headless.

---

## 1. Command Deck (the home screen)

A single route (`/deck`) composed of cards. Each card = one decision or one
one-click action. Default layout, top-to-bottom by urgency:

1. **Needs you now** — replies classified `interested` / `question` /
   `becameClient` by `reply.ts`, plus callbacks due today (`callbackDate`,
   column U). Each row: lead, one-line why, and the suggested reply pre-drafted.
2. **Approval queue** — count + the top 3 pending drafts inline (from
   `/api/approve/queue`); "Open /approve" for the full review stack.
3. **Today's pipeline** — engine status: last run, drafts produced, qualified-out
   count, source (sheets/fixture).
4. **Numbers** — small: new leads, emails found today, replies today, won this
   week. Read from Sheets; no vanity charts.

Keyboard-first: `j/k` move between deck items, `a` approve, `r` reject/skip,
`e` edit, `Enter` open. The deck never blocks on the network — cards hydrate
independently and show a stale-but-instant value first.

## 2. Live panels

Panels are the expanded view behind a deck card. They poll their lib-backed
route on a slow interval (15–30 s) and re-render in place — no full reloads.

- **Engine panel** — trigger `daily_engine` with `--limit` / `--lead="…"`
  (needs `POST /api/engine/run`), stream the PICK→…→COLLECT log, watch the queue
  fill live.
- **Lead panel** — a single lead's full research dossier: hooks, demo pair,
  professionalism verdict, Google-review snippet, found email, draft preview.
- **Replies panel** — inbox view backed by `sync-replies` + `reply.ts`:
  classification badge, suggested reply, one-click "send reply + flip status"
  (via `datalayer.registerReplyOutcome`).
- **Approval panel** — the existing `/approve` review stack, embedded.

## 3. Automations on click

Every recurring chore becomes a labelled button with a dry-run preview, an
explicit confirm, and a result toast. No hidden side effects.

| Button | Backed by | Guardrail |
|--------|-----------|-----------|
| Run engine (12) | `engine.ts` | writes queue only, never sends |
| Refill / write to X | `engine.ts --lead` | single draft |
| Find emails (next 100) | `email-finder.ts` | MX-verified, no send |
| Sync replies → triage | `sync-replies` + `reply.ts` | read-only scan |
| Approve all "safe" drafts | `queue.ts` + `datalayer.ts` | preview list first; still no auto-send |
| Promote reply → client | `datalayer.registerReplyOutcome` | confirm dialog |

Sending real mail stays a **separate, explicitly-armed** action (cold-path),
never bundled into a bulk automation. Test-sends are restricted to
`buur.aigro@gmail.com`.

## 4. Notes

A lightweight, always-present notes rail (right side or `\``-toggle):

- **Per-lead notes** persist to Sheets `notes` (column K) via
  `updateLeadStatus(..., notes)`.
- **Scratch notes** persist to `.send_queue/notes/*.md` (local, gitignored).
- Notes accept `[[lead name]]` and `#tag` so they can later resolve into links
  (see Obsidian, §6). Markdown, autosaved, no "save" button.

## 5. Daily briefs

A generated morning brief (the calm version of "what happened / what's next"),
written to `buur.aigro@gmail.com` (per CLAUDE.md) and mirrored on the deck:

- Overnight: engine drafts produced, emails found, replies received + how they
  classified, callbacks due today.
- Suggested focus: the 3 highest-value "needs you" items.
- One-line health: build/queue/AI-provider status (`ai.aiStatus()`).

Source: a `scripts/scheduled/morning-brief` job composing from Sheets + queue +
reply classifications. The existing `lead-engine-morning` SKILL is the hook
point; it stays **disabled** until Lucas trusts draft quality.

## 6. Obsidian integration

Treat an Obsidian vault as the human-readable mirror of the CRM:

- Export each active lead / client as a markdown note (`vault/leads/<name>.md`)
  with front-matter (status, score, branch, city, email) and the research
  dossier in the body — regenerated on status change.
- `[[wikilinks]]` between a lead note, its client note, and the project folder
  (Drive, via `folders.ts`).
- One-way (CRM → vault) first; later, edits to a note's front-matter can sync
  back through `datalayer.ts`. Keep Sheets the source of truth initially.

## 7. External inputs

Channels that drop work onto the deck without Lucas hunting for it:

- **Inbound email replies** — already scanned by `sync-replies`; route through
  `reply.ts` so they arrive pre-classified + pre-drafted.
- **Dispatch / chat ping** — ad-hoc "skriv til X" or "kør motoren" commands map
  to `engine.ts --lead` / engine run (per CLAUDE.md, Dispatch is the chat
  channel).
- **New scrape results** — `/api/scrape` (Places) drops fresh leads into the
  "new" pool the deck surfaces for first-touch.
- **Calendar** — callbacks (`callbackDate`) and booked meetings shown as
  deck items due today.

---

## Build order (for the future UI `/goal`)

1. Thin read routes the deck needs (`/api/engine/run`, `/api/replies`,
   `/api/deck/summary`) — pure wrappers over existing libs.
2. `/deck` static shell + the four cards, hydrating from those routes.
3. Keyboard triage (`j/k/a/r/e`).
4. Live panels (slow-poll).
5. Notes rail.
6. Morning brief job.
7. Obsidian export.
8. External-input wiring last.

## Non-goals (explicit)

- No analytics/charts dashboard. Numbers are small and decision-relevant only.
- No auto-send of cold mail from any bulk button.
- No new database — Sheets + `.send_queue` remain the data layer (now bridged by
  `datalayer.ts`).
- No framework churn — stays Next.js 16 / React 19, same repo.
