# HARDENING_REPORT — core quality (Phase QUALITY)

**Branch:** `night-build` · **Date:** 2026-06-03 · commit-only, no push/deploy, no mass-mail.

The core pipeline was hardened across five fronts from the goal brief. Every
change ships with offline regression tests (`node scripts/test_all.mjs` → 112
checks green) and keeps `npm run build` + `npm run lint` at exit 0. No API key is
required for any of this to run — the deterministic path is always the fallback.

---

## 1. Email-finder — one layer, freemail kept (VIDA fix)

**`src/lib/email-finder.ts`** (new) is now the single email-discovery
implementation; `app/api/email/bulk-find-emails/route.ts` imports it (≈180 lines
of duplicated logic removed → no drift).

- **`rankEmailCandidates()`** ranks candidates best-first and **keeps free-mail**
  (gmail/hotmail/…) as a last resort instead of discarding it. The old route
  dropped free-mail unless it was the *only* candidate, which silently lost
  gmail-only businesses — the **VIDA** class of miss. Tier order:
  domain-match non-role > domain-match role > other-domain real > role > free-mail.
- **`findEmailViaSocial()`** — new FB/IG source via Apify (token-gated), for
  businesses whose only web presence is social.
- **`/kontakt` follow** — the website scrape now follows an obvious
  kontakt/contact/about link, where addresses usually live.
- Website + CVR sources retained. Chrome UA + `r.jina.ai` markdown fallback
  retained (renders JS-heavy / bot-blocked sites).
- **Regression:** `scripts/test_email_finder.mjs` — 17 checks incl. the explicit
  VIDA "gmail-only kept" case, phone-prefix stripping, placeholder rejection.

## 2. Research — Google reviews + JS/Chrome fallback

**`src/lib/research.ts`**

- **`googleReviews()`** (new) — Google Business review text via the Places API
  (New), token-gated on `GOOGLE_PLACES_API_KEY` (present). Produces a genuine
  customer-voice hook (*"en kunde fremhæver: …"*) and feeds the fuller review
  text to the AI hook-refiner as corpus. Brief §8.
- Chrome-UA + retry + `r.jina.ai` markdown fallback for JS-heavy/blocked sites
  was already in place and is retained.
- **`useNetwork` flag** — all paid/network enrichment (web fetch, Apify, Places)
  is gated so `--dry-run` stays free and offline (lead-local hooks only). The
  engine passes `useNetwork = useAI = !dryRun`.

## 3. AI hook-refinement + qualify tiebreaker (Sonnet 4.6)

(Wired in the AI phase, exercised here.) `research_lead` optionally distils one
human opening hook from the collected corpus and adjudicates the **borderline
"thin profile"** qualify band with Sonnet — never overriding a hard cheap/
personal drop. Both gated by `isAiEnabled()` + `useAI`; deterministic results
are the fallback.

## 4. One data layer — queue ↔ Sheets

**`src/lib/datalayer.ts`** (new) bridges the `.send_queue` approval queue and the
Sheets CRM, so an outcome no longer dies in the JSON file (VIDA *won but never
registered*).

- `rowIndexFromLeadId()` — pure mapping (Sheets row → `rowIndex = row-2`).
- `registerDraftApproved()` / `registerDraftSent()` — write status/email-status
  back to the lead row. Wired into `POST /api/approve/queue` (approve action),
  best-effort: a Sheets failure never blocks the approval.
- `registerReplyOutcome()` — flips a lead to **client** / skip / interested from
  a reply classification (the VIDA path).
- `sheets.ts` is imported **lazily**, so the plain-node engine never drags in
  googleapis and an offline/no-creds call degrades to `{ok:false}` (never throws).
- **Regression:** `scripts/test_datalayer.mjs` — 10 checks incl. degrade-without-throw.

## 5. Reply-assistant

**`src/lib/reply.ts`** (new)

- **`classifyReply()`** — deterministic Danish intent classifier →
  interested / question / objection / not-interested / auto-reply / wrong-person
  / unsubscribe, with `isInterested`, `becameClient` (auto-client detection),
  `shouldStop` flags.
- **`draftReply()`** — a warm, in-voice suggested response. Opus 4.8 via `ai.ts`
  when a key is set (validated by `validateDraft` — no price/robot, must end
  "Mvh, Lucas"); deterministic per-category template otherwise and as the
  fallback. Never auto-replies to an autoresponder.
- **Regression:** `scripts/test_reply.mjs` — 46 checks (classification matrix +
  every deterministic reply obeys the voice rules).

---

## Verification

| Command | Result |
|---------|--------|
| `node scripts/test_all.mjs` | ✅ 112 checks across 5 suites, all green |
| `npm run build` | ✅ exit 0 |
| `npm run lint` | ✅ exit 0 |
| `node .send_queue/daily_engine.mjs --dry-run --limit=3` | ✅ exit 0, deterministic, no paid API |

## New files

- `src/lib/email-finder.ts`, `src/lib/reply.ts`, `src/lib/datalayer.ts`
- `scripts/test_email_finder.mjs`, `scripts/test_reply.mjs`,
  `scripts/test_datalayer.mjs`, `scripts/test_all.mjs`

## Not done (needs Lucas — see BLOCKERS.md)

- Live AI output quality (gateway/Anthropic) — needs `AI_GATEWAY_API_KEY` or
  `ANTHROPIC_API_KEY`. All AI paths are wired and crash-safe; only the live
  *success* path is unverifiable without a key.
- Real paced sending from `/approve` (cold-path) remains a later layer; this
  phase only registers approval status back to Sheets, never sends mail.
