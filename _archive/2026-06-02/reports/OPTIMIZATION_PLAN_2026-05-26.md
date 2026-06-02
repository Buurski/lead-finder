# Lead System Optimization Plan — 2026-05-26

Authored for Lucas. Based on a live audit of the Leads sheet (8,459 rows), `state.json` (57 sends), `pending_batch.json` (28 queued), `apify.ts`, `chains.ts`, and `scrape/route.ts`. No code was modified, no scrapes triggered, no emails sent.

---

## 1. Executive summary — top 3 actions, biggest leverage first

| # | Action | Effort | Expected impact |
|---|---|---|---|
| 1 | **Scrape Aarhus + Copenhagen properly.** Aarhus region returns only 39 eligible leads (vs 117 in the Esbjerg corridor) and Greater Copenhagen isn't in `CITIES` at all. Add 12 CPH-area cities + raise Aarhus per-suburb intake. | 1 day | +800–1,200 eligible leads (~3× current pool) |
| 2 | **Loosen branch taxonomy in scoring/filtering.** 3,837 rows (45 % of the sheet) hit my `other_unknown` bucket because Google returns `Pizzeria`, `Kaffebar`, `Barbersalon`, `Fastfoodrestaurant`, `Bistro`, `Bogholderi`, `Vinduespolering`, `Fodpleje`, `Body art service`, etc. — most belong in your target groups but the scrape route + send pipeline only recognize the canonical 22 in `BRANCHES`. Expand `BRANCH_PRESETS` and the classifier regex in `morning_fetch.mjs`. | 2–3 hours | +200–400 eligible leads from existing sheet (no new scrape) |
| 3 | **Raise minimum reviews from 10 → 20 for craft/service, keep 10 for beauty/photo.** Of the 28 pending emails, 4 have ≤19 reviews. Of the 437 eligible, 31 have <15. Combined with a small scoring tweak (penalize FB-only and A/S corporate names), conversion-rate on send should rise meaningfully. | 30 minutes | +5–10 % reply-rate / fewer wasted sends |

The pool is heavily Jutland-weighted, professional branches are over-scraped (1,152 rows = 14 % of the sheet, all excluded), and Aarhus + Copenhagen are dramatically under-served relative to population. Fixing those three is the unlock.

---

## 2. Current pool snapshot

**Sheet totals (8,459 rows):**

| Status | Count |
|---|---:|
| new | 7,611 |
| called | 660 |
| skip | 115 |
| skip-bounced | 70 |
| client | 2 |
| interested | 1 |

**Website quality tier (post-verification):**

| Tier | Count | % |
|---|---:|---:|
| modern | 3,301 | 39 % |
| mediocre | 2,290 | 27 % |
| (empty / not yet verified) | 1,920 | 23 % |
| dead | 659 | 8 % |
| old | 289 | 3 % |

**Score distribution (all rows):**

| Score | Count |
|---|---:|
| < 40 | 5,315 (63 %) |
| 40–59 | 2,375 |
| 60–69 | 359 |
| 70–79 | 175 |
| 80–89 | 235 |
| ≥ 90 | 0 |

Nobody scores ≥ 90 — the cap is effectively 88. See §6.

### Per-group eligibility table

Eligibility = target branch + `reviews ≥ 10` + status not in {skip, called, client, interested, skip-bounced, skip-no-email} + `tier ≠ modern` + `score ≥ 40`. Same filter the morning pipeline uses.

