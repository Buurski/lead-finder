# scripts/

Tracked utilities that live OUTSIDE the deployed Next.js app.

## send.mjs

Local-only Gmail dispatcher. Polls the SendQueue tab on the Leads sheet
and sends each pending row with a triangular 4-14 min spacing. This is
the **only** Gmail caller in the whole system after PR-2 (Phase B of the
DEL 3 implementation).

### Run

```bash
# from anywhere — env loads from .env.local found beside or above this file
node scripts/send.mjs
```

Or copy it to your local `.send_queue/send.mjs` and run from there as
a long-lived background process. The script idles when:

- `PauseSchedule!A2` is set to a future ISO (master kill flag)
- `SendQueue` has zero rows with `status=pending`

When pending rows exist and master pause is clear, it sends them at
4-14 min spacing. Always re-checks the master pause right before
calling Gmail to close the mid-claim race.

### Env required

```
GOOGLE_SHEET_ID
GOOGLE_KEY_FILE
GMAIL_USER
GMAIL_APP_PASSWORD
```

### Log

Appends one line per send / fail / pause-tick to `send_log.txt` next to
the script.

### Migration from the old queue.json based send.mjs

The old `.send_queue/send.mjs` read `queue.json` (filesystem) and updated
`state.json` locally. The new one ignores those files and reads
SendQueue directly from the sheet. To migrate:

1. Stop the old `send.mjs`.
2. Copy this `scripts/send.mjs` to `.send_queue/send.mjs` (replacing the
   old file). Backup the old one first if you want.
3. Start `node .send_queue/send.mjs` — it'll pick up wherever the sheet
   leaves off. Any leftover items in `queue.json` are now orphaned and
   should be re-enqueued via Vercel routes if still relevant.
