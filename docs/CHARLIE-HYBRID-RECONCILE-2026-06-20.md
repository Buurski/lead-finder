# Charlie sender + hybrid reconcile (2026-06-20)

Two parallel efforts converged on the same feature. This doc records how they fit so
there is ONE working pipeline. Mirror of KnowledgeOS `wiki/os/charlie-integration-2026-06-20.md`.

## Key fact: nothing auto-sends
Every Vercel cron only **fills the queue** or **scans** inboxes/replies ("kø fyldt — ingen
mail sendt"). All sending is the **manual** `/godkendelse` → `POST /api/approve/send` button.
No double-send risk between the two efforts.

## Daily production flow
1. **06:00 local Cowork task `daily-lead-gen`** → Google Places sourcing → writes
   `KnowledgeOS/data/leadgen.json` → pushes to GitHub. (Quality logic lives in this task's prompt.)
2. **06:30 `GET /api/cron/ingest-leadgen`** → fetches leadgen.json from GitHub → `composeColdEmail()`
   (incl. the longer value paragraph) → fills the approval queue (KV). Never sends.
3. **`/godkendelse`** → per-lead Lucas/Charlie sender toggle → approve.
4. **`POST /api/approve/send`** (manual) → sends via the chosen account's Gmail, re-signs body to
   the sender, dedupes by address across both senders.

The sandbox can't reach Sheets/Anthropic, so it writes raw candidates only; the ingest cron is the
compose+queue bridge. They are a pair, not a conflict.

## Crons (`vercel.json`)
| Cron | Schedule | Role | Sends? |
|---|---|---|---|
| `pre-cleanup` | 04:30 | cleanup | no |
| `sync-replies` | 04:30 | scan BOTH inboxes → mark replied | no |
| `engine` | hourly (gated by `autoEngine`, default OFF) | alt. autonomous queue-filler | no |
| `inbox-triage` | hourly | in-app dual-account triage → "Svar" tab | no |
| `ingest-leadgen` | 06:30 | leadgen.json → queue | no |

## Single-path decision: keep `autoEngine` OFF
Two possible lead-gen sources: (a) local 06:00 task → ingest (the tuned one), and (b) the hourly
`/api/cron/engine` (only runs if `autoEngine` is ON). Keep **autoEngine OFF** so only (a) runs —
otherwise both fill the queue and overlap. Verify in the deployed Settings page.

## Credentials split
- **Vercel env** has `CHARLIE_GMAIL_USER` + `CHARLIE_GMAIL_APP_PASSWORD` (the hybrid redeploy) → sending
  as Charlie + Vercel inbox/reply scans work in prod. *(Confirm.)*
- **Local `.env.local`** has only Lucas. `CHARLIE_GMAIL_APP_PASSWORD` is blank → the local morning
  brief's Charlie inbox scan (`scripts/scan_inbox_imap.mjs`) stays "ikke konfigureret" until the
  16-char code is added locally too. Sending is unaffected (it runs via the deployed app).

## What this session added on top of the hybrid base
- `src/lib/senders.ts`: added `signatureFor` / `stripSignature` / `applySignature` (re-sign per sender).
- `src/lib/queue.ts`: `sentBy` field + patch.
- `src/app/api/approve/queue/route.ts`: `set-sender` action.
- `src/app/approve/page.tsx`: per-lead Lucas/Charlie toggle + "Sendt som X".
- `src/app/api/approve/send/route.ts`: apply signature, stamp `sentBy`, global by-address dedup.
- `src/lib/compose.ts`: longer personalized value paragraph.
- `scripts/scan_inbox_imap.mjs`: read-only IMAP scan for the local brief's Charlie inbox.
- Local task prompts (outside this repo): dual-inbox brief + lead-gen quality/geo retune.

## Open items (confirm via Hermes/Charlie)
1. `autoEngine` OFF in deployed Settings?
2. `CHARLIE_GMAIL_*` set in Vercel env?
3. Anything else Hermes/Charlie changed in Vercel (crons/env)?
4. Charlie sends the 16-char app password to Lucas for `.env.local` (local brief scan).
