# Run report — beauty/wellness batch, North Jutland — 2026-06-01

Overnight outreach run while Lucas slept. Segment: **beauty & wellness only**
(no medical/regulated clinics). Mode: **find + send directly, paced**. Region:
**North Jutland** (agent's choice — least overlap with the Aarhus/Fyn-heavy
history; still deduped against the full 8,459-row sheet).

## TL;DR

- **10 personalised cold emails sent** to fresh, verified beauty/wellness
  businesses in North Jutland. All from `buur.aigro@gmail.com`, paced, with
  one-click List-Unsubscribe + opt-out line.
- **All 10 logged to the Leads sheet** (rows 8461–8470): `emailSentAt` (col O)
  and `emailStatus` (col R) written per send. **5 already show `opened`** within
  minutes (tracking pixel firing) — delivery confirmed.
- **False-"dead" website bug fixed** — the thing you flagged. No email in this
  batch makes any negative claim about a site; every lead has a confirmed-live
  site and got the gentle "fungerer fint, men en lille opdatering…" line.
- **Halt-flag re-armed** to `2026-07-01` after the batch, so the system won't
  send anything unattended.

## The 10 leads

| # | Business | By | Branch | Site tier | Email | Sheet row |
|---|----------|-----|--------|-----------|-------|-----------|
| 1 | Hair by Aagaard | Biersted | frisør | mediocre | hair-by-aagaard@hair-by-aagaard.dk | 8461 |
| 2 | Afrodidde | Sæby | frisør | mediocre | info@afrodidde.dk | 8462 |
| 3 | Klitmøller Spa | Klitmøller | kosmetolog/spa | mediocre | info@klitmollerspa.dk | 8463 |
| 4 | Salon New Image | Klarup | salon | mediocre | info@salon-newimage.dk | 8464 |
| 5 | Krop & Sjæl | Hadsund | velvære | mediocre | info@kropogsjaelhadsund.dk | 8465 |
| 6 | EM Hair Studio | Støvring | frisør | old | info@emhairstudio.dk | 8466 |
| 7 | SMUK by GREN | Barmer | barber/beauty | mediocre | kontakt@smukbygren.dk | 8467 |
| 8 | Rebild Massage | Skørping | massage | old | info@rebildmassage.dk | 8468 |
| 9 | Salon Muddi | Dronninglund | frisør | mediocre | bawade19@gmail.com | 8469 |
| 10 | Frisør Nymark | Vodskov | frisør | mediocre | frisornymark@hotmail.dk | 8470 |

Every email: warm compliment → soft website line (no criticism) → both beauty
demos (salon-artec + streetcut) → "demoen ville matche jeres stil/behandlinger"
→ low-friction CTA → opt-out. No price talk. Same voice as your existing beauty
template.

## What "a good lead" meant here (recovered from your code + past runs)

Clean real email · never contacted before · not a chain · not public-sector ·
website **not already modern** (no point pitching a fresh site to someone who
has one) · score ≥ 50 (rating × reviews, +30 no-site, +15 for ≥20 reviews).

## How the batch was built

1. Confirmed the master halt-flag (`PauseSchedule!A2`) was already empty — cold
   path live. (Re-armed it at the end.)
2. Checked the existing pool first: 1,247 beauty rows, but **0** were both
   non-modern *and* had a known email (the weak-site leads are exactly the ones
   where email discovery had previously failed) — so a fresh scrape was needed.
3. Scraped **342** fresh North-Jutland beauty businesses (8 sub-branches × 30
   towns), deduped against the whole sheet, chains removed.
4. For each: hardened website check (below) + email discovery → kept only those
   with a confirmed-live non-modern site and a trustworthy email → top 10.

## The false-"dead" fix (you flagged this)

Root cause: the old checker fetched sites as `LeadBot/1.0`, which trips
Cloudflare / 403 / 429 bot-blocks; a blocked or timed-out fetch was then labelled
`dead`, and the email told a healthy business "din hjemmeside har tekniske
udfordringer." Fixed in **two** places:

- **This batch's checker**: real Chrome user-agent, one retry on block codes,
  then an `r.jina.ai` reader fallback; a site is only "down" on a genuine **DNS
  failure**. Anything blocked/uncertain was **dropped**, never guessed — so no
  false claim could go out. (It also dropped wrong-recipient emails: I enforced
  that the address must belong to the business's own domain, or be a free-mail
  address published on the business's own site. This caught e.g. a web-designer's
  `@taidal.dk` on a salon's footer and a garbage CVR match `info@cotes.com`.)
- **The repo** (so it never recurs):
  - `src/app/api/verify-all/route.ts` — `analyzeUrl` now uses the real UA +
    retry + reader fallback, returns `tier=null` (skip, retry next run) on
    blocked/uncertain instead of `"dead"`; only DNS failure → `"dead"`. The POST
    loop skips `null` tiers so blocked sites stay unverified rather than
    mislabelled.
  - `src/lib/email.ts` — the `"dead"` website line no longer asserts the site is
    broken; it's now a neutral offer, so even a future misclassification can't
    insult anyone.

**Note:** these repo edits are in your working tree, reviewed and type-checked by
hand, but I could **not run `npm run build` here** — the sandbox's mounted
`.next` is a FUSE volume that blocks `unlink`, and Turbopack rejects a symlinked
`node_modules`. Please run `npm run build` before your next deploy. The changes
are small and isolated.

## Notes / suggestions

- **No-website leads were dropped.** Several high-score salons have no site at
  all (great prospects), but their only emails came from CVR and were unreliable
  (wrong company). Worth a dedicated, manual email-finding pass if you want them.
- **Follow-ups**: these 10 are cold #1. Your follow-up path is still paused
  (and the master halt is re-armed) — clear the flags when you want the 7-day
  follow-up to flow.
- Tracking pixel/click URLs point at `lead-finder-three-beta.vercel.app`.
- Scratch + manifests for this run live in `.send_queue/` (`_final_send.json`,
  `_dispatch.log`, `_out2.json`, `_raw2.json`).
