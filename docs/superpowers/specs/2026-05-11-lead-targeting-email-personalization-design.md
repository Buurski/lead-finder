# Lead Targeting & Email Personalization — Design Spec
**Date:** 2026-05-11  
**Status:** Approved for implementation

---

## Context

Current system generates too many low-value leads: hair salons, tiny restaurants with no reviews, businesses in a narrow mid-Jutland cluster. Emails are generic Danish templates with no demos. Result: low email open/reply rates, leads that can't afford or don't want a website.

Goal: target businesses with real customer bases (reviews = social proof of money) + bad/no websites, spread across all of Jutland, with personalized emails that show actual demo sites per industry.

---

## 1. Cities (`src/lib/apify.ts` → `CITIES`)

Replace current 10-city list with ~30 cities across 3 Jutland regions.

**Remove:** Ikast, Herning (replace Herning with smaller nearby towns)

**North Jutland:**
Aalborg, Nørresundby, Hjørring, Frederikshavn, Skagen, Brønderslev, Hobro, Thisted

**South Jutland:**
Esbjerg, Kolding, Aabenraa, Haderslev, Tønder, Vejle, Fredericia, Billund

**Mid-Jutland (keep + expand):**
Herning, Silkeborg, Viborg, Holstebro, Ringkøbing, Struer, Skive, Lemvig, Horsens, Varde, Videbæk, Brande, Give, Vinderup, Ulfborg

---

## 2. Branches (`src/lib/apify.ts` → `BRANCHES`)

**Remove:** `frisørsalon` (poor email conversion, prefer cold calling)

**Keep all others unchanged.** No new branches added (no suitable demos exist for architect/realtor yet).

Final list: tømrer, maler, elektriker, VVS-installatør, blikkenslager, tagdækker, murermester, rengøringsvirksomhed, vinduespudser, anlægsgartner, advokat, revisor, fysioterapeut, tandlæge, optiker, restaurant, café, fotograf

---

## 3. Scoring (`src/lib/apify.ts` → `scoreLead()`)

**Problem:** A restaurant with 0 reviews and no website scores nearly as high as one with 80 reviews and a bad website. The second is a much better lead.

**New formula:**

```
base = min((rating × log10(reviews + 1)) / (5 × 2), 1) × 40   // 0–40 pts (was 35)
websiteBonus = websiteStatus === "none" || "dead" ? 30 : 0      // unchanged
reviewBonus = reviews >= 20 ? 15 : 0                            // NEW: real customer base
// No penalty for low reviews — just no bonus
total = min(base + websiteBonus + reviewBonus, 100)
```

**Restaurant/café filter:** Skip leads with `reviewsCount < 15` entirely during scrape (don't add to sheet). They lack the customer base to justify a website investment.

Apply this filter to both `restaurant` and `café` branches.

---

## 4. Demo Sites by Branch Group

| Branch group | Branches | Demo URL(s) |
|---|---|---|
| food | restaurant, café | https://under-klippen.vercel.app/ + https://zaytoon-six.vercel.app/ |
| craft | tømrer, maler, elektriker, VVS-installatør, blikkenslager, tagdækker, murermester, anlægsgartner | https://vestfjends.vercel.app/ |
| beauty/photo | fotograf | https://buurfoto.vercel.app/ |
| professional | advokat, revisor, fysioterapeut, tandlæge, optiker, vinduespudser, rengøringsvirksomhed | https://midtadvokaterne-dttc.vercel.app/ |

---

## 5. Email Rewrite (`src/lib/email.ts`)

### Core tone shift

Old: generic pitch, vague "gratis demo specielt til jer"  
New: specific opener tied to their situation + demo link as proof + personal offer

**Structure per email:**
1. Opener — acknowledge their situation (reviews/website state), natural Danish, sounds like a person
2. Demo line — "Jeg har lavet en demo-hjemmeside til [branch-type] — se den her: [url]"
3. Offer — "Det er kun en demo, men jeg laver selvfølgelig en fuld version der passer specifikt til [name]"
4. CTA — phone/email, keep it short

### Branch-specific opener lines

**food:**
> "Med [X] anmeldelser på Google er det synd at hjemmesiden ikke afspejler det — I fortjener bedre."  
> (If websiteStatus === "none": "I [city] kender folk jer. Med en ordentlig hjemmeside ville endnu flere gøre det.")

**craft:**
> "Jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme."

**fotograf:**
> "Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem."

**professional:**
> "I [city] kender folk jer. Hjemmesiden burde de også gøre."

**service (rengøring/vinduespudser):**
> Keep current tone — no demo link for this group, offer "kontakt mig for at se hvad jeg kan lave til jer"

### Demo presentation in email body

For groups with demos:
```
Jeg har faktisk allerede lavet en demo — se den her: [link]
[For food: "...og denne: [link2]"]
Det er kun en demo, men jeg laver en fuld version der er lavet specifikt til [name] — jeres stil, farver, indhold.
```

Always include the caveat: "Det er kun en demo" — user's explicit requirement.

### Follow-up emails

Same structural changes apply to follow-up templates. Slightly shorter, reference the first email. Keep demo links.

---

## 6. Files to Change

| File | Change |
|---|---|
| `src/lib/apify.ts` | Update `CITIES` array, update `BRANCHES` array, update `scoreLead()`, add restaurant min-review filter |
| `src/lib/email.ts` | Rewrite all 5 branch group templates (cold + followup), add demo URLs as constants at top |

No schema changes. No new files.

---

## 7. Verification

1. Run scrape on a restaurant-heavy city (Aalborg, Vejle) — verify no results with < 15 reviews appear
2. Verify `frisørsalon` branch no longer appears in scraped results
3. Check lead scores — a 4★ restaurant with 50 reviews + old website should score 70+
4. Send test email to own address — verify demo links appear, tone reads as human Danish
5. Check all 4 branch groups get correct demo URL in email body
