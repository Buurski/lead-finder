# BLOCKERS — needs Lucas

Everything that could be done without you is done and committed on `night-build`
(build + lint exit 0, 112 offline tests green, engine dry-run exit 0). The items
below are the only things gated on you. Each says exactly what to do and what it
unlocks. Nothing here blocks the system from running today in deterministic mode.

---

## 1. AI model key (unlocks live RESEARCH/QUALIFY/DRAFT lift)

The model gateway (`src/lib/ai.ts`) is wired and crash-safe, but with **no key**
it returns null everywhere and the system uses its deterministic composer. To
turn on real Sonnet 4.6 (research/qualify) + Opus 4.8 (draft) output, set **one**
of these in `.env.local` (and on Vercel when you deploy):

```
# Preferred — Vercel AI Gateway (observability, fallbacks, ZDR):
AI_GATEWAY_API_KEY=...

# OR direct Anthropic:
ANTHROPIC_API_KEY=...
```

Optional model overrides (defaults shown):
```
AI_MODEL_RESEARCH=anthropic/claude-sonnet-4-6
AI_MODEL_QUALIFY=anthropic/claude-sonnet-4-6
AI_MODEL_DRAFT=anthropic/claude-opus-4-8
AI_DISABLED=1        # kill-switch: force deterministic even with a key
```

**Verify after adding a key:**
```
node .send_queue/daily_engine.mjs --lead="<a real lead name>"
```
then read the draft in `/approve`. Without a key this command still works — it
just produces the deterministic draft.

> Why I couldn't finish it: the *wiring* and the *no-key/bad-key resilience* are
> tested (`scripts/test_ai.mjs`, 16/16). The live *success* path (actual model
> text) is the one thing unverifiable without a real key — I won't fake a green.

---

## 2. APIFY — deliberately OFF (cost decision, 2026-06-03)

You burned Apify credits fast before. In the new pipeline Apify only adds a
FB/IG caption-hook or a social email, and only for leads whose `website` is a
facebook/instagram URL — a marginal subset now covered better+cheaper by the
website scrape + Google reviews + AI. **Not worth it.**

Code is now gated: even with `APIFY_TOKEN` set, social scraping runs ONLY when
`ENABLE_APIFY=1`. Default = off, so the daily engine never burns credits.
- Keep the token if you want; it does nothing until you opt in.
- For a single hot lead you can do a one-off: `ENABLE_APIFY=1 node .send_queue/daily_engine.mjs --lead="X"`.
- Free tier ($5/mo) is fine for that occasional manual use; never for a bulk run.

## 3. GOOGLE_PLACES_API_KEY — set, kept ON (this is the Apify replacement)

Powers the Google-reviews hook (`research.ts → googleReviews`) — genuine
customer-voice openings, the main value that replaces Apify. Billable (~a few
øre per lead) but only on **real** runs (`--dry-run` skips all paid APIs), so a
12-lead daily batch is cheap. To kill it entirely, remove the key.

---

## Decisions I'd like from you (not blocking)

1. **Approve auto-registers to Sheets.** Approving a draft in `/approve` now sets
   the lead's status to `interested` in Sheets (so it leaves the engine's "new"
   pool). If you'd rather approval be silent until a real send, say so and I'll
   gate it behind a flag.
2. **Reply-assistant route.** `src/lib/reply.ts` is ready but not yet exposed as
   an API/UI — it's slotted for the command center. Want a minimal
   `/api/replies` triage endpoint now, or wait for the UI `/goal`?
3. **Qualify name list.** `COMMON_FIRST_NAMES` in `qualify.ts` was expanded to
   stop false-dropping brands (the Lumière/VIDA fix). If you have a list of real
   lost/won leads, I can calibrate the thresholds against it.

## Standing constraints honoured this session

No push, no merge to main, no deploy, no mass-mail, `npm run dev` never run
(browser check used a throwaway `next start`, killed immediately). Test-mail
target, if ever needed, is `buur.aigro@gmail.com` only.
