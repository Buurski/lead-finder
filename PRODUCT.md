# Lead System — Product Context

## Users
Lucas — solo freelance web designer, Danish market. Uses this tool daily to manage local business leads (håndværkere, frisører, malere) and client projects in the Ikast/Herning area.

## Product Purpose
Personal CRM + pipeline tool. Find leads via Apify, track them through the sales funnel (new → called → interested → client), fill a brief form for confirmed clients, auto-generate a project folder with CLAUDE.md pre-loaded for design work.

## Register
product

## Brand Tone
Efficient, clean, personal. No corporate gloss. This is a work tool — it should feel like a well-designed notebook, not a SaaS dashboard.

## Strategic Principles
- Speed over decoration — Lucas scans this quickly; every element must earn its place
- Clarity over cleverness — status, score, and actions should be obvious at a glance
- Personal tool, not a product — no onboarding states, no marketing copy

## Anti-references
- Dark hacker dashboards (it was dark, Lucas wants light now)
- Generic SaaS purple gradients
- Overloaded card grids
- Hero-metric template (big number + small label + gradient accent)

## Evolution (2026-06 — Command Center v3)
The tool is becoming Lucas's personal **agentic OS / command center**: a calm,
room-like space he runs his work from, with Claude at the center, a left sidebar
(Workspace / Agents / Self), a Mission Control home that answers "what needs me
now?", and one-click automations (dry-run → confirm → toast, never auto-send).
The lead-CRM is one module inside it. See `DASHBOARD_OVERHAUL_GOAL.md` and
`COMMAND_CENTER_VISION.md` for the full contract, `DESIGN.md` for the system.

### Changelog — Del 2 (2026-06-04, branch command-center-v3)
- **Outreach loop:** /approve keyboard triage + bulk-approve; QA-only reply send
  (buur.aigro); find-emails preview.
- **Demo factory:** branch design templates + customer recon + one-page HTML
  demo builder; `/studio/new`.
- **SEO tool:** schema scan, index check, AI-visibility, optional Lighthouse,
  tiers (VIDA=full); live `/seo` + monthly report.
- **Vault bridge:** local-first KnowledgeOS reader wiring Goals/Memory/Journal.
- **Client deliverables:** `/clients/[id]` + auto vault notes on status→client.
- **Tone-mixer:** OUTREACH_ANALYSIS-driven openers (dead opener dropped),
  7-day follow-up, hostile blacklist.
- **Cadence:** `/settings` auto-run toggle (default OFF) + cron + indicator.
- **Charlie:** shared-password proxy auth + `/welcome`.
- **AI Spend:** per-model estimated tracker + alert.
- **Hermes:** Railway-ready skeleton + `SETUP_HERMES.md` (not deployed).
- 11 offline test suites / 204 checks. See `NIGHT_BUILD_REPORT_v2.md`.