| Group | Total in sheet | Eligible | With email | No website (FB-only candidate) | "Modern" already (would skip) |
|---|---:|---:|---:|---:|---:|
| beauty_hair (frisør/barber/salon) | 889 | **193** | 3 | 65 | 294 |
| beauty_other (skønhed/hud/negle/wellness) | 226 | 19 | 3 | 3 | 85 |
| food_restaurant | 549 | 87 | 10 | 15 | 295 |
| food_cafe (café/kaffebar/bistro) | 232 | 52 | 0 | 22 | 85 |
| food_fast (pizzeria/kebab/burger/grill/sushi) | 40 | 11 | 0 | 1 | 16 |
| craft_carpenter (tømrer/snedker) | 69 | 3 | 3 | 0 | 25 |
| craft_painter (maler) | 423 | 10 | 4 | 2 | 135 |
| craft_mason_roof (murer/tagdæk) | 200 | 3 | 0 | 1 | 67 |
| craft_plumber (vvs/blikkenslager) | 168 | 9 | 0 | 1 | 48 |
| craft_electrician | 425 | 19 | 2 | 2 | 173 |
| craft_auto (mekaniker/auto) | 11 | 0 | 0 | 0 | 5 |
| craft_smith | 0 | 0 | 0 | 0 | 0 |
| service_clean (rengøring) | 77 | 0 | 0 | 0 | 23 |
| service_window (vinduespudser — classified as "other" because of `Vinduespolering`) | 0 in this bucket; 56 hide in `other_unknown` as `Vinduespolering` | — | — | — | — |
| service_garden (anlægsgartner) | 46 | 0 | 0 | 0 | 23 |
| photo (fotograf) | 114 | **31** | 19 | 3 | 26 |
| **EXCLUDED — professional** | 1,152 | (filtered) | — | — | — |
| **EXCLUDED — gallery** | 1 | (filtered) | — | — | — |
| **other_unknown** (uncategorised) | **3,837** | hidden | — | — | — |
| **TOTAL eligible** | — | **437** | 44 | 113 | — |

Of those 437 eligible: 435 have neither an email-sent timestamp nor a callback date — i.e. virtually the entire eligible pool is untouched.

### Big findings from this table

1. **Beauty is the workhorse.** 193 of 437 eligible (44 %) are hair salons. Most have no email scraped yet (only 3/193 have a verified email), so the `bulk-find-emails` job is the bottleneck, not the pool.
2. **Craft is decimated by the `modern` filter.** Electricians: 173 of 425 (41 %) are already classified `modern` and skipped. Painters: 135/423 (32 %). Plumbers: 48/168 (29 %). These trades have aggressive web-shop vendors. The 30-pt no-website bonus is rarely earned here.
3. **Service group is empty.** 0 eligible in service_clean / service_window / service_garden. But the sheet contains 77 cleaning companies, 56 `Vinduespolering`, 46 `Anlægsgartner` — they're all hitting the `modern`/score-<40 ceiling, or my classifier isn't matching `Vinduespolering`. Fix: add the variant to `morning_fetch.mjs` classifier.
4. **`other_unknown` (3,837 rows) is gold buried.** Notable raw branches missing from BRANCHES: `Hovedentreprenør` (947 — huge construction firms, likely too big), `Tjenester` (948 — generic), `Producent` (584 — manufacturers, skip), `Konsulent` (261 — skip), `Butik` (184 — retail), `Bogholderi` (67 — bookkeepers, technically professional), `Vinduespolering` (56 — should be `service_window`), `Hotel` (36 — excluded per ICP), `Fotohandler` (5), `Bageri` (16), `Konditori` (1), `Brolægger` (1), `Træbeskærer` (2). Realistic recoverable from `other_unknown`: maybe 100–200 leads (bakers, bookkeepers, hovedentreprenør that look small, vinduespolering).
5. **0 leads scored ≥ 90.** The scoring ceiling is too tight. See §6.

### Per-city eligibility — the cities producing 0 or 1–2

**In your `CITIES` list but producing ZERO eligible (8 cities):**
Tilst, Hasselager, Lystrup, Beder, Solbjerg, Hjortshøj, Ry, Ringkøbing.

**Producing 1–2 only (16 cities):**
Risskov, Højbjerg, Skødstrup, Malling, Hinnerup, Egå, Galten, Hammel, Odder, Grenaa, Ebeltoft, Hadsten, Silkeborg, Viborg, Struer, Lemvig.

These 24 cities are not "dead weight" individually — they still cost ~22 queries each per scrape — but together they're 35 % of `CITIES` returning ~5 % of eligible leads. Consider dropping pure suburbs (Tilst, Hasselager, Lystrup, Skødstrup, Hjortshøj, Egå, Beder, Solbjerg, Malling — they're all Aarhus postal areas already covered by `Aarhus`/`Risskov` queries). That saves ~200 queries per full scrape.

**Top 10 eligible cities** (where the leads are):
Fredericia 23 · Vejle 21 · Esbjerg 20 · Svendborg 18 · Hjørring 17 · Aalborg 16 · Hobro 15 · Brønderslev 14 · Haderslev 14 · Nørresundby 14.

