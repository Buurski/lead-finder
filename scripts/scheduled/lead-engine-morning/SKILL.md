---
name: lead-engine-morning
description: Morning run of the daily outreach engine — fills the /approve queue with 10-15 personal drafts. Never sends mail.
schedule: "0 7 * * *"
---

# lead-engine-morning

Daglig morgenkørsel af den personlige outreach-motor. Fylder godkendelses-køen
som Lucas gennemgår i `/approve`. **Sender ALDRIG mail** — den fylder kun køen.

## Canonical copy

This file is the version-tracked source under
`scripts/scheduled/lead-engine-morning/SKILL.md`. The live scheduled task reads a
copy at `C:\Users\Buur\Documents\Claude\Scheduled\lead-engine-morning\SKILL.md`.
Keep them in sync.

## What it runs

```bash
cd C:\Users\Buur\Documents\Workflows\lead-system
node .send_queue/daily_engine.mjs --limit=12
```

That executes the sequential loop in `src/lib/engine.ts`:

```
PICK (best un-worked leads from Sheets)
  -> RESEARCH (web Chrome-UA+retry+jina, FB/IG via Apify, lead enrichedInfo)
  -> QUALIFY (regex pre-filter + isProfessionalEnough establishment gate)
  -> DRAFT (Lucas voice, 2 demos, validated: no price/kr, no robot-CTA)
  -> COLLECT (append to .send_queue/approval_queue.json)
```

## After it runs

1. Open `/approve` (Godkendelse tab in the app).
2. Read each draft like a letter; edit if needed; **Godkend** the good ones.
3. Approved drafts are marked `approved` in the queue. Actual sending is a
   separate, paced step (cold-path is currently paused to 2026-07-01;
   `PauseSchedule!A2`).

## Guardrails

- The engine has **no mail transport** — it cannot send.
- `--dry-run` skips the optional LLM lift and needs no credentials.
- Single named lead ("skriv til X"): `node .send_queue/daily_engine.mjs --lead="Vida"`.

## DO NOT enable until verified

Run it manually a few mornings first. Only register the scheduled task once Lucas
is comfortable with the draft quality.
