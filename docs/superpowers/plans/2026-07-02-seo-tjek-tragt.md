# Gratis SEO-tjek-tragt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public lead-magnet funnel: form (URL+email+consent) -> automated SEO/AI-readiness report (HTML + print-to-PDF) -> day 0 report mail + day 7 upsell mail -> tracking counters.

**Architecture:** One new strip-safe lib `src/lib/seo-tjek.ts` composes existing `runSeoChecks()` (seo.ts) with a desktop PageSpeed call, a Places-based local-rank check, a booking-audit, plain-Danish top-3 fixes, and an HTML report builder. Public page `/seo-tjek` posts to `/api/seo-tjek/submit` which runs checks inline (maxDuration 300), stores submission via `store`, sends day 0 mail via `senders.ts`. A daily cron sends day 7 follow-up. Report is a public page `/seo-tjek/rapport/[id]` with print CSS ("Gem som PDF" = window.print, no PDF lib added — YAGNI).

**Tech Stack:** Next.js 16 App Router, existing store.ts (FS/KV), nodemailer via senders.ts, Google PageSpeed API (PAGESPEED_API_KEY), Google Places API (searchPlaces in apify.ts), no new dependencies.

## Global Constraints

- Feature branch `feat/bundle-c-seo-tjek-2026-07-02`, commit-only, NO push to main, no prod deploy.
- Test mails ONLY to buur.aigro@gmail.com. TEST_MODE env redirects recipients like /api/approve/send does.
- GDPR: consent checkbox required, consent timestamp stored, unsubscribe link in every mail, unsubscribe sets flag that blocks day 7 mail.
- Public routes must be rate-limited (public + triggers paid API calls + sends mail).
- Danish copy, plain language ("almindeligt sprog, ikke jargon"), no em-dashes/emojis in mails.
- Strip-safe lib (no Next imports; store/sheets via lazy dynamic import) so node CLI can run it.
- All new pure logic covered by offline tests in `scripts/test_seo_tjek.mjs`, wired into `scripts/test_all.mjs`.

---

### Task 1: Lib `src/lib/seo-tjek.ts` + offline tests

**Files:**
- Create: `src/lib/seo-tjek.ts`
- Create: `scripts/test_seo_tjek.mjs`
- Modify: `scripts/test_all.mjs` (add suite)

**Interfaces (Produces):**
```ts
export interface SeoTjekSubmission {
  id: string; url: string; email: string; branch?: string; city?: string;
  consent: true; consentAt: string; createdAt: string;
  day0SentAt?: string; day7SentAt?: string; unsubscribedAt?: string;
  reportReady?: boolean;
}
export interface LocalRankResult { available: boolean; query: string; position: number | null; total: number; topNames: string[]; note: string }
export interface BookingAudit { relevant: boolean; found: boolean; system: string | null; note: string }
export interface SeoTjekReport {
  submissionId: string; url: string; host: string; ranAt: string;
  seo: SeoResult;                       // from runSeoChecks
  desktop: LighthouseScores | null;      // desktop PageSpeed
  localRank: LocalRankResult | null;
  booking: BookingAudit;
  fixes: Array<{ title: string; why: string; how: string }>;  // top 3, plain Danish
}
// pure (offline-testable):
export function validateSubmission(input: unknown): { ok: true; url: string; email: string; branch?: string; city?: string } | { ok: false; error: string }
export function detectBookingSystem(html: string, branch?: string): BookingAudit
export function plainFixes(seo: SeoResult, booking: BookingAudit, localRank: LocalRankResult | null): SeoTjekReport["fixes"]
export function matchRank(places: Array<{ title: string; website?: string }>, host: string, name?: string): number | null
export function renderReportHtml(r: SeoTjekReport, opts?: { standalone?: boolean }): string
export function day0Mail(sub: SeoTjekSubmission, report: SeoTjekReport, reportUrl: string): { subject: string; text: string; html: string }
export function day7Mail(sub: SeoTjekSubmission, reportUrl: string): { subject: string; text: string; html: string }
// network (not offline-tested):
export async function runDesktopPageSpeed(url: string): Promise<LighthouseScores | null>
export async function runLocalRank(host: string, name: string, branch?: string, city?: string): Promise<LocalRankResult>
export async function runFreeCheck(sub: SeoTjekSubmission): Promise<SeoTjekReport>
```

