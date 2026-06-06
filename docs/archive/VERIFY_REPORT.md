# VERIFY_REPORT — baseline end-to-end (Phase V)

**Branch:** `night-build` · **Date:** 2026-06-03 · **Rule:** commit-only, no push/deploy, no mass-mail, no `npm run dev`.

Baseline of the Del 0–4 build was re-verified end-to-end before any new work. One
genuine bug was found and fixed (qualify false-drop). Everything below was run
and observed — not assumed.

---

## Results

| Check | Command | Result |
|-------|---------|--------|
| Type-check + production build | `npm run build` | ✅ exit 0; all 23 API routes + 5 pages compile; `○ /approve` + `ƒ /api/approve/queue` in route list |
| Lint | `npm run lint` (`eslint src`) | ✅ exit 0, no warnings |
| Engine dry-run (batch) | `node .send_queue/daily_engine.mjs --dry-run --limit=3` | ✅ exit 0; source=**sheets** (live creds); 3 drafts written; 0 sent |
| Engine `--lead` ("skriv til X") | `node .send_queue/daily_engine.mjs --dry-run --lead="Salon"` | ✅ exit 0; 1 targeted draft |
| Pipeline lib contracts | `node scripts/test_pipeline.mjs` | ✅ 23/23 pass offline (qualify, research, draft, validateDraft) |
| `/approve` in browser | `next start -p 3199` → `curl /approve` | ✅ HTTP 200, 11.6 KB, "Godkendelse" UI present; server killed immediately |
| `/api/approve/queue` | `curl /api/approve/queue` | ✅ 200, returns drafts JSON with hooks/demoPair/body |
| Live Sheets read | (via engine PICK) | ✅ engine pulled real leads from Sheets |

Node: v24.15.0 (TS type-stripping for the engine CLI; no build step needed).

---

## Bug found & fixed — qualify false-drop (VIDA-class)

**`scripts/test_pipeline.mjs` surfaced 3 failing assertions**, all one root cause:

`isProfessionalEnough` / `hardDrop` were **dropping established brand leads**
whose name was a single word after the branch prefix — e.g. **"Salon Lumière"**
(132 reviews, score 81). Two defects in `src/lib/qualify.ts`:

1. **Over-broad personal-name catch-all.** `isBarePersonalName` treated *any*
   single capitalised token as a personal name (`/^[a-zæøå]{2,}$/`). That drops
   real brands — Lumière, **Vida**, Zenz, Aria. This is exactly the false-drop
   class Lucas flagged for losing the VIDA lead.
   **Fix:** a single-token residue is dropped **only** if it's a known first
   name (`COMMON_FIRST_NAMES`, now expanded ~80 names). Unknown single words
   survive the cheap filter and are judged on establishment signals
   (reviews/score/site) by the full gate.

2. **Possessive-stripper mangled real names.** `/s\b/` turned **"Jonas" → "Jona"**,
   so even known names ending in *s* slipped through once the catch-all was
   removed. **Fix:** new `matchesFirstName()` tests both the token and its
   possessive-stripped form against the set, without destroying names that
   genuinely end in *s*. Also fixed two-token path to accept `é` (Lumière).

**Verification:** `node scripts/test_pipeline.mjs` → 23/23 pass. `npm run build`
+ `npm run lint` still exit 0. "Frisør Adnan" / "Hos Jonas" / "Quick Klip 99 kr"
still drop correctly; "Salon Lumière" / "Studio Hud & Velvære" now pass.

---

## Intentionally NOT exercised

- **Send-capable routes** (`bulk-send`, `leads/[id]/send-email`, `test-send`,
  `send-followups`) were **not triggered** — no-mass-mail rule. They are proven
  to compile (build exit 0); a `buur.aigro@gmail.com`-only test-send is deferred
  to the hardening phase if needed.
- **No deploy, no push, no `npm run dev`.** The browser check used a throwaway
  `next start` on port 3199, killed within seconds.

## Artifacts added this phase

- `scripts/test_pipeline.mjs` — offline regression harness for qualify/research/draft.
- `src/lib/qualify.ts` — false-drop fix (see above).
