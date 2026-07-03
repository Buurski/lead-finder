# Bundle C - Gratis SEO-tjek-tragt - DONE (2026-07-03)

Branch: `feat/bundle-c-seo-tjek-2026-07-02` (pushet, IKKE merged til main).
Deliverable-mail sendt til buur.aigro@gmail.com med 3 eksempel-rapporter.

## Preview

- Formular: https://lead-finder-9xpmwc7rk-buurskis-projects.vercel.app/seo-tjek
- Eksempel-rapport (live E2E-test, trend-cut.dk):
  https://lead-finder-9xpmwc7rk-buurskis-projects.vercel.app/seo-tjek/rapport/4a031c84-bb97-49b5-8cfa-1b302f8b389a
- Live-verificeret: submit -> rapport -> day 0-mail -> afmeld (stats: 1/1/1/0/1).
- Preview viser "?" i score-cirkler: PAGESPEED_API_KEY er kun sat til Production.
  Giv den preview-target i Vercel-dashboardet hvis oensket.

## Eksempel-rapporter (lokal koersel med fulde scores, i mail + audits/seo-tjek/)

| Site | Mobil | Desktop | Bemaerkning |
|---|---|---|---|
| jernbanecafeen.dk (restaurant, Ikast) | 27 | 25 | Meget langsom; har easyTable-booking |
| vida-ten-gamma.vercel.app (klinik-demo) | 78 | 66 | schema + llms.txt ok; mangler titel/beskrivelse |
| trend-cut.dk (frisoer, Ikast) | 57 | 52 | Nr. 1 paa "frisoer i Ikast" i Maps; kun 1 fix |

## Leveret

- `src/lib/seo-tjek.ts` - strip-safe lib: validering (SSRF-guard), booking-audit,
  lokal-rang (Places), desktop PageSpeed, top 3 fixes paa dansk, rapport-HTML
  (print = PDF), day 0/day 7-mails, stats. 45 offline-tests (`test_seo_tjek.mjs`).
- `/seo-tjek` offentlig formular (raw-HTML route, udenfor basic auth via proxy-matcher).
- `POST /api/seo-tjek/submit` - 3/time per IP, 50/dag globalt (SEO_TJEK_DAILY_CAP),
  24t dedupe, day 0-mail via senders.ts, SEO_TJEK_TEST_RECIPIENT-override.
- `/seo-tjek/rapport/[id]` - UUID-gated offentlig rapport, noindex, Gem som PDF.
- `GET /api/seo-tjek/unsubscribe` - et-kliks afmeld (GDPR), idempotent.
- `GET /api/seo-tjek/stats` - bag basic auth: taellere + indsendelsesliste.
- `/api/cron/seo-tjek-followup` - dagligt 07:15, day 7-upsell m. Vida-case,
  naegter at koere paa Vercel uden CRON_SECRET, max 20/koersel.
- `docs/backlog/cold-email-hardening.md` - parkerede kold-email-ideer (scope-aendring).

## Lucas skal selv

1. `SEO_TJEK_BOOKING_URL` i Vercel prod (Cal.com-link) - ellers mailto-fallback.
2. Evt. PAGESPEED_API_KEY preview-target.
3. Merge naar godkendt.

## Noter

- Council (2 lenses) koert + fixes committed (72eb284).
- Vercel CLI-deploy fra session = forbudt fremover (collaborator-mail-episoden);
  kun git-push, GitHub-integrationen deployer. Gemt i memory.
- Preview-env fik tilfoejet GOOGLE_PLACES_API_KEY, GMAIL_USER/APP_PASSWORD og
  SEO_TJEK_TEST_RECIPIENT=buur.aigro@gmail.com (preview-target only, via API
  inden CLI-forbuddet; kan fjernes i dashboardet hvis uoensket).
