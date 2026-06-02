# Voice Audit — 2026-05-26

**Auditor:** Claude (read-only sweep)
**Scope:** `C:\Users\Buur\Documents\Workflows\lead-system\` + `C:\Users\Buur\Documents\Claude\Scheduled\`
**New rules under audit:**
- Required price: `Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt.`
- Required CTA: `Hvis det lyder interessant kan jeg sende en gratis demo der er bygget specifikt til [name] — helt uden binding.` + blank line + `Sig endelig til.`
- Forbidden: kr-amounts, `alt inklusiv`, hard CTAs (`Skriv bare`, `send mockup`, `send skitse`), sales framing (`tilbud`, `pakke`).

---

## 1. Summary

**Voice consistency score: C**

The two **active artifacts** that ship today are mostly clean:
- `.send_queue/pending_batch.json` (28 emails, this morning's batch) — 100% NEW voice. All 28 entries contain the new price line and new CTA verbatim.
- `Scheduled/lead-batch-morning/SKILL.md` and `lead-messenger-morning/SKILL.md` — explicit HARD RULES at the top and exact required phrasings embedded in step 7e / Patterns A-C.

But there are **four serious gaps** that drag the score from A to C:

1. **`queue.json` contains 36+ OLD-pricing emails that have not yet been sent.** The send queue file (which `send.mjs` reads from) is 65 entries — only 26 use the new price line; **36 still contain `prisvenligt — 5.000 kr alt inklusiv`** and will go out as-is unless purged. This is the single most important finding in the audit.
2. **`src/lib/email.ts` was never updated** to the new voice rules. None of its 14 templates (food/craft/photo/professional/beauty/gallery/service × cold/followup) contain the new price line or the new CTA. If `/api/email/bulk-send` or `/api/email/send-followups` is ever triggered, it will emit OLD-voice content (no pricing at all currently, and a different CTA — `Sig endelig til hvis det lyder interessant`). Not strictly forbidden, but it does not match the new gold standard either.
3. **`lead-batch-autosend/SKILL.md` line 11** still describes Lucas as running "a side-business making 5.000 kr websites" — a forbidden kr-amount lives in the very task that auto-ships the batch.
4. **`.voice_samples.json` contains the OLD pricing in all 5 samples.** Combined with the morning task's step 6 ("Pull 5 most recent of Lucas's sent emails as voice gold-standard"), this is a guaranteed contamination path for tomorrow's batch.

Personalization quality is **high** in pending_batch.json (every entry references a specific street, owner name, review count, or site defect), but the boilerplate scaffolding between the personalization beats repeats heavily across the batch — see §5.

---

## 2. Forbidden phrase violations

Categorization: **A** = active code/templates that will execute or generate content (MUST FIX). **B** = documentation/skill text that describes old voice (should update). **C** = historical artifacts / logs / backups (informational, safe to leave but quarantine if at risk of being read as samples).

| # | File | Line | Pattern | Actual text (excerpt) | Cat | Severity | Fix |
|---|------|------|---------|------------------------|-----|----------|-----|
| 1 | `.send_queue/queue.json` | 36 entries across lines 6–404 | `5.000 kr alt inklusiv` | `Jeg laver hjemmesider ved siden af min salgselev-plads, så det er prisvenligt — 5.000 kr alt inklusiv for forside + de undersider der giver mening for X.` | A | **CRITICAL** | Run `.fix_pending_pricing.mjs` against `queue.json` (it was only run against `pending_batch.json`). Or purge queue.json entries with OLD wording and re-generate from pending_batch.json. |
| 2 | `.send_queue/.compose.mjs` | 150 | `5.000 kr alt inklusiv` | Hard-coded template literal: `Jeg laver hjemmesider ved siden af min salgselev-plads, så det er prisvenligt — 5.000 kr alt inklusiv for forside + de undersider der giver mening for ${c.name}.` | A | **CRITICAL** | Delete or rename this file. `.compose_new.mjs` line 288 has the correct version. Leaving the old script in place risks a future agent running it by mistake. |
| 3 | `.send_queue/.composed.json` | 28 entries (lines 6–384) | `5.000 kr alt inklusiv` | Output of step 2 — saved batch with OLD pricing across all 28 entries | C | Medium | Either delete this artifact file or rename to `.composed.OLD_VOICE_DO_NOT_USE.json` so no agent recycles it. |
| 4 | `.send_queue/pending_batch.backup.20260526_090548.json` | 25 entries | `5.000 kr alt inklusiv` | Pre-fix backup snapshot | C | Low | Rename with `.OLD_VOICE` suffix or move to a `_archive/` subfolder. |
| 5 | `.send_queue/pending_batch.backup_before_pricing_fix.json` | 14 entries | `5.000 kr alt inklusiv` | Pre-fix backup snapshot | C | Low | Same as #4. The filename already hints at its status — keep but archive. |
| 6 | `.send_queue/queue.backup.20260526_090548.json` | 39 entries | `5.000 kr alt inklusiv` | Pre-fix snapshot of queue | C | Low | Same as #4. |
| 7 | `.send_queue/.voice_samples.json` | 3 samples on lines 6, 12, 18 (and a 4th partial on line 30) | `5.000 kr alt inklusiv` | Pulled from sent Gmail — these were real sends from before tonight | **A** | **CRITICAL** | See §4. Regenerate the file or pin a header comment that says "DO NOT MIRROR PRICING". |
| 8 | `.send_queue/.fix_pending_pricing.mjs` | 2, 31 | `5.000 kr alt inklusiv` (in comments) | Old wording quoted inside the fix-script's comments | C | Low | Harmless — just code commentary documenting what was replaced. Leave. |
| 9 | `.send_queue/.compose_new.mjs` | 133 | `service-tilbud` | `observation: "17 anmeldelser og et bredt service-tilbud i Vejle"` | C | Low | This is a hardcoded fallback observation, not a CTA — substring match on "tilbud" is a false positive (means "offering" here, not "offer/quote"). Leave as-is. |
| 10 | `.send_queue/.compose_new.mjs` | 236 | `tilbuddet` | Stat-palette text: `for håndværkere er det ofte forskellen mellem at få tilbuddet eller ej` | C | Low | False positive — "the quote" in the trade sense, not sales framing. Leave. |
| 11 | `Claude\Scheduled\lead-batch-autosend\SKILL.md` | 11 | `5.000 kr` | `Lucas runs a side-business making 5.000 kr websites` | A | **HIGH** | Replace with: `Lucas runs a side-business making custom websites at a friendly hobby-rate (salgselev day-job — no kr-amounts quoted in any email).` |
| 12 | `MORNING_REPORT.md` | 50 | `Skriv bare 'ja' eller 'send skitse' tilbage` | Quoted in a historical follow-up template snippet | B | Medium | Either delete the file (it's a 2026-05-20 era report) or add a banner at the top: "voice rules superseded 2026-05-26 — do NOT use as template." |
| 13 | `MORNING_REPORT.md` | 155, 161, 195 | `mockup-tilbud`, `send mockup` | Old narrative copy describing the May campaign | B | Low | Same as #12 — historical doc, but the word `send mockup` is also flagged. Banner or delete. |
| 14 | `CAMPAIGN_2026-05-22.md` | 638 | `5.000 kr opstart` | Documenting a 1:1 sales reply to Rikke Rask | C | Low | This is a record of a real conversation, not a template. **Keep** — it's reference history. But annotate at top: "1:1 conversation log — pricing was disclosed because lead asked directly. Not the cold-outreach template." |
| 15 | `src/lib/email.ts` | 579, 593, 629, 640 | `tilbuddet gælder stadig` | Followup template: `Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.` | A | Low | The word `tilbuddet` ("the offer") in a followup is borderline sales-framing under the new rules. Re-word to: `— jeg vil stadig gerne lave en gratis demo til jer hvis det er interessant.` or similar. Appears 4× (cold/followup × text/html for gallery+service templates). |
| 16 | `OVERNIGHT_REPORT_2026-05-20.md` | 90, 100, 107, 137 | `tilbud` | Historical narrative — "han venter på dit konkrete tilbud" etc. | C | None | Historical report — leave. |
| 17 | `docs/superpowers/plans/2026-05-11-*.md` | 263, 308, 352, 396, 435 (and several in `2026-05-11-13-targeted-improvements.md`) | `tilbuddet gælder stadig` | Plan documents from May with old followup templates | B | Low | These are old planning docs. The phrase shipped into `src/lib/email.ts` (see #15) — fix it at the source. |
| 18 | `CAMPAIGN_2026-05-22.md` | 644, 646 | `~500 kr engangs`, `~250 kr/md`, `~500 kr/md` | SEO/Ads pricing tiers from the Rikke conversation | C | Low | Same as #14 — historical 1:1 record. Keep. |
| 19 | Bare `5k` matches | 11 hits | `5k` | All matches are SHA-256 hash fragments inside `package-lock.json` integrity hashes, and one in `console-*.log` URLs. | — | None | All false positives. |

**No hits at all** for: `alt inkl.` (without "usiv"), `kr alt inklusiv` (other than already-listed `5.000 kr alt inklusiv`), `aftale nu`.

---

## 3. Missing required phrasing

| Where new wording is REQUIRED | Status | Detail |
|--------------------------------|--------|--------|
| `src/lib/email.ts` — all 14 templates | **MISSING entirely** | The file has zero hits for `salgselev`, `hobby ved siden af`, `gratis demo`, `prisvenligt`, or `Hvis det lyder interessant`. None of the production templates currently quote any pricing line OR the new CTA. If any non-batch endpoint (`/api/email/bulk-send`, `/api/email/send-followups`, `EmailPreviewModal`) is invoked, it emits old-style copy that does not match what the morning batch ships. |
| `Scheduled/lead-batch-morning/SKILL.md` step 7e (line 179) | Present | Exact required phrase quoted verbatim and marked `MUST USE EXACTLY THIS`. |
| `Scheduled/lead-batch-morning/SKILL.md` step 7e CTA (line 181) | Present | Exact required CTA quoted verbatim. |
| `Scheduled/lead-messenger-morning/SKILL.md` Patterns A/B/C (lines 121, 128, 135) | Present, but **adapted** | Uses `Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt — kan sende en gratis demo hvis det er interessant.` — note the em-dash + abbreviated CTA. Acceptable for Messenger (350-char limit), but technically different wording from the email standard. Documented as intentional in the file. |
| `Scheduled/lead-batch-autosend/SKILL.md` | **Violates rule (#11 above)** | Calls product `5.000 kr websites` in the file's own context block. |
| `.send_queue/pending_batch.json` | Present — 28/28 entries compliant | Both required strings appear in every email. |
| `.send_queue/queue.json` | **Partially missing — 36/65 entries lack the new phrasing** | Old composer-output still in queue. |
| `.send_queue/.compose_new.mjs` | Present (line 288, 296+) | This is the corrected composer. |
| `.send_queue/.compose.mjs` | Missing — uses OLD phrasing (#2 above) | Should be deleted or quarantined. |

---

## 4. Voice-sample poisoning risk

**Reading: CRITICAL.**

### The chain

1. `lead-batch-morning/SKILL.md` step 6 says, verbatim: *"Pull 5 most recent of Lucas's sent emails: `from:buur.aigro@gmail.com newer_than:7d -in:draft` ... These are your voice gold-standard. Read them all before writing any new emails."*
2. `state.json` shows 57 sends so far; `.voice_samples.json` shows the 5 most recent (Guldsaksen 01:11, Din Frisør 01:04, Café Love 00:55, Æ Kalgo 00:46, plus a 4th visible). **All four visible samples contain `5.000 kr alt inklusiv`.**
3. The morning SKILL.md DOES contain HARD RULES at the top (line 10: `CRITICAL: NEVER quote an exact price (no "5.000 kr", no kr-amounts) in any email`) and the exact required phrasing at line 179.
4. BUT step 6's instruction comes AFTER step 1 (idempotency) and BEFORE step 7e (write the email). A diligent agent reading step 6 will internalize the OLD pricing as part of "voice gold-standard" and may unconsciously mix the old line with the new one — e.g., write `Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt — 5.000 kr alt inklusiv for ...`. This is exactly what `.compose.mjs` line 150 already does.

### What is and isn't in place

The morning SKILL.md DOES say "MUST USE EXACTLY THIS" at line 179. That's good. What is MISSING is an **explicit override warning at step 6**:

> Step 6 currently reads: *"Pull 5 most recent of Lucas's sent emails ... These are your voice gold-standard. Read them all before writing any new emails."*
>
> Required addition: *"⚠️ HARD-RULES OVERRIDE: any pricing or CTA line you see in these samples is OBSOLETE as of 2026-05-26. Mirror the warm, observational TONE only — do NOT copy the price line (`5.000 kr alt inklusiv`) or any hard-CTA (`Skriv bare ja`, `send mockup`). Use the EXACT phrasings in step 7e regardless of what the samples show."*

### Recommended additional safeguard

The `.voice_samples.json` artifact survives from run to run. Until the next 5 sends use the new voice, EVERY morning run will pull old-voice samples. Two options:

- **Option A (preferred):** Regenerate `.voice_samples.json` after manually editing it to either (1) prepend a JSON top-level field `_warning_voice_pricing_obsolete: true` that the morning agent must read first, or (2) replace the pricing line in each sample with the new wording before they enter the sample pool.
- **Option B:** In the next manual send (or a one-shot script), send 5 emails to dummy/test addresses using the new voice so that `from:buur.aigro@gmail.com newer_than:7d` naturally pulls only new-voice samples.

The deepest fix is doing both AND adding the explicit override warning at step 6.

---

## 5. Brand consistency observations

### Openings (Task 3.1)

All 28 emails in `pending_batch.json` open with `"Hej,"` — i.e., **no name**, generic salutation. None use `"Hej [name],"` even when the lead's owner name is in `_hook` (e.g., DK EL has no name to greet, but Klip - Klip has "Hana Nebihu" right there — could have been `Hej Hana,`).

The historical emails in `queue.json` and `.voice_samples.json` DO use `Hej Charlotte,`, `Hej Awat,` when an owner name is known. The new batch dropped this personalization touch. **Likely regression** during the compose rewrite.

Opening verbs vary across the batch:
- `Jeg sad og kiggede på` — 17 occurrences (61%)
- `Jeg sad og kiggede efter` — appears among the 13 "kiggede efter / er stødt på" hits
- `Jeg er stødt på` — included in the 13 count
- `Jeg faldt over` — 2 occurrences (Hjertebillede, VVS Center Bjarne Ørsted)
- `Jeg har lige kigget på` — 2 occurrences (Wedel Photo, Sten & Gert's)

61% of openings use the exact same opener. Not catastrophic but borderline — the historical voice samples mix in more variety (`Jeg har kigget på`, `Jeg er stødt på`, `Jeg sendte`).

### Signatures (Task 3.1)

`Mvh,\nLucas` — present in 28/28 pending entries. **Consistent.** No phone number is included in the pending_batch (unlike `src/lib/email.ts` templates which do append `+45 23 24 24 82`). Worth confirming with Lucas whether the phone number should also be in batch sends.

### Demo URL mapping (Task 3.1)

Spot-check against `src/lib/email.ts` DEMO_URLS:

| Entry | Branch | Branch group | Demo URLs used | Expected | Match? |
|-------|--------|--------------|----------------|----------|--------|
| Billund Grill (Pizzeria) | food | food | zaytoon-six then under-klippen | zaytoon first (matches pizza/pizzeria regex) | ✅ |
| Brønderslev El-Teknik (Elektriker) | craft | craft (utility — elektriker keyword) | ktvvs | ktvvs (craftUtility) | ✅ |
| Sydvesten ApS (Restaurant) | food | food | under-klippen then zaytoon | non-ethnic → under-klippen first | ✅ |
| Det Blå Hus (Skønhedsklinik) | beauty | beauty | salon-artec then streetcut | salon-artec first | ✅ |
| Salon Laura (Frisør) | beauty | beauty | salon-artec then streetcut | ✅ | ✅ |
| Klip - Klip (Frisør) | beauty | beauty | salon-artec then streetcut | ✅ | ✅ |
| Freshcuts Barbershop (Frisør→Barbershop) | beauty | beauty | **streetcut then salon-artec** (reversed!) | salon-artec first per email.ts (always) | ⚠️ Inconsistent — the SKILL.md step 7f also says "salon-artec first, streetcut second" always |
| Malerfirma Per Bladtkramer (Maler) | craft | craft (general) | denlillemaler | denlillemaler | ✅ |
| DCM MALERFIRMA (Maler) | craft | craft (general) | denlillemaler | denlillemaler | ✅ |
| Mo VVS, Quist&Bülow, AC as, VVS Center, Sten & Gert's (VVS-utility) | craft | craft (utility) | ktvvs | ktvvs | ✅ |
| Kristian Bertel, Stougaard, Galten, Hjertebillede, Wedel (Fotograf) | photo | photo | buurfoto | buurfoto | ✅ |

**One inconsistency:** Freshcuts Barbershop has the beauty demos in reverse order (streetcut first). Per the SKILL.md rule, it should be salon-artec first. Composer probably saw "barbershop" in the name and flipped the order — but no such rule exists. Minor.

### Stat-palette (Task 3.3)

Stats present in the batch:
- `det er folk der vender tilbage` (boilerplate, not a stat) — 17/28
- `det stærkeste fundament der findes` (boilerplate) — 14/28
- `75 % af folk dømmer en virksomheds troværdighed på dens hjemmeside (Stanford)` — 5
- `88 % af lokale søgninger på mobil resulterer i et opkald eller besøg inden for 24 timer (BrightLocal)` — 12
- `82 % af forbrugere undersøger ... online` — 2
- `88 % af besøgende vender ikke tilbage til en side efter en dårlig oplevelse` — 4 (occurs as alternative for food sometimes)
- `Billeder taler højere end ord — og for en fotograf er hjemmesiden hele porteføljen` — appears for all photo entries
- `75 % af folk dømmer ... — og for håndværkere er det ofte forskellen mellem at få tilbuddet eller ej` — 1 (DCM)

No direct duplicates or contradictions. `88 %` appears in two different forms (BrightLocal stat vs return-rate stat) — both are valid in the palette but the same number prefix risks confusion. Acceptable.

`ingen viewport-tag` appears 9 times — heavy reliance on the same site-classification copy. Consider varying with alt observation phrasings ("uden mobile breakpoints", "fast-bredde layout", "ingen responsiv struktur").

### Personalization quality (Task 3 & 5)

**Strong** — every email references something specific:
- Billund Grill → "Byens Pl. 4A" + "billund-grill.qo.app er kun en simpel listing"
- Det Blå Hus → "Frodesgade 143" + "v/ Yvonne Elbek"
- DK EL → "Stiftsvej 16 i Vejle Øst"
- Stougaard Fotografi → "Adelgade 103" + "60+ års familievirksomhed" + "kun ca. 470 bytes"

These hooks are visible in the `_hook` meta field AND woven into the body's opening or middle. **This is the best part of the batch.**

### Repetition concern

The 5-sentence skeleton is the same across all 28:
1. `Hej, Jeg sad og kiggede på [name] i [city], og [reviews] anmeldelser for en [type] af jeres størrelse — det er folk der vender tilbage, og det er det stærkeste fundament der findes.`
2. `Det jeg ville fortælle dig er at [site observation].`
3. `[stat sentence].`
4. `Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er prisvenligt.`
5. Demo links.
6. `Hvis det lyder interessant kan jeg sende en gratis demo der er bygget specifikt til [name] — helt uden binding.\n\nSig endelig til.\n\nMvh,\nLucas`

In isolation each email reads fine. But if even 2 of these leads compare notes or forward to a friend, the boilerplate is immediately obvious. The 17/28 use of `Jeg sad og kiggede på` is the single highest repetition signal. Worth diversifying the scaffold itself (not just the openers) for the next batch.

---

## 6. Recommended fixes — prioritized

### P0 — Block before next send (must do today)

| # | Fix | File(s) | Est. time |
|---|-----|---------|-----------|
| P0-1 | **Purge OLD-pricing emails from `queue.json`** (or run `.fix_pending_pricing.mjs` against it). 36 of 65 entries currently violate the new rules. | `.send_queue/queue.json` | 10 min |
| P0-2 | **Delete or quarantine `.send_queue/.compose.mjs`** so no future agent runs it. The corrected version is `.compose_new.mjs`. | `.send_queue/.compose.mjs` | 1 min |
| P0-3 | **Fix `Scheduled/lead-batch-autosend/SKILL.md` line 11** — remove `5.000 kr websites` phrase. | `lead-batch-autosend/SKILL.md` | 2 min |
| P0-4 | **Add override warning to `lead-batch-morning/SKILL.md` step 6** about voice-sample pricing being obsolete. (See exact wording in §4 above.) | `lead-batch-morning/SKILL.md` | 5 min |

### P1 — Should do this week

| # | Fix | File(s) | Est. time |
|---|-----|---------|-----------|
| P1-1 | **Update `src/lib/email.ts` templates** to include the new price line and new CTA in all 14 templates (food/craft/photo/professional/beauty/gallery/service × cold/followup). Replace `tilbuddet gælder stadig` (lines 579, 593, 629, 640) with non-sales phrasing. | `src/lib/email.ts` | 45 min |
| P1-2 | **Regenerate `.voice_samples.json`** to use the new voice OR pin a `_warning_voice_pricing_obsolete: true` header field that the morning agent must respect. | `.voice_samples.json` + minor SKILL.md tweak | 10 min |
| P1-3 | **Fix opener regression** — pending_batch all use `"Hej,"` even when owner name is known. Restore `"Hej [firstName],"` when `_hook` contains an owner name. | `.send_queue/.compose_new.mjs` | 15 min |
| P1-4 | **Banner old-voice files** — rename `.composed.json`, `pending_batch.backup.*`, `queue.backup.*` to include `.OLD_VOICE` suffix so future agents see them as quarantined. | `.send_queue/` | 5 min |

### P2 — Nice-to-have

| # | Fix | File(s) | Est. time |
|---|-----|---------|-----------|
| P2-1 | **Diversify boilerplate scaffold** in next batch — `Jeg sad og kiggede på` is in 17/28 emails. Vary opener verbs and the "det er folk der vender tilbage" sentence. | `.compose_new.mjs` | 20 min |
| P2-2 | **Add banner to `MORNING_REPORT.md`** noting voice rules superseded 2026-05-26. Same for the May `docs/superpowers/plans/2026-05-11-*.md` files. | 3 files | 5 min |
| P2-3 | **Annotate `CAMPAIGN_2026-05-22.md`** at top that the kr-amounts in §"Reply #1" are a 1:1 conversation log, not a template. | `CAMPAIGN_2026-05-22.md` | 2 min |
| P2-4 | **Vary `ingen viewport-tag` observation** in compose script — appears 9× in batch of 28. | `.compose_new.mjs` | 10 min |
| P2-5 | **Fix Freshcuts Barbershop demo order** — should be salon-artec first per the rule. Investigate why composer flipped it. | `.compose_new.mjs` | 5 min |

---

## Appendix — files inspected

- `src/lib/email.ts` (all 726 lines)
- `Scheduled/lead-batch-morning/SKILL.md`, `lead-messenger-morning/SKILL.md`, `lead-batch-autosend/SKILL.md`
- `.send_queue/pending_batch.json`, `queue.json`, `state.json`, `.voice_samples.json`
- `.send_queue/.compose.mjs`, `.compose_new.mjs`, `.fix_pending_pricing.mjs`, `.composed.json`
- All `pending_batch.backup*` and `queue.backup*` files
- `AGENTS.md`, `CLAUDE.md`, `AUDIT_2026-05-26.md`, `CAMPAIGN_2026-05-22.md`, `HANDOVER.md`, `MORNING_REPORT.md`, `NIGHT_OF_2026-05-25.md`, `OVERNIGHT_PLAN.md`, `OVERNIGHT_REPORT_2026-05-20.md`, `PRODUCT.md`, `README.md`
- `docs/superpowers/plans/2026-05-11-*.md` (planning docs)
- `.worktrees/email-automation/` files (no voice-rule hits)
- Log files in `.playwright-mcp/` and `.send_queue/` (no relevant content, all browser/console output)

Total grep coverage: all 8 forbidden patterns + required-phrasing patterns run across the entire project excluding `node_modules`.
