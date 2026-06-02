# DEEP AUDIT — Lead-System — 2026-05-26 (read while drinking coffee)

> Read-only audit. Nothing modified, nothing sent, nothing scraped.
> Builds on Lucas's own `AUDIT_2026-05-26.md`. Where it overlaps I note it; the rest is new.

---

## 1. Executive summary (3 bullets)

1. **Four API routes do not compile.** `bulk-send`, `bulk-find-emails`, `send-followups`, and `sync-replies` all have orphan code fragments pasted into the middle of the file (lines like `ults.push(...)`, `esponse.json(...)`, `ntent-Type"`, `mailStatus(rowIndex,...)`). Brace counts are mismatched. `npm run build` will fail. The HEAD git versions are clean — these are local-working-tree corruptions, probably from an interrupted Write. **This is the #1 thing to fix in the morning.**
2. **39 of 57 already-sent emails (today + last night) contain the BANNED `5.000 kr alt inklusiv` pricing line** — they were composed by `.send_queue/.compose.mjs` (the OLD composer) before the new pricing rule landed. `pending_batch.json` was patched by `.fix_pending_pricing.mjs`, but `queue.json` was generated independently and never patched. The 8 still-pending in `queue.json` are clean. The 39 sent are already in the wild — nothing to do but log the lesson. Also: `src/lib/email.ts` has NO pricing line at all and still uses old "hurtig mockup" CTA wording in all 6 templates (cold + followup × food/craft/photo/beauty/professional/gallery/service).
3. **Real-but-low security hygiene issues:** plaintext Gmail app password in `.send_queue/send.mjs` (line 17), service-account JSON sitting at `.send_queue/.sa.json`, `.send_queue/` is NOT gitignored, click-tracker is an open-redirect, and `.gitignore` doesn't cover any of `.send_queue/`, `.sa.json`, or `send.mjs`. One careless `git add .` exposes everything.

---

## 2. Critical bugs

### 2.1 Four API route files are corrupted in the working tree (build is broken)

| File | Symptom (orphan line / location) | Brace count |
|---|---|---|
| `src/app/api/email/bulk-send/route.ts:185` | `ults.push({ name: ... })` — looks like a copy-paste that lost its first 2 chars (`res`). Two duplicated `PATCH` handlers also (lines 172 and 224). | open 57 / close 60 |
| `src/app/api/email/bulk-find-emails/route.ts:258` | `esponse.json(...)` — lost `return NextR` prefix. Two `POST` handlers (lines 220 and 262). | open 93 / close 95 |
| `src/app/api/email/send-followups/route.ts:200` | `ntent-Type": "application/x-ndjson"` — lost `headers: { "Co`. File ends with stray `}\n}` (orphan extra brace). | open 54 / close 61 |
| `src/app/api/email/sync-replies/route.ts:105`, `:154` | `end);` and `mailStatus(rowIndex, ...)` — both orphans. | open 40 / close 43 |

**Impact:** `npm run build` fails → cannot redeploy to Vercel; production is running an older deployed bundle. Any tweak you push will fail CI. Lucas hasn't noticed because he hasn't deployed since 6a8d297 (`fix: softer email tone + new craft demos + SMTP/MX verification + Dead Leads tab`).

**Cause:** Each file's content was effectively duplicated and then truncated mid-line. Compare against `git diff HEAD src/app/api/email/bulk-send/route.ts` — HEAD is clean and contains all the intended new code.

**Suggested fix:** For each of the 4 files, `git diff HEAD --` and re-apply the staged additions cleanly. Don't `git checkout --` blindly — you'll lose the daily-cap + isGmailRateLimit changes you added (which are NOT in HEAD yet). Easiest path: open each file, delete everything below the last legitimate `}`, then re-add the lost trailing content from the diff.

### 2.2 chains.ts apostrophe word-boundary bug