Booking detection: relevant when branch/schema matches salon/restaurant regex; scan HTML for known DK systems (Planway, Treatwell, Bookatable, DinnerBooking, easyTable, resDiary, OpenTable, Fresha, Salonized, bestil-tid/book-tid links). plainFixes maps machine issues -> {title, why, how} in plain Danish, priority: performance < 50, missing schema, missing meta/title, booking missing, robots blocking AI bots, no llms.txt, local rank low.

- [ ] Steps: write tests (validate/detect/fixes/rank/render), run fail, implement, run pass, `node scripts/test_all.mjs` green, commit.

### Task 2: Public form page `/seo-tjek` + submit API

**Files:**
- Create: `src/app/seo-tjek/page.tsx` (server shell, calm styling matching site)
- Create: `src/app/seo-tjek/SeoTjekForm.tsx` (client component)
- Create: `src/app/api/seo-tjek/submit/route.ts` (POST, maxDuration 300)
- Modify: `src/proxy.ts:21` matcher — exempt `seo-tjek` page prefix + `api/seo-tjek/submit` + `api/seo-tjek/unsubscribe`

**Consumes:** validateSubmission, runFreeCheck, renderReportHtml, day0Mail, store, getTransporter/defaultSender/formatFrom.

Submit flow: validate -> rate limit (KV REST per-IP 3/hour, in-memory fallback; plus dedupe: same URL+email within 24h returns existing report) -> create id (crypto.randomUUID) -> store submission `seo-tjek/sub-{id}` -> run checks -> store report `seo-tjek/report-{id}` -> send day 0 mail (TEST_MODE redirect) -> bump stats -> respond `{ id, reportUrl }`. Form shows progress state ("tjekker din side, tager ca. 1 minut") then link.

- [ ] Steps: implement, `npm run build` green, commit.

### Task 3: Report page + unsubscribe + stats

**Files:**
- Create: `src/app/seo-tjek/rapport/[id]/page.tsx` (public, reads report from store, print CSS, "Gem som PDF" button, CTA "Book 15 min" -> env `SEO_TJEK_BOOKING_URL` fallback mailto buur.aigro)
- Create: `src/app/api/seo-tjek/unsubscribe/route.ts` (GET ?id= -> set unsubscribedAt, friendly Danish confirmation page)
- Create: `src/app/api/seo-tjek/stats/route.ts` (GET, behind basic auth by default matcher: counters + submission list)

- [ ] Steps: implement, build green, commit.

### Task 4: Day 7 follow-up cron

**Files:**
- Create: `src/app/api/cron/seo-tjek-followup/route.ts` (GET, Bearer CRON_SECRET pattern, maxDuration 120)
- Modify: `vercel.json` (cron `15 07 * * *`)

Logic: list `seo-tjek/sub-*`; for each: consent && day0SentAt && !day7SentAt && !unsubscribedAt && createdAt <= now-7d -> send day7Mail (retainer upsell + Vida case), set day7SentAt, bump stats. Cap 20/run.

- [ ] Steps: implement, build green, commit.

### Task 5: Council review + self-review + fixes

3-lens council (A improvements, B risks, C keep): 2 parallel subagents max. Fable self-review of diff. Apply findings. Commit.

### Task 6: Real-site verification

- Create: `scripts/_seo_tjek_run.mjs` — node CLI: run runFreeCheck for jernbanecafeen (find real URL), vida-ten-gamma.vercel.app, one random Ikast site; write HTML reports to `audits/seo-tjek/`.
- Local `next start` browser check of form + report page; close server after.
- Attempt Vercel preview deploy (VERCEL_TOKEN in ../buur-cms/.env.local; task explicitly requests preview URL). If blocked, deliver localhost screenshots + note.

### Task 7: Deliverable mail

Send to buur.aigro@gmail.com via nodemailer (creds .env.local): subject "AgenticOS Bundle C - Gratis SEO-tjek-tragt færdig", preview URL, 3 example reports attached, tracking setup description. No em-dashes/emojis/AI-phrases.

## Self-Review notes

- Spec coverage: form (T2), backend PageSpeed+AI-readiness+competitor (T1/T2), report HTML+PDF (T1/T3), CTA (T3), day0/day7 mails (T2/T4), GDPR consent+unsubscribe (T1-T4), tracking (T2-T4 stats), real-site test + preview (T6), deliverable (T7). Backlog doc already committed separately.
- PDF: print CSS chosen over puppeteer dep — noted as deliberate guess per run rules.
- City for competitor check: optional form field + fallback derive from Places lookup of host name. Noted.