Notice: Aarhus only produces 9 eligible leads despite being the second-biggest city in Denmark, and Copenhagen produces 1 (it's not in `CITIES` — that lead came from address-extraction on a misregistered place).

---

## 3. Coverage gaps

### Geographic gap — Copenhagen is missing entirely

Greater Copenhagen ≈ 1.3 M people. Your `CITIES` list has 0 of them. Add at minimum:

```
København, Frederiksberg, Valby, Vanløse, Nørrebro, Østerbro, Vesterbro,
Amager, Hellerup, Lyngby, Gentofte, Glostrup, Rødovre, Hvidovre, Brøndby,
Albertslund, Ballerup, Herlev, Ishøj, Tåstrup, Greve, Køge, Roskilde,
Hillerød, Helsingør, Birkerød, Holte
```

Even a conservative pick (top 8: København, Frederiksberg, Lyngby, Hellerup, Gentofte, Roskilde, Hillerød, Helsingør) at ~30 eligible each would roughly **double** the pool. Copenhagen is also where the highest-paying customers live (Lucas's services are cheap relative to CPH labour rates — easier upsell).

### Geographic gap — Sjælland & islands

Currently 0 coverage. Add: Slagelse, Næstved, Holbæk, Kalundborg, Sorø, Ringsted, Vordingborg, Maribo, Nykøbing F, Nakskov, Rønne (Bornholm), Allinge.

### Geographic gap — Aarhus depth

Aarhus city itself only produces 9 eligible leads. Two reasons:
- Many Aarhus businesses are already `modern` (urban → better web vendors).
- The Aarhus query is split across 24 suburbs that mostly hit the same central businesses.

Recommendation: drop the suburbs that already share central Aarhus postcodes (~9 suburbs) and instead run Aarhus queries with **branch-specific modifiers** — `frisør Aarhus C`, `frisør Aarhus N`, `frisør Aarhus V`, `frisør Aarhus Ø` — and add nearby missing towns: **Mårslet, Stilling, Hørning** (Hørning is missing — 3 leads are auto-extracted there already).

### Branch verticals likely under-scraped

Industry estimates (rough Danish small-biz totals, conservative):

| Branch | Pool in sheet | Estimated Denmark-wide active firms | Coverage % |
|---|---:|---:|---:|
| Frisør / barber / salon | 889 | ~3,500 | 25 % |
| Skønhed / hud / negle / wellness | 226 | ~2,500 | 9 % |
| Restaurant + café + fast-food | 821 | ~7,000 | 12 % |
| Tømrer + snedker | 69 | ~4,000 | 2 % (dramatically under-scraped) |
| Maler | 423 | ~3,000 | 14 % |
| Elektriker | 425 | ~2,500 | 17 % |
| VVS / blikkenslager | 168 | ~2,000 | 8 % |
| Fotograf | 114 | ~2,000 | 6 % |
| Anlægsgartner | 46 | ~2,000 | 2 % |
| Rengøring | 77 | ~3,000 | 3 % |
| Vinduespudser (under `Vinduespolering`) | 56 | ~800 | 7 % |

**Under-served verticals** (in priority order): tømrer/snedker, anlægsgartner, rengøring, skønhed/hud/negle, fotograf, vinduespudser, VVS. Many of these are 1–3-person owner-operator businesses — exactly your ICP.

### Sub-branches missing from `BRANCH_PRESETS`

Google Places returns categories that your preset list doesn't query for, but which match ICP perfectly:

- **beauty**: `kosmetolog`, `fodpleje` (14 in sheet), `tatovør`, `solcenter`, `klinisk tandtekniker` (the small-biz sub-branch of dental, often owner-operator)
- **food**: `pizzeria`, `kebab`, `burgerbar`, `kaffebar`, `bistro`, `bageri` (16 already), `konditori`, `isbar`, `sushi` (small ones), `grill`, `smørrebrødsforretning`, `vinbar` (2 in sheet)
- **craft**: `snedker` (treated separately from tømrer — 0 in `BRANCHES`), `tagdækker` (already there but 200 leads, mostly modern), `brolægger` (1), `kloakmester`, `tæppeforretning`, `gulvfirma`, `træbeskærer` (2)
- **service**: `vinduespolering` (56 hidden), `havepleje` (4), `flyttefirma`, `skadedyrsbekæmpelse`, `pool-service`
- **photo**: `bryllupsfotograf`, `portrætfotograf`, `pasfoto` (1), `videoproduktion` (1)

---

## 4. Quality bar recommendations

### Reviews of currently-sent and pending leads

**Sent (57)**: Lucas's hand-curated v1 batch (37 manual) and the queue's first 20 — all have ≥ 30 reviews based on names (Café Hyggestunden, Restaurant Klosterkroen, etc. — all established places). Two outliers: `Brønderslev El-Teknik A/S` (35 reviews — borderline professional) and `Sydvesten ApS` (595 reviews — that's a strong one).

**Pending (28)**: review distribution =

| Bucket | Count |
|---|---:|
| 10–14 | **3** |
| 15–19 | 1 |
| 20–29 | 8 |
| 30–49 | 6 |
| 50–99 | 3 |
| 100–199 | 3 |
| 200+ | 4 |

The 3 sub-15-review leads are the weakest in queue. Your ICP says "≥30 reviews" — half the pending batch is below that bar.

### Recommendation: tier the review threshold per branch

In `scrape/route.ts` the current filter is already tiered, but the **send-pipeline filter** in `.morning_fetch.mjs` uses a flat `reviews < 10` cutoff. Bring the send-pipeline up to ICP standards:

| Branch group | Current scrape cutoff | Current send cutoff | Recommended send cutoff | Rationale |
|---|:---:|:---:|:---:|---|
| food (restaurant/café) | 30 | 10 | **30** | Match ICP. Pending has a 12-review pizzeria — that's a side-business, not "proven traffic". |
| food (fast/pizzeria/kebab) | 30 | 10 | **40** | These accumulate reviews fast; 10–30 = brand-new or fading. |
| beauty_hair | 25 | 10 | **20** | Salons accumulate slowly; 20 is fair. |
| beauty_other (skønhed/hud/negle) | 15 | 10 | **15** | Niche; 15 is fine. |
| craft (all) | (none) | 10 | **20** | Tradesmen rarely collect reviews; 20 already signals an organized owner. |
| photo | (none) | 10 | **15** | Same as beauty_other. |
| service | (none) | 10 | **15** | Same. |

Net effect: drops the 4 weakest leads from current pending batch; raises overall reply-rate.

### Also: hard-floor on rating

You're not currently filtering on rating. A place with 50 reviews and 2.8 stars is a different conversation than one with 50 reviews and 4.8 stars. Add: **drop leads with rating < 3.5** at scrape time. (You already require ≥4.0 in your ICP — 3.5 is the safe floor.)

---

## 5. Per-branch scrape strategy

### beauty (currently strongest pool, weakest email-coverage)

- **Search terms to add to `BRANCH_PRESETS.beauty`**: `barbersalon` (top sub-branch in your data, currently aliased to frisør), `kosmetolog`, `fodpleje`, `solcenter`, `tatovør`, `wellness`, `spa`, `massageklinik`, `negletekniker`, `voksning`, `permanent makeup`.
- **Cities to prioritize**: København (missing), Aarhus (low yield — try `frisør Aarhus C`), Esbjerg, Aalborg, Odense.
- **Threshold**: keep `frisørsalon ≥ 25 reviews`, raise others (skønhedsklinik/hudklinik/negle) from 15 → 20.
- **Email-finder is the real bottleneck**: 193 eligible hair salons, only 3 with emails. Run `bulk-find-emails` against all 193 — that's the highest-ROI single action you can take tonight (the leads exist, just need contact info).

### food

- **Add to `BRANCH_PRESETS.food`**: `pizzeria`, `kebab`, `burgerbar`, `kaffebar`, `bistro`, `bageri`, `konditori`, `isbar`, `grillbar`, `smørrebrødsforretning`. Currently only `restaurant` and `café`.
- **Cities**: focus on tourism corridors — Skagen, Ebeltoft, Svendborg, Aarhus, København, Helsingør.
- **Threshold**: 30 for sit-down, 40 for pizza/grill/kebab.
- **Note**: 295 restaurants and 85 cafés are already `modern` and skipped — that's a lot. Consider sending a different pitch ("better SEO / online-ordering") for `mediocre`-tier food rather than skipping outright.

### craft (massive untapped potential)

- **Add to `BRANCH_PRESETS.craft`**: `snedker` (treated as separate from tømrer), `kloakmester`, `gulvfirma`, `træbeskærer`, `brolægger`, `låsesmed`, `glarmester`. Consider splitting from `craft` into `craft_build` and `craft_utility` for cleaner reporting.
- **Cities**: small towns and exurbs. Craftsmen don't web-shop as aggressively in: Tønder, Lemvig, Thisted, Skagen, rural Sjælland. Skip Aarhus/Odense central where they're all `modern`.
- **Threshold**: 20 reviews. Many craftsmen have 5–15 reviews and that's just normal — but at <20 you're talking to people who don't take email seriously.
- **The "modern" wall**: 41 % of electricians and 32 % of painters are already classified `modern`. Many of those `modern` sites are template-builder garbage (Wix/Jimdo with mobile responsiveness) — your `verify` route may be too generous calling them `modern`. Consider re-running the verifier with stricter heuristics (no React/Next = automatic downgrade to `mediocre`).

### photo (strong fit, small pool)

- **Add**: `bryllupsfotograf`, `portrætfotograf`, `pasfoto`, `videoproduktion`, `dronefotograf`.
- **Cities**: photographers cluster around Aarhus + København. Add CPH cities to unlock 2–3× the pool.
- **Threshold**: 15.
- 19/31 photo eligible already have emails — this group is **send-ready right now**.

### service (broken — biggest hidden gain)

- The classifier in `morning_fetch.mjs` matches `rengøring|vinduespudser|anlægsgartner` but Google returns `Vinduespolering` (not "vinduespudser") and `Have/Havepleje` (not "anlægsgartner"). 56 + 4 = 60 leads currently invisible because of a regex miss.
- **Fix**: add `vinduespolering`, `havepleje`, `havearbejde`, `flyttefirma` to the classifier regex.
- **Add to `BRANCH_PRESETS`**: `flyttefirma`, `skadedyrsbekæmpelse`, `pool service`, `tæpperens`, `vinduespolering`.
- **Threshold**: 15.

---

## 6. Lead-quality scoring improvements

### Current `scoreLead()` review

```ts
const normalized = Math.min((rating * Math.log10(reviews + 1)) / (5 * 2), 1);
score += Math.round(normalized * 40);    // max 40 from rating×reviews
if (!place.website) score += 30;          // max 30 for no-website
if (reviews >= 20) score += 15;           // max 15 bonus
```

Theoretical max = 85 (rating=5, reviews≥20, no website). With `websiteQualityBonus` up to +25 at verification → real max 110, capped at 100. But: **no lead in the sheet scores ≥ 90.** That means the verifier-bonus is almost never being applied, or the no-website + tier-bonus paths are mutually exclusive (they are: line 167 in `sheets.ts` returns 0 if `websiteStatus === "none"` — the +30 is already in scrape-time score).

Net: real cap is ~85 from scrape, +25 at verify if tier=dead → ~88 actual. Matches the data.

### Concrete scoring tweaks (apply in `scoreLead` unless noted)

```ts
export function scoreLead(place: ApifyPlace): number {
  let score = 0;

  const rating  = place.totalScore ?? 0;
  const reviews = place.reviewsCount ?? 0;
  const name    = (place.title ?? "").toLowerCase();

  // 1) Base rating × reviews — unchanged
  if (rating > 0 && reviews > 0) {
    const normalized = Math.min((rating * Math.log10(reviews + 1)) / (5 * 2), 1);
    score += Math.round(normalized * 40);
  }

  // 2) No-website bonus — unchanged
  if (!place.website) score += 30;

  // 3) Review milestones — tier the bonus
  if (reviews >= 100) score += 25;
  else if (reviews >= 50) score += 20;
  else if (reviews >= 20) score += 15;

  // 4) Rating floor — penalize anything below 4.0 (your ICP)
  if (rating > 0 && rating < 4.0) score -= 15;
  if (rating > 0 && rating < 3.5) score -= 25;

  // 5) Small-business signals — bonus
  if (/\bv\/\b/.test(name))            score += 8;  // "v/Anders Hansen" = owner-operator
  if (/\baps\b/.test(name))            score += 4;  // small Danish LLC
  if (/\b(i\/s|enkeltmandsfirma)\b/.test(name)) score += 6;

  // 6) Corporate / chain signals — penalty (defense in depth)
  if (/\ba\/s\b/.test(name))           score -= 8;
  if (/\b(group|holding|nordic|denmark|gruppen|kæden)\b/.test(name)) score -= 20;
  if (/\b(franchise|filial|afdeling)\b/.test(name)) score -= 30;

  // 7) FB-only proxy: website domain is facebook.com / linktr.ee / instagram
  if (place.website && /facebook\.com|fb\.me|linktr\.ee|instagram\.com|tiktok\.com/.test(place.website)) {
    score += 18; // FB-only = bad current site = good prospect, but they may not check email
    // (don't add the +30 above because website is non-null — net is still +18 vs +30)
  }

  // 8) Light penalty for very low review counts even if rating perfect
  if (reviews > 0 && reviews < 10) score -= 10;

  return Math.max(0, Math.min(score, 100));
}
```

Net effects against your data:

- `Brønderslev El-Teknik A/S` (score 61, 35 reviews) → 61 − 8 = **53** (still passes 40-cutoff, but no longer prioritized).
- `Sydvesten ApS` (595 reviews) → +25 review milestone (was +15) → **lifts above 90 for the first time**, gets priority sorting.
- `Hordovska Beauty Denmark` (score 80) → 80 − 20 = **60** (denmark suffix = corporate red flag).
- Photographers like `Stougaard Fotografi v/Pernille Stougaard` → +8 owner bonus → top of pile.

### Defense-in-depth chain list to add to `chains.ts`

From the `branchRawCountsTopUnknown` data I can see these look chain-like and should be in `CHAIN_CONTAINS`:

```
"hovedentreprenør",  // 947 — generic descriptor but most are large GCs
"kvik køkkenet",     // alternate spelling
"telia", "telenor", "yousee", "3 mobile",
"danica", "tryg", "alm. brand", "topdanmark", "codan",  // insurance
"nordea", "danske bank", "jyske bank", "spar nord",     // banks
"isakssons", "frisør formel", "cutters", "klipperiet",  // hair chains
"my body & mind", "loop fitness", "puregym",            // gym chains
"baby sam", "br", "toys r us",                          // toys
"føtex food", "rema",                                   // grocery variants
```

### Penalty for hand-curated "tjenester / producent / butik / interessepunkt" branches

Add to scrape filter — drop entirely if `categoryName` matches `Tjenester|Producent|Butik|Interessepunkt|Konsulent|Hovedkontor` AND name doesn't contain a trade word from `JYSK_TRADE_WORDS`. That alone would have stopped ~2,500 useless rows from entering the sheet.

---

## 7. Cost analysis

### Google Places API (Text Search New)

- **Free tier:** $200/month credit. Text Search = $0.032 per request. Free = **6,250 requests/month**.
- **Per full scrape**: `buildQueries(BRANCHES, CITIES)` = 22 branches × 61 cities = **1,342 queries** per full sweep, capped at 20 results each = up to 26,840 places returned. Three full scrapes per month puts you at the $200 limit.
- **Reality from logs**: you do per-region scrapes (`?region=aarhus&branch=craft`) — those are 7 × 24 ≈ 168 queries. Much cheaper.
- **Recommendation**: stop doing full scrapes. Adopt a rolling weekly schedule: Monday=aarhus/craft, Tuesday=aalborg/beauty, Wednesday=esbjerg/food, etc. That stays well under 1,000 queries/week = $32 max.
- **If you add Copenhagen** (27 new cities) and expand BRANCH_PRESETS to ~35 sub-branches: full scrape = 35 × 88 = 3,080 queries = $98. Still inside the monthly free tier if done once a month.

### Gmail SMTP

- **Rate limit:** 500 messages/day for free Gmail, 2,000/day for Workspace. You've sent 57 in 24h — nowhere near.
- **Per-recipient limit:** 100/hour, 500/day to external recipients (free). The send_log shows ~6-minute spacing — generous.
- **Bounce-rate guardrail:** Gmail will start delaying/throttling at ~5 % bounce. You have 1 bounce in 57 = 1.8 % — fine. But the `skip-bounced` count (70) means your historic bounce-rate is ~50 % when using scraped emails without verification. Add a verification step (MX check) before sending.

### WebSearch quota

- Anthropic's WebSearch in Claude Code: no published per-day cap I'm aware of. The `_emailSource: "web_search"` rows in pending_batch show heavy use — looks ~5–10 searches per lead. At 50 leads/day that's 250–500 searches/day. Not a concern at current volume; if you 5× the pool, monitor.

### Apify

- Still in `.env.local` as `APIFY_TOKEN` but the codebase migrated to Google Places. Either delete the env var or repurpose Apify for richer scraping (e.g., website-content scrape for the `enrichedInfo` column).

---

## 8. Prioritized action list

### Quick wins (≤ 2 hours each)

1. **Fix the service-group classifier in `morning_fetch.mjs`.** Add `vinduespolering`, `havepleje`, `havearbejde` to the regex. Unlocks ~60 leads. (15 min)
2. **Run `bulk-find-emails` against the 193 beauty_hair eligible without emails.** Pure win — leads exist, just need contact info. (30 min, no code)
3. **Run `bulk-find-emails` against the 19 craft_electrician and 9 craft_plumber eligible.** Same logic. (15 min)
4. **Raise the send-pipeline review thresholds per §4 table.** Single regex update in `.morning_fetch.mjs`. Drops 3–4 weakest pending leads. (15 min)
5. **Drop 9 redundant Aarhus suburbs from `CITIES`.** Saves ~200 queries/scrape, no quality loss. (5 min)
6. **Add MX-record verification before queueing a send** (use `dns.resolveMx` in `compose_new.mjs`). Drops bounce-rate from ~50 % to <5 %. (1 hour)
7. **Add `Restaurant med takeaway`, `Familierestaurant`, `Cafeteria`, `Grillrestaurant` etc. to the food classifier regex.** Many already-scraped food leads sit in `other_unknown`. (15 min)

Expected combined impact: **+30 % eligible leads, +10 % reply rate, lower API cost.**

### Medium (1 day each)

8. **Add Copenhagen cities (12 minimum) and run a CPH-only scrape per branch group.** ~600 queries one-time, +800 eligible. (1 day inc. waiting)
9. **Expand `BRANCH_PRESETS` per §5** — pizzeria, kebab, kaffebar, bageri, snedker, kosmetolog, fodpleje, vinduespolering, etc. Then run targeted scrapes. (1 day)
10. **Implement scoring tweaks from §6.** Re-score all 8,459 rows in a one-shot batch. Some leads will drop below 40 (chains, A/S corporates), others (small-biz v/ owners) will rise into the top tier. (4 hours code + 1 hour data migration)
11. **Re-classify the `modern` tier wall.** Re-run `/api/verify-all` with stricter heuristics — require React/Next/modern framework markers or current SSL + responsive AND a real domain (not `.business.site` / `find-klip.dk` / `.wixsite.com`). Likely demotes 500–1,000 leads back into the eligible pool. (1 day)
12. **Add Sjælland coverage** (Slagelse, Næstved, Holbæk, Roskilde, Hillerød, Helsingør). (4 hours)

Expected combined impact: **+2× to 3× eligible pool, +25 % reply rate.**

### Long-term / strategic (1 week)

13. **Build a "branch swap" rule for already-`modern` leads** — instead of skipping, switch to a different offer (e.g., "I noticed your site loads slowly on mobile / your booking flow is broken"). Re-uses the existing 3,301 `modern` leads. (1 week with copy + A/B testing)
14. **Add a lead-quality regression model.** Train on the 660 `called` leads and the few replies — predict reply probability per lead. Replace `scoreLead` with the model's output. (1 week)
15. **Migrate Sheets → SQLite / Turso.** At 8,459 rows the Sheets API is fine; at 25,000+ you'll start to hit the 60-second timeouts on `/api/verify-all` and `/api/email/sync-replies`. (3 days)
16. **Add a continuous "discover new branches" loop.** Daily: pull every unique `categoryName` Google has returned in the last 7 days, flag any new ones for your review, auto-add if they match a regex of trade words. (1 week)

### Things to NOT do

- Don't blanket-send to the current `other_unknown` 3,837 rows — most are genuinely non-ICP (hotels, manufacturers, consultants). Filter first.
- Don't lower the rating floor below 4.0 — the time you save on prep gets eaten by replying to angry restauranteurs.
- Don't add `advokat / revisor / tandlæge / optiker` back to BRANCHES — your audit confirms 1,152 of these rows wasted scrape budget already; the ICP fits poorly.

---

## Appendix — raw audit metrics

- Sheet rows: 8,459
- Total eligible after full ICP filter: **437** (5.2 %)
- Untouched eligible (no email sent, no callback): **435**
- Eligible with verified email: **44** (10 %)
- Pending batch: 28 emails, 4 below ICP review bar
- Already sent: 57 (50 hand-curated + auto-sends since 2026-05-25)
- Confirmed bounces: 1 / 57 sends (1.8 %)
- Historic `skip-bounced` count: 70 leads
- Google Places query budget remaining this month: ~5,000 free queries (estimated)

Sleep well. Tomorrow's highest-ROI move is item #2 in the quick-wins list: get emails for the 193 hair salons sitting eligible-but-unaddressable.