**File:** `src/lib/chains.ts:7` (Lucas flagged this in `AUDIT_2026-05-26.md` already; here's the reproduction.)

```
Bone's Aalborg     → isChain = false   ❌ (should be true)
Bones Aalborg      → isChain = true    ✓
Papa John's Pizza  → isChain = true    ✓ (apostrophe IS in the search string)
Sticks n sushi     → isChain = false   ❌ (no apostrophe — escapes filter)
Sticks'n'sushi     → isChain = true    ✓
```

The `\b<chain>\b` boundary fails when the apostrophe sits between the matched stem and `s`. Real risk: any "Bone's" lead with email + score ≥ 50 will land in `bulk-send`.

**Fix:** In `CHAIN_EXACT`, change `"bones"` → `"bone's"`. Also add `"sticks n sushi"` as a sibling entry to cover the spaced variant.

### 2.3 Open redirect in click tracker

**File:** `src/app/api/email/track/click/[leadId]/route.ts:8,25`

```ts
const url = req.nextUrl.searchParams.get("url") ?? "/";
...
return NextResponse.redirect(url);
```

Any attacker can craft `https://your-app.vercel.app/api/email/track/click/123?url=https://phish.example/` and you've turned your own domain into a redirector — useful for phishing kits that want a trusted domain in the visible URL. Low odds anyone targets your domain, but it's the kind of thing that gets your sender reputation hit if a security scanner catches it.

**Fix:** Whitelist destination domains against the union of `DEMO_URLS` (and possibly the lead's own website). Reject anything else with a 400. Lucas already builds tracked URLs from a fixed set in `buildTrackedClickUrl()`, so the whitelist is short.

### 2.4 `send.mjs` never writes back to the sheet

**Files:** `.send_queue/send.mjs:101`, `src/app/api/email/send-followups/route.ts:18-22`

Lucas already documented this. Reconfirming: `state.json` is the only record of what's been sent via the queue. Sheet column O (emailSentAt) stays empty → `isReadyForFollowup()` returns `false` → no follow-ups will ever fire for the 57 emails sent in the past 48h.

**Fix:** Add a Sheets-update call after the successful `sendMail` in `send.mjs` (using the same `googleapis` pattern from `.fresh_scrape.mjs`). Set columns O (emailSentAt) and R (emailStatus="sent"). Lookup `rowIndex` via `lead.rowIndex` if you start emitting it from the composer.

### 2.5 `verify-all` emits "dead" for FB-only sites, but morning task uses "fb_only"

**File:** `src/app/api/verify-all/route.ts:51`, `src/lib/sheets.ts:26`

```ts
// verify-all
if (/facebook\.com|...tiktok\.com/i.test(fullUrl)) return { tier: "dead", email: null };
```

But `WebsiteQualityTier = "modern" | "mediocre" | "old" | "dead" | ""` — `fb_only` is not a valid value, so verify-all is forced to write the wrong tier. The morning-task SKILL still classifies fb_only separately and gives it different copy. The two pipelines disagree on what column L means.

**Fix:** Add `"fb_only"` to the `WebsiteQualityTier` union in `sheets.ts`; have `verify-all` return it; add an `if (tier === "fb_only") return 22;` (between dead and old) in `websiteQualityBonus`.

### 2.6 `scoreLead` doesn't penalize fb_only leads

**File:** `src/lib/apify.ts:170` (Lucas flagged this; reconfirming.)

```ts
if (!place.website) score += 30;
```

`place.website` is a non-empty string for facebook.com — so no `+30` (good). But `+30` is also withheld for facebook.com leads, which is fine. The real issue: an "fb_only" lead is the WORST kind of lead (small, low budget, but at least findable) and currently scores identically to a lead with a working Wix template. They probably deserve a `-10` so they sort lower in eligibility lists. Production impact today: probably none, but you'll see them creep into batches as beauty volume grows.

### 2.7 Inconsistent score thresholds across pipelines

| Caller | Threshold | File |
|---|---|---|
| `bulk-send` (live API route) | score ≥ 50 (general), ≥ 70 (professional) | `bulk-send/route.ts:48` |
| Morning task `lead-batch-morning` | score ≥ 40 | per SKILL.md (and `.sheet_branch_audit.mjs:112` uses `< 40`) |
| `.sheet_branch_audit.mjs` | score ≥ 40 | line 112 |

Same lead → eligible in morning batch, rejected by bulk-send. Pick one. Since Lucas no longer uses bulk-send (it's broken — see 2.1), aligning to 40 in `bulk-send` is the lowest-risk change.

### 2.8 `appendLeads` writes a hard-coded number of columns; `Lead` interface has 21 (A:U)

**File:** `src/lib/sheets.ts:205-232`

```ts
const values = leads.map((l) => [
  l.name, l.branch, l.phone, l.city, l.score, l.source, l.website,
  l.websiteStatus, l.status, l.notes, l.lastUpdated, l.websiteQualityTier ?? "",
  l.enrichedInfo ?? "", l.email ?? "",
  "", "", "", "", "",       // columns O–S
  l.reviewsCount ?? 0,     // column T
  "",                       // column U
]);
```

Comment says "columns O–S (5 empty)" but there are only 5 fields (`O P Q R S`). OK that's right. But the `appendLeads` in `.send_queue/.fresh_scrape.mjs:184-188` writes **20 columns** (missing column U). If a fresh-scrape lead's row gets read by `getLeads()`, `callbackDate` defaults to `""` which is fine. But if Sheets ever interprets the row-length differently (it does for append with a non-trailing trailing-empty), values can shift right. Verify by spot-checking a recent fresh_scrape row against a recent UI-scrape row — the column counts must match exactly.

### 2.9 `getLeads()` row indices vs `lead.id`

**File:** `src/lib/sheets.ts:75-99`

`id: String(i + 2)` (sheet-row-number, 1-based with +1 offset for header). Many call sites then compute `rowIndex = parseInt(id) - 2` to undo it. Round-trip works as long as no one ever deletes a row in the middle of the file *between* `getLeads()` and the next update. The flow `getLeads → sendLeadEmail → updateLeadEmailStatus(rowIndex)` is safe in a single request. The flow `getLeads → enqueue to send.mjs → 4 hours later, send → update by rowIndex` is NOT safe — if you (or `cleanup`) delete chain rows in between, you write to the wrong row.

**Mitigation:** Use the lead's `name` or a stable hash as the secondary key when the gap between read and write exceeds a few seconds. Or skip `cleanup`/deletes while the send queue is draining.

---

## 3. Voice / tone violations (the urgent batch)

### 3.1 In the actively-running `.send_queue/queue.json` — IMPORTANT BUT CONTAINED

| Metric | Count |
|---|---|
| Total entries in queue.json | 65 |
| Sent so far (per state.json) | 57 |
| **Pending (next ~1.5h of sends)** | **8** |
| Pending that contain banned `5.000 kr alt inklusiv` line | **0** ✓ |
| Already-sent that contained the banned line | **39** (already in the wild — recipients have received them) |

The next 8 (`Quist&Bülow VVS`, `AC as`, `VVS Center Bjarne Ørsted`, `Sten & Gert's VVS`, `VVS-Tek ApS`, `Hørning Installation ApS`, `Helsted VVS ApS`, `BKM Tagdækning ApS`) are CLEAN — Lucas can let `send.mjs` finish. No need to kill the process tonight.

The 39 already sent are unrecoverable but worth a debrief: voice-sample harvesting (the morning task pulls "Gmail Sent" as the source of truth) must EXPLICITLY skip messages dated before 2026-05-26 evening, or it'll keep treating banned phrasings as canonical brand voice. The morning task SKILL needs a "voice cutoff" timestamp.

### 3.2 In `src/lib/email.ts` — the codebase has NEVER been updated to the new rules

| Line | What's there now | Violates rule |
|---|---|---|
| 271 (food followup) | `Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne billeder og farver — helt uforpligtende. Sig endelig til hvis det lyder interessant.` | NEW CTA is `Hvis det lyder interessant kan jeg sende en gratis demo der er bygget specifikt til [name] — helt uden binding.` |
| 286 (food followup HTML) | same | same |
| 397 (photo followup) | `Hvis du er nysgerrig, kan jeg lave en hurtig mockup med nogle af dine egne billeder...` | same |
| 411 (photo followup HTML) | same | same |
| 458 (professional followup) | `Hvis I er nysgerrige, kan jeg lave en hurtig mockup tilpasset ${v.name}...` | same |
| 472 (professional followup HTML) | same | same |
| 525 (beauty followup) | `Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer...` | same |
| 540 (beauty followup HTML) | same | same |

`src/lib/email.ts` **never mentions price at all** in any of its 14 templates. The new pricing rule (`Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt.`) is only in `.send_queue/.compose_new.mjs:288` and in the patched `pending_batch.json`. If anyone calls `/api/email/bulk-send`, `/api/email/send-followups`, or `/api/leads/[id]/send-email`, none of the new rules apply.

**Suggested replacement (apply to all 8 followup blocks above):**

Replace the "hurtig mockup" sentence with two sentences:

```
Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt.

Hvis det lyder interessant kan jeg sende en gratis demo der er bygget specifikt til ${v.name} — helt uden binding. Sig endelig til.
```

Same content goes into the HTML versions, wrapped in `<p>...</p>`.

For the COLD templates (food/craft/photo/professional/beauty/gallery/service), the new pricing line should also be inserted as its own paragraph before the closing `Lucas / +45 23 24 24 82` block. Right now they mention demos but never volunteer a price-tone — adding it puts cold and followup on the same voice.

### 3.3 In `.send_queue/.compose.mjs` — the OLD composer still on disk

**File:** `.send_queue/.compose.mjs:150,154`

```js
Jeg laver hjemmesider ved siden af min salgselev-plads, så det er prisvenligt — 5.000 kr alt inklusiv for forside + de undersider der giver mening for ${c.name}.
...
Hvis du har lyst, laver jeg gerne en gratis mockup specifikt til ${c.name} — helt uden binding.

Sig endelig til.
```

This file is the source of the 39 banned sends. The newer `.compose_new.mjs` does the right thing. **Delete `.compose.mjs` or move it to an `archive/` subfolder** so no agent or scheduled task accidentally re-runs it. The morning task SKILL.md should also be checked: it should call `.compose_new.mjs`, never `.compose.mjs`. (Couldn't verify from this audit — the SKILL files live outside the mounted folder.)

### 3.4 Other tone touches in `email.ts:203-222` (complimentLine)

The `complimentLine` function does string-construction with placeholder characters then `.replace()`-es them back:

```ts
return "Jeg er stoedt paa " + name + " i " + city + " — det ser ud som et sted folk virkelig kommer for stemningen.".replace("stoedt", "stødt").replace("paa", "på");
```

This is harmless (the `.replace` is bound to the final substring — JS string operations bind tightly). But it's brittle and weird. Probably an editor/encoding workaround that should be retired. Just use `"stødt"` and `"på"` directly — the file is already UTF-8 and contains plenty of `ø/å` elsewhere.

---

## 4. Logic bugs

### 4.1 `.fix_pending_pricing.mjs` regex only matches the OLD wording — silently skips other variants

**File:** `.send_queue/.fix_pending_pricing.mjs:32`

```js
const priceRegex = /Jeg laver hjemmesider ved siden af min salgselev-plads, så det er prisvenligt[^\n]+/g;
```

That's exactly the wording in `.compose.mjs`. But the queue contains 39 entries with `"...det er ret prisvenligt — 5.000 kr alt inklusiv for en simpel side..."` — note the **"ret prisvenligt"** variant (with "ret" inserted). The regex doesn't match. Fortunately `queue.json` wasn't the target — `pending_batch.json` was. But if you ever rerun the fixer against queue.json, **it will silently report `Price line replaced: 0/65`** and you might think the queue is clean. It's not.

### 4.2 `send-followups/route.ts:88` — `.slice(0, headroom)` mutates eligible BEFORE rate limit check

**File:** `src/app/api/email/send-followups/route.ts:84-93`

```ts
const eligible = leads
  .map((lead, i) => ({ lead, rowIndex: i }))
  .filter(({ lead }) => isReadyForFollowup(lead))
  .filter(({ lead }) => !leadIds || leadIds.includes(lead.id))
  .slice(0, headroom);

const total = eligible.length;
...
if (headroom <= 0) { return ... rate-limited response ... }
```

If `headroom === 0`, the slice produces `[]`, `total = 0`, you return rate-limited (correct). But if `headroom < 0` (Math.max protects against this — line 82 forces 0+), still OK. Minor: `total` is named `total` but is actually "total after applying daily cap", not "total eligible". Cosmetic but misleading in the streamed JSON output.

### 4.3 `bulk-find-emails.ts:97-102` — generic-email re-sort can reverse user expectation

**File:** `src/app/api/email/bulk-find-emails/route.ts:97-102`

```ts
unique.sort((a, b) => {
  const aGeneric = /^(info|kontakt|mail|hello|hej|admin|booking|salg|sales|contact)@/.test(a);
  const bGeneric = /^(info|kontakt|mail|hello|hej|admin|booking|salg|sales|contact)@/.test(b);
  if (aGeneric && !bGeneric) return 1;
  if (!aGeneric && bGeneric) return -1;
  return 0;
});
```

This sorts personal names BEFORE generic mailboxes. Sounds right — until you realize personal emails (e.g. `lars@frisor.dk`) often go to a private inbox the recipient doesn't check, while `info@frisor.dk` is the actual business inbox. For Danish SMBs especially, `info@` is the "front door". Recommend flipping this so generics come first.

### 4.4 `verify-all/route.ts:117` — Math.min on score has off-by-one feel

**File:** `src/app/api/verify-all/route.ts:116-117`

```ts
const baseScore = Math.min(lead.score, 55);
const newScore = Math.min(100, baseScore + bonus);
```

Caps base at 55, adds tier bonus (0-25). So max is 80 for a lead with a verified website. A `none` (no-website) lead got `+30` at scrape time → its base could be 70 before verify; `Math.min(70, 55) = 55`, then `+0` (verify skips none-status leads via line 100). Result: a no-website lead's stored score becomes 55 instead of its true 70. Then the morning task sorts by score and the no-website leads — the HOTTEST ones — sort *below* a verified-old lead at 75. That's the opposite of what you want.

**Fix:** Don't cap baseScore for `websiteStatus === "none"` leads, or skip them from `withWebsite` filtering more strictly (they already are skipped, but the cap still applies on the next verify-all run for any borderline case).

### 4.5 `sync-replies/route.ts:78` — multi-reply double-count

**File:** `src/app/api/email/sync-replies/route.ts:75-85`

`repliedRows` is a Set so it deduplicates. Good. But the `rejectionRows` check inside the same loop runs `looksLikeRejection` per message (good), and if a recipient sends multiple replies, only the first will be classified — subsequent messages from the same `from` add to `repliedRows` (already there) and **silently get checked for rejection but only the FIRST one's classification wins** because `rejectionRows` is also a Set. Edge case: if the first reply is "tak for tilbuddet, vi tænker over det" (neither accept nor reject) and the second is "nej tak" — the second's rejection is registered correctly (Set adds idempotently). So actually fine. But the `rejectedDetails` array in `sync-rejections/route.ts:90,105` has the same Set check (`if (!rejectedRows.has(rowIdx))`) which means only the FIRST detected rejection per row makes it into `details[]`. Probably fine, but if you ever want a thread view you'll be confused.

### 4.6 `enrich/route.ts:110` — Facebook slug regex matches single closing char

**File:** `src/app/api/leads/[id]/enrich/route.ts:110`

```ts
const m = html.match(/facebook\.com\/([A-Za-z0-9._%-]{3,50})(?:["'\/?])/);
```

The lookahead requires exactly one of `"'/?`. Facebook URLs in many pages end in `)` (parentheses in HTML/markdown links). Misses `https://facebook.com/foo)` and `https://facebook.com/foo<`. Add `>` and `)` to the character class.

### 4.7 `enrich/route.ts:38-42` — Danish phone regex captures address prefixes

**File:** `src/app/api/leads/[id]/enrich/route.ts:40`

```ts
const m = text.match(/(?:\+45[\s.]?)?(\d{2}[\s.]\d{2}[\s.]\d{2}[\s.]\d{2}|\d{8})/);
```

Will happily match the postal code in "Vestergade 12, 8200 Aarhus N" — `8200` is too short (4 digits) so won't match `\d{8}`. But "Vestergade 12 8200 Aarhus" — no. Actually OK; min 8 consecutive digits. **However:** matches CVR numbers (8 digits) which look identical to Danish phones. Bias toward `\+45` prefix and "Tlf"/"Tel"/"Telefon" anchor. Low-priority.

### 4.8 `chains.ts` — `JYSK_TRADE_WORDS` used as fallback for `salling` AND `jysk` AND `netto`

**File:** `src/lib/chains.ts:50-55`

Same exclusion list checks all three. But "JYSK Auto" (legitimate local mechanic in Jutland) would be allowed because `auto` is in the trade list — good. "Jysk Bogføring" (legit) — good. **However:** "Salling" matches as chain unless trade word is present **AND** none of `v/|aps|a/s|i/s` are in the lower. A business named "Salling Tagdækning ApS" passes (trade word "tagpap" not "tagdæk"; wait — "tagdæk" not in trade words; trade list has "tagpap"!). So "Salling Tagdækning ApS" gets caught as a chain. Actually it's saved by `aps` in the lower → passes. OK. But "Salling Tagdækning" without ApS — incorrectly flagged. Hard to be perfect here. Worth one careful pass over `JYSK_TRADE_WORDS` to add `tagdæk` next to `tagpap`.

---

## 5. Security issues (severity-ordered)

### 5.1 HIGH — Plaintext Gmail app password committed-adjacent

**File:** `.send_queue/send.mjs:16-17`

```js
const GMAIL_USER = "buur.aigro@gmail.com";
const GMAIL_PASS = "xahr qovv dnus jche";
```

Not gitignored. `.gitignore` covers `.env*` but NOT `.send_queue/` nor `send.mjs`. One `git add .` exposes it. If `buur.aigro` is the persona Lucas built sender reputation on, revoke this app password tonight via https://myaccount.google.com/apppasswords, generate a new one, store in `.env.local`, and refactor `send.mjs` to load via `process.env.GMAIL_APP_PASSWORD` (reusing the env-loader pattern from `.fresh_scrape.mjs:20-38`). **Action: revoke regardless** — it has likely been pasted into chat logs / Claude session transcripts at some point.

### 5.2 HIGH — Service-account JSON sitting in `.send_queue/.sa.json`

**File:** `.send_queue/.sa.json` (2352 bytes, real GCP service account)

Same gitignore problem. Service accounts grant access to the entire Google Sheet AND, depending on its IAM roles, possibly Drive and other resources. Worth checking what scopes/projects this SA can touch (`gcloud projects get-iam-policy`).

**Fix:** Move to `~/.config/lead-system/sa.json`, point `GOOGLE_KEY_FILE` at it, delete from repo dir. Add `.send_queue/` to `.gitignore`.

### 5.3 MEDIUM — Open redirect in click tracker (see 2.3)

### 5.4 MEDIUM — `.gitignore` does not exclude generated PII

`.send_queue/state.json` contains 57 (and growing) lead email addresses + names. `.send_queue/queue.json` contains the same plus the full email body. `.send_queue/.enriched.json` contains scraped business profiles. None are sensitive in the way credentials are, but committing them blows the recipient-list confidentiality.

**Fix:** Add to `.gitignore`:
```
.send_queue/
.worktrees/
*.sa.json
.sa.json
```

### 5.5 LOW — All Sheet IDs are hard-coded in 4+ `.send_queue/*.mjs` scripts

`1it8BeujksJjZuMAFaFaA0j11UDAA_afFP1BqgViVFJ8` appears literally in `.compose_new.mjs:324`, `.fetch_more_leads.mjs:8`, `.fetch_photo_craft.mjs:10`, `.mark_bounces.mjs:7`. Not secret (a sheet ID alone doesn't grant access), but coupling these scripts to the env-loaded `GOOGLE_SHEET_ID` would prevent forking confusion later.

### 5.6 LOW — No CSRF / auth on POST routes

Every Vercel-exposed POST route — `/api/scrape`, `/api/email/bulk-send`, `/api/leads/bulk-skip`, `/api/leads/cleanup` — is anonymous. Anyone with the production URL can trigger Gmail sends. Lucas relies on the URL not being scraped, which is fine for now, but adding `Authorization: Bearer ${process.env.API_TOKEN}` middleware is 10 lines and removes the risk entirely.

### 5.7 LOW — `decodeURIComponent` in click tracker is implicit via Next

`req.nextUrl.searchParams.get("url")` already URL-decodes once. If you append the destination already-encoded via `encodeURIComponent` (as `buildTrackedClickUrl` does), you decode-once and redirect to the raw URL. Safe today. Becomes unsafe if a future change double-encodes. Add explicit `URL.canParse(url)` guard.

---

## 6. Dead code / inconsistencies

| File | Issue | Action |
|---|---|---|
| `__smoke.mjs`, `__smoke2.mjs`, `__smoke3.mjs` | All zero bytes | Delete |
| `src/lib/email.ts.bak` | Contains literal text `test overwrite` | Delete |
| `src/lib/test_write.txt` | Contains literal text `test content` | Delete |
| `.send_queue/.compose.mjs` | Old composer with banned phrasing | Archive/delete (it produced the 39 bad sends) |
| `.send_queue/.deep_email_scan.mjs` + `.deep_email_scan2.mjs` | Two near-identical scripts | Diff and merge |
| `.send_queue/.enrich.mjs` + `.enrich_more.mjs` + `.enrich_pc.mjs` | Three enrich variants | Consolidate or rename to make their purpose obvious |
| `.send_queue/.eligible.json` + `.eligible_v2.json` + `.eligible_v3.json` | Three stale versions | Delete v1/v2 |
| `.send_queue/pending_batch.backup*.json` | Multiple backups | Delete those older than 7d |
| `.send_queue/queue.backup.20260526_090548.json` and `state.backup.20260526_090548.json` | One-time backups from this morning's pricing fix | Keep until tomorrow, then delete |
| `C:UsersBuurAppDataLocalTempvi.json` (yes, that's the literal filename in your project root) | Cursor/vim artifact saved with Windows path as filename | Delete |
| `after_send.png`, `dashboard-full.png`, `draft_open.png`, `email_*.png`, `preview-click.png`, `sent_*.png` | 13 screenshots in project root | Move to `docs/screenshots/` or delete |
| `codeburn-dashboard.mjs` | Unclear purpose — 9990 bytes, top-level | If unused, delete |
| `graphify-out/`, `.playwright-mcp/` | Old experiment outputs | Delete |
| Email-extraction regex appears in `verify-all/route.ts:36-45`, `bulk-find-emails/route.ts:53-65,82-104`, `leads/[id]/enrich/route.ts:25-35`, `leads/move-bounced/route.ts:6-26` | 4 nearly-identical implementations of `isCleanEmail` + `extractEmail` + `PLACEHOLDER_REGEX` | Extract to `src/lib/emails.ts` |
| `PLACEHOLDER_REGEX` in `bulk-find-emails`, `bulk-send`, `move-bounced` | Three identical 1700-char regexes | One source-of-truth |
| `isGmailRateLimit()` in `bulk-send:80-90` and `send-followups:54-64` | Duplicated 11-line function | Move to `src/lib/email.ts` |
| `DEFAULT_DAILY_CAP = 60` in `bulk-send:78` and `send-followups:52` | Duplicated constant | Move to `src/lib/email.ts` |
| `src/lib/folders.ts` | File is named `folders.ts` but actually exports `buildClaudeMd` (a markdown brief builder, no folders involved). Drive folder creation is NOT in this codebase despite `CLAUDE.md` listing it. | Rename to `src/lib/brief.ts` and update README/CLAUDE.md to drop the Drive-folder claim |
| Stale TODO/comment claim in CLAUDE.md: `src/lib/folders.ts — Google Drive folder creation for clients.` | False — no Drive code | Update |
| `BRANCH_GROUP_MAP` in `email.ts:56-97` vs `classifyGroup` in `.sheet_branch_audit.mjs:74-82` | Two implementations of branch-to-group classification | Single source |
| `CITIES` in `apify.ts:31-50` vs `CITIES` in `.fresh_scrape.mjs:71-82` | Duplicated 53-city list | Import or load from JSON |
| `BRANCH_PRESETS` in `apify.ts:61-66` vs `BRANCH_PRESETS` in `.fresh_scrape.mjs:57-68` | Different! apify has 4 presets, fresh_scrape has 4 different ones | Decide which is canonical |
| `isChain` is the one good chain-detection — but `.sheet_branch_audit.mjs:65-70` has its own `EXCLUDED_BRANCHES` list separate from `chains.ts` | Misaligned | Consolidate |
| `MAX_PER_RUN = 100` in `bulk-find-emails:11` — Lucas already notes this is run rarely | Document as "manual-only" or delete | |
| `CHAIN_EXACT` in `chains.ts:4` has `"bones"` (already noted) | Fix | |
| `EXCLUDED_BRANCHES` in `.sheet_branch_audit.mjs:66-70` lists `optiker`, `kiropraktor`, etc — but `bulk-send/route.ts:8` PROFESSIONAL_BRANCHES treats them as eligible (with higher threshold) | Two pipelines disagree on who's a customer | |

No test files exist — confirmed. `npm test` and `npm run test` are not defined in `package.json`.

---

## 7. Optimization opportunities

### Quick wins (each <30 min)

- **Cache `getLeads()` per request lifetime.** Today: `bulk-send/POST` calls `getLeads()` once but `PATCH` calls it never; tracking pixel `track/open` calls `getLeads()` on EVERY pixel-open → for a campaign with 60 opens that's 60 round-trips to the Sheets API at ~600ms each. Move to `unstable_cache` with 60s TTL, or pass `leads` between calls.
- **Batch Sheet updates.** `sync-rejections/route.ts:115-118` does serial `updateLeadStatus → updateLeadEmailStatus → sleep 100ms` per row. With 10 rejections that's >3s avoidable. The `batchUpdate` capability is already in `sheets.ts:batchUpdateLeadVerifications`; mirror that pattern.
- **Avoid `getLeads()` in click-tracker & pixel-tracker.** They only need one lead. Add `getLeadById(id)` that does `Leads!A${row}:U${row}` range fetch (1 row instead of 8000).
- **Drop `previewEmailTemplate`'s `getLeads` call** — `email-preview/route.ts:10` fetches the whole sheet just to read one row. Same fix as above.
- **Combine `sync-bounces` + `sync-replies` + `sync-rejections`.** All three open the same IMAP `INBOX`, scan with `since`, and write to columns O/P/Q/R. The shared overhead is a full connect+search. One unified `/api/email/sync-inbox` would cut Gmail IMAP connections from 3 to 1.

### Bigger refactors

- **The `.send_queue/` directory has become a parallel codebase** (≈30 .mjs files) doing what the API routes were supposed to do. Decide: either promote the proven scripts (`fresh_scrape`, `compose_new`, `enrich`) into `src/lib/` + scheduled `route.ts` handlers and retire the `.send_queue/` versions, or formalize the queue model and delete the half-finished API routes. Two parallel pipelines means every change must be applied twice and the production-vs-queue voice drift you're seeing tonight will keep happening.
- **State machine for lead status.** `LeadStatus = "new" | "called" | "interested" | "client" | "skip"` is a type but transitions are not enforced. `bulk-send` writes "called" on `new`; `cleanup` deletes outright; `bulk-skip` writes "skip" but `sync-rejections` writes "skip" with a different note format. Move to a `transitionLead(id, from, to, reason)` helper that enforces valid transitions and writes the same audit-trail in column J every time.
- **A single `Lead.fingerprint`** (sha of normalized name + phone) so the lead survives sheet row moves. `lead.id` being a row number is a foot-gun; every "wrong row updated" bug Lucas will ever hit traces back to this.

### Bundle / dependency

- `googleapis` is 14 MB unminified — heavy for a Vercel function. If you ever need to shrink cold-start, the lower-level `google-auth-library` + raw `fetch()` against Sheets v4 is ~2 MB. Not urgent.
- `imapflow` is fine for now.
- No frontend bundle review attempted.

---

## 8. Brand / customer-fit observations

**Target persona reminder (per the prompt):** Small Danish business (1–5 employees), weak site (FB-only, Wix template, broken), 10–30+ reviews. Lucas's apprentice "hobby" pricing line implies < 10k DKK total.

### Things to keep

- **Beauty + craft + food + photo** branches: textbook fit. SMB-heavy, locally-driven, weak digital, can be sold to in one short email.
- **Chain detection in `chains.ts`** is impressively complete for a one-person operation. The JYSK and Netto false-positive heuristics show Lucas already learned these the hard way.
- **Branch-specific demo URLs** in `email.ts:16-29` make outreach feel personal even at 50/day volume.
- **Tracking pixel + click tracker** for free without a paid SaaS tool is the right call at this stage.

### Things that don't fit (and should probably be removed)

- **`advokat, revisor, fysioterapi, tandlæge, optiker, kiropraktor, apotek`** — these are the `PROFESSIONAL_BRANCHES` in `bulk-send:8`. Lucas already gates them at score ≥ 70, but **structurally** these businesses don't fit the persona:
  - Advokat/revisor: 5–50 employees, marketing budget exists, often have an agency-built site.
  - Tandlæge/læge/apotek: regulated industries, often part of small chains, slow to change vendors.
  - Optiker: 90% are chains (`synoptik`, `profiloptik`, `specsavers`, `louis nielsen`) and are already filtered.
  - Recommend: drop these from `BRANCHES` in `apify.ts:17-29`. Save the API spend.
- **`anlægsgartner` (landscaping)** is in `BRANCHES` — fits the persona but Lucas might not have a demo for it. Currently routes to the generic "service" template with no demo URL.
- **`galleri / kunstgalleri / kunsthandel`** are in `BRANCH_GROUP_MAP:84` but they're a tiny vertical; the demo URL is just `DEMO_URLS.gallery = buurfoto.vercel.app` — same as photo. If you don't have a real gallery demo, drop the branch.

### Things missing from the persona

- **Bryllupsfotograf, portrætfotograf** — added in `.fresh_scrape.mjs:62` but missing from `apify.ts:BRANCHES`. The morning task could pull them but the UI-scrape can't.
- **Fysiklinik, kostvejleder, akupunktør, fodterapeut** — small one-person practices, often on Facebook only. Excellent persona fit. Not in `BRANCHES`.
- **Dyrlæge (single-vet practices, NOT AniCura/Evidensia chains)** — 80% of Danish vet clinics are single-vet shops with old sites.
- **Mindre detail (boutique, antikvitet, vintage, ostebutik, vinhandel)** — 1–3 employees, often have a Wix or no site, lots of locals love them, exactly Lucas's persona.
- **København metro area** — Lucas's own AUDIT_2026-05-26.md already flagged this. Worth re-emphasizing: Aarhus + Aalborg + Jutland covers ~3M people; København metro is another ~2M and is currently invisible to the scraper.

### Voice consistency check

- **Cold templates**: friendly-hobby tone ✓
- **Followup templates**: still use "lave en hurtig mockup" — corporate-leaning, OLD style. Replace per § 3.2.
- **`service` template (cold + followup)**: dry, generic, no demo, no personality. If Lucas plans to keep service branches, this template needs a real demo + warmth.
- **`gallery` template**: copy-pasted from photo but lazy about it ("Det er en demo til en fotograf — men jeg laver selvfølgelig en version der passer specifikt til ${v.name} og jeres udtryk."). Apologizing for the demo on first contact is a tone misstep — either build a real gallery demo or drop the branch.

---

## 9. What I read (file inventory)

### Library files (5/5)
- `src/lib/sheets.ts` (414 lines) — fully read
- `src/lib/email.ts` (725 lines) — fully read
- `src/lib/apify.ts` (179 lines) — fully read
- `src/lib/chains.ts` (61 lines) — fully read + behavior tested
- `src/lib/folders.ts` (134 lines) — fully read (note: actually a brief builder, not folder creation)

### API routes (24/24)
- `src/app/api/scrape/route.ts`
- `src/app/api/verify-all/route.ts`
- `src/app/api/email/bulk-send/route.ts` — **corrupted**
- `src/app/api/email/bulk-find-emails/route.ts` — **corrupted**
- `src/app/api/email/send-followups/route.ts` — **corrupted**
- `src/app/api/email/sync-replies/route.ts` — **corrupted**
- `src/app/api/email/sync-bounces/route.ts`
- `src/app/api/email/sync-rejections/route.ts`
- `src/app/api/email/test-send/route.ts`
- `src/app/api/email/track/open/[leadId]/route.ts`
- `src/app/api/email/track/click/[leadId]/route.ts`
- `src/app/api/leads/route.ts`
- `src/app/api/leads/bulk-skip/route.ts`
- `src/app/api/leads/cleanup/route.ts`
- `src/app/api/leads/move-bounced/route.ts`
- `src/app/api/leads/[id]/status/route.ts`
- `src/app/api/leads/[id]/callback/route.ts`
- `src/app/api/leads/[id]/email-preview/route.ts`
- `src/app/api/leads/[id]/send-email/route.ts`
- `src/app/api/leads/[id]/enrich/route.ts`
- `src/app/api/leads/[id]/deep-research/route.ts`
- `src/app/api/leads/[id]/analyze/route.ts`
- `src/app/api/clients/route.ts`
- `src/app/api/clients/[id]/brief/route.ts`

### Send pipeline (5/5)
- `.send_queue/send.mjs` (128 lines) — fully read
- `.send_queue/.fresh_scrape.mjs` (293 lines) — fully read
- `.send_queue/.retag_recent.mjs` (139 lines) — fully read
- `.send_queue/.fix_pending_pricing.mjs` (54 lines) — fully read
- `.send_queue/.sheet_branch_audit.mjs` (129 lines) — fully read
- `.send_queue/.compose.mjs` — sampled (banned phrasing source — confirmed)
- `.send_queue/.compose_new.mjs` — sampled (good phrasing source — confirmed)
- `.send_queue/queue.json` — analyzed (65 entries, 57 sent, 8 pending, 39 historical bans)
- `.send_queue/state.json` — analyzed (sent counts + timestamps)
- `.send_queue/pending_batch.json` — analyzed (28 entries, all post-fix)

### Docs (read)
- `CLAUDE.md`, `AGENTS.md`, `README.md`, `NIGHT_OF_2026-05-25.md`, `AUDIT_2026-05-26.md`

### Configs (read)
- `.gitignore`, `.env.local`/`.env.production` line-counts (not content), `package.json` indirectly via `npm run` references

---

## 10. What I did NOT review (and why)

- **Scheduled task SKILL.md files** (`lead-batch-morning`, `lead-batch-autosend`, `lead-messenger-morning`) — they live at `C:\Users\Buur\Documents\Claude\Scheduled\...` which is OUTSIDE this Cowork session's mount. I have no access to that folder. Recommend a follow-up audit of the SKILL files separately. Specific things to check there:
  - Does `lead-batch-morning` call `.compose.mjs` or `.compose_new.mjs`?
  - Does the voice-sample harvesting step include a "voice cutoff" date so it doesn't treat the 39 banned-line emails as canonical?
  - Does `lead-batch-autosend` re-read `pending_batch.json` after the morning task, or does it use a stale snapshot?

- **`src/app/page.tsx`, `clients/page.tsx`, `clients/[id]/brief/page.tsx`, `followup-review/page.tsx`, `layout.tsx`** — read enough to know they exist. UI-side concerns (XSS via dangerouslySetInnerHTML, etc.) not deeply explored. Brief scan showed no `dangerouslySetInnerHTML` calls.

- **`src/components/*`** — 12 components, not opened. The audit prompt focused on API + lib + send pipeline. Suggest spot-check of `EmailPreviewModal.tsx` since it renders template HTML.

- **`node_modules/`, `.next/`, `package-lock.json`** — by convention.

- **The 13 PNG screenshots in the project root** — visually inspected only as filenames. They look like development artifacts to clean up.

- **`graphify-out/`, `docs/`** — directory contents not enumerated. Likely safe to ignore but worth a `ls` in the morning.

- **`.worktrees/email-automation/`** — only used to diff against the corrupted bulk-send file. Otherwise untouched.

- **Vercel deployment state** — I have no access to your Vercel dashboard. The HEAD commit (`6a8d297`) is what production runs. The 4 corrupted files have NOT been pushed.

---

## TL;DR: order-of-operations for tomorrow morning

1. **Restore the 4 corrupted route files** from your working diffs (don't lose the daily-cap logic you added). 15 min.
2. **Rotate the Gmail app password.** 2 min. Then update `send.mjs` to read from env. 5 min.
3. **Add `.send_queue/`, `.sa.json`, `*.sa.json` to `.gitignore`.** 1 min.
4. **Patch `src/lib/email.ts` followup templates** with the new "hobby" pricing + "gratis demo" CTA. 30 min including testing previews via `/api/leads/[id]/email-preview`.
5. **Patch the open-redirect** in `track/click/[leadId]`. 10 min.
6. **Lucas's own `AUDIT_2026-05-26.md` items 1–5** (chains.ts apostrophe, sheet_updater.mjs, scrape branch tags, København cities). ~1 hr total.
7. Then: delete the dead files in § 6 and write a `tsconfig` no-emit smoke check that runs before push.

Total: ~3 hours to get the codebase to a confidently-deployable state. Good night.
