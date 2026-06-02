# Lead Targeting & Email Personalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand lead targeting to all of Jutland with quality filters, fix scoring to favor businesses with real customers, and rewrite email templates to include demo site links with a human tone.

**Architecture:** Two files change — `src/lib/apify.ts` (cities, branches, scoring, restaurant filter) and `src/lib/email.ts` (demo URL constants, branch group map, all 5 template groups). The scrape route `src/app/api/scrape/route.ts` gets a one-line minimum-review filter for food branches.

**Tech Stack:** TypeScript, Next.js App Router, Google Places API (via apify.ts), nodemailer, Google Sheets

---

## File Map

| File | Changes |
|---|---|
| `src/lib/apify.ts` | Replace CITIES (10→30), remove frisørsalon from BRANCHES, rewrite scoreLead() |
| `src/app/api/scrape/route.ts` | Add min-review filter for restaurant/café before saving leads |
| `src/lib/email.ts` | Add DEMO_URLS constant, update BRANCH_GROUP_MAP (remove beauty, add photo), rewrite all templates |

---

## Task 1: Expand CITIES and clean up BRANCHES

**Files:**
- Modify: `src/lib/apify.ts:16-32`

- [ ] **Step 1: Replace the CITIES array**

In `src/lib/apify.ts`, replace the CITIES constant (lines 29-32) with:

```typescript
export const CITIES = [
  // Mid-Jutland (kept minus Ikast)
  "Herning", "Silkeborg", "Viborg", "Holstebro", "Ringkøbing",
  "Struer", "Skive", "Lemvig", "Horsens", "Varde",
  "Videbæk", "Brande", "Give", "Vinderup", "Ulfborg",
  // North Jutland
  "Aalborg", "Nørresundby", "Hjørring", "Frederikshavn", "Skagen",
  "Brønderslev", "Hobro", "Thisted",
  // South Jutland
  "Esbjerg", "Kolding", "Aabenraa", "Haderslev", "Tønder",
  "Vejle", "Fredericia", "Billund",
];
```

- [ ] **Step 2: Remove frisørsalon from BRANCHES**

In `src/lib/apify.ts`, replace the BRANCHES constant (lines 16-27) with:

```typescript
export const BRANCHES = [
  // Håndværk
  "tømrer", "maler", "elektriker", "VVS-installatør", "blikkenslager", "tagdækker", "murermester",
  // Service
  "rengøringsvirksomhed", "vinduespudser", "anlægsgartner",
  // Professionelle
  "advokat", "revisor", "fysioterapeut", "tandlæge", "optiker",
  // Mad & oplevelse
  "restaurant", "café", "fotograf",
];
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/apify.ts
git commit -m "feat: expand cities to all Jutland, remove frisørsalon branch"
```

---

## Task 2: Fix scoreLead() to reward real customer bases

**Files:**
- Modify: `src/lib/apify.ts:126-140`

**Problem:** A business with 0 reviews and no website scores almost as high as one with 80 reviews and a bad website. The latter is a much better lead — they have money and customers.

**New formula:**
- Base: `rating × log10(reviews + 1)` normalized → 0–40 pts (was 35)
- Website bonus: +30 if no/dead website (unchanged)
- Review bonus: +15 if reviews ≥ 20 (proves real customer base)
- No penalty for low reviews — they just get no bonus
- Cap at 100

- [ ] **Step 1: Replace scoreLead() function**

Replace the function at lines 126-140 in `src/lib/apify.ts`:

```typescript
export function scoreLead(place: ApifyPlace): number {
  let score = 0;

  const rating = place.totalScore ?? 0;
  const reviews = place.reviewsCount ?? 0;
  if (rating > 0 && reviews > 0) {
    const normalized = Math.min((rating * Math.log10(reviews + 1)) / (5 * 2), 1);
    score += Math.round(normalized * 40);
  }

  if (!place.website) score += 30;
  if (reviews >= 20) score += 15;

  return Math.min(score, 100);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/apify.ts
git commit -m "fix: rewrite scoreLead to reward businesses with 20+ reviews"
```

---

## Task 3: Add minimum review filter for food branches in scrape route

**Files:**
- Modify: `src/app/api/scrape/route.ts`

Restaurants and cafés with fewer than 15 reviews likely can't afford a website or don't have enough customers to care. Filter them before saving.

- [ ] **Step 1: Read the scrape route**

Read `src/app/api/scrape/route.ts` to find the exact line where leads are filtered before saving (around line 17 — the `.filter()` call).

- [ ] **Step 2: Add the minimum review filter**

The current filter (around line 17) looks like:
```typescript
.filter((p) => p.title && !existingNames.has(p.title.toLowerCase()))
```

Update it to also skip food branches with low reviews:
```typescript
.filter((p) => {
  if (!p.title || existingNames.has(p.title.toLowerCase())) return false;
  const branch = (p.categoryName ?? "").toLowerCase();
  if ((branch === "restaurant" || branch === "café") && (p.reviewsCount ?? 0) < 15) return false;
  return true;
})
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scrape/route.ts
git commit -m "feat: skip restaurant/café leads with fewer than 15 reviews"
```

---

## Task 4: Update BRANCH_GROUP_MAP and add demo URL constants in email.ts

**Files:**
- Modify: `src/lib/email.ts:1-25`

Two issues to fix:
1. `fotograf` is in BRANCHES but missing from BRANCH_GROUP_MAP — it falls through with no template
2. `frisørsalon` is removed from BRANCHES but still in BRANCH_GROUP_MAP
3. No demo URL constants exist yet

- [ ] **Step 1: Add DEMO_URLS constant after the nodemailer transporter (around line 14)**

Insert after the transporter block, before BRANCH_GROUP_MAP:

```typescript
const DEMO_URLS = {
  food: [
    "https://under-klippen.vercel.app/",
    "https://zaytoon-six.vercel.app/",
  ],
  craft: "https://vestfjends.vercel.app/",
  photo: "https://buurfoto.vercel.app/",
  professional: "https://midtadvokaterne-dttc.vercel.app/",
} as const;
```

- [ ] **Step 2: Replace BRANCH_GROUP_MAP**

Replace the BRANCH_GROUP_MAP constant (lines 16-25):

```typescript
const BRANCH_GROUP_MAP: Record<string, string> = {
  tømrer: "craft", maler: "craft", elektriker: "craft",
  "vvs-installatør": "craft", blikkenslager: "craft",
  tagdækker: "craft", murermester: "craft",
  rengøringsvirksomhed: "service", vinduespudser: "service", anlægsgartner: "service",
  advokat: "professional", revisor: "professional",
  fysioterapeut: "professional", tandlæge: "professional", optiker: "professional",
  restaurant: "food", café: "food",
  fotograf: "photo",
};
```

Note: `getBranchGroup()` must normalize the branch to lowercase before lookup. Verify that function (around line 61-67) does `branch.toLowerCase()`. If not, add it:

```typescript
function getBranchGroup(branch: string): string {
  return BRANCH_GROUP_MAP[branch.toLowerCase()] ?? "service";
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "fix: add fotograf to BRANCH_GROUP_MAP, remove beauty group, add DEMO_URLS constants"
```

---

## Task 5: Rewrite all email templates

**Files:**
- Modify: `src/lib/email.ts:106-236` (TEMPLATES object)

Replace the entire TEMPLATES object. Remove the `beauty` group. Add a `photo` group. Rewrite all 5 groups with demo links and human-sounding Danish copy.

Key tone rules:
- Food: acknowledge their reviews situation, then show demos
- Craft: "jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme"
- Photo: "med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem"
- Professional: "I [city] kender folk jer. Hjemmesiden burde de også gøre"
- Service: no demo, just offer to make one

Always include: "Det er kun en demo, men jeg laver en fuld version der passer specifikt til [name]"

- [ ] **Step 1: Replace the entire TEMPLATES object**

Replace the TEMPLATES constant in `src/lib/email.ts`:

```typescript
const TEMPLATES: Record<string, Record<"cold" | "followup", (v: TemplateVars) => EmailTemplate>> = {
  food: {
    cold: (v) => {
      const ws = websiteLine(v.websiteStatus);
      const text = `Hej ${v.name},

${ws}

Jeg har lavet et par demo-hjemmesider til restauranter — se dem her:
→ ${DEMO_URLS.food[0]}
→ ${DEMO_URLS.food[1]}

Det er kun demoer, men jeg laver selvfølgelig en fuld version der passer specifikt til ${v.name} — jeres stil, menu, farver og det hele.

Ring eller skriv hvis I vil se hvad det kunne se ud som.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Har I overvejet en ny hjemmeside, ${v.name}?`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden om en ny hjemmeside til jer — hørte ikke tilbage, men tilbuddet gælder stadig.

Se mine demoer til restauranter:
→ ${DEMO_URLS.food[0]}
→ ${DEMO_URLS.food[1]}

Ring eller skriv hvis I er nysgerrige.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
  },

  craft: {
    cold: (v) => {
      const ws = websiteLine(v.websiteStatus);
      const text = `Hej ${v.name},

Jeres arbejde taler for sig selv — hjemmesiden burde gøre det samme.

${ws}

Jeg har lavet en demo-hjemmeside til ${v.branchDisplay} som jeres — se den her:
→ ${DEMO_URLS.craft}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til ${v.name}.

Ring eller skriv hvis du vil høre mere.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo til ${v.branchDisplay}:
→ ${DEMO_URLS.craft}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
  },

  photo: {
    cold: (v) => {
      const ws = websiteLine(v.websiteStatus);
      const text = `Hej ${v.name},

Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem.

${ws}

Jeg har lavet en demo-hjemmeside til fotografer — se den her:
→ ${DEMO_URLS.photo}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til dig — dit udtryk, dine billeder, din stil.

Ring eller skriv hvis du er nysgerrig.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Din hjemmeside, ${v.name}?`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo til fotografer:
→ ${DEMO_URLS.photo}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Din hjemmeside, ${v.name}`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
  },

  professional: {
    cold: (v) => {
      const ws = websiteLine(v.websiteStatus);
      const text = `Hej ${v.name},

I ${v.city} kender folk jer. Hjemmesiden burde de også gøre.

${ws}

Jeg har lavet en demo-hjemmeside til virksomheder som jeres — se den her:
→ ${DEMO_URLS.professional}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til ${v.name}.

Ring eller skriv hvis du vil høre mere.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.

Se min demo:
→ ${DEMO_URLS.professional}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
  },

  service: {
    cold: (v) => {
      const ws = websiteLine(v.websiteStatus);
      const text = `Hej ${v.name},

${ws}

Mange i ${v.city} søger lokale ${v.branchDisplay} online — en god hjemmeside er det første de ser.

Skriv eller ring hvis du vil se hvad jeg kan lave til jer.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for en uges tid siden om en hjemmeside til jer — tilbuddet gælder stadig.

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(text, v.trackingPixelUrl),
      };
    },
  },
};
```

- [ ] **Step 2: Run type check to verify no TypeScript errors**

```bash
npm run build
```

Expected: successful build, no type errors. If errors appear, check that `DEMO_URLS`, `buildHtml`, `websiteLine` are all in scope above the TEMPLATES definition.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: rewrite email templates with demo links and human tone"
```

---

## Task 6: Verify end-to-end

- [ ] **Step 1: Preview a food email**

Use the existing `/api/email/preview` endpoint (or `previewEmailTemplate()`) with a test lead in the restaurant branch. Verify:
- Demo links appear in the body
- Tone reads naturally
- Subject line is correct

If no preview endpoint exists, add a temporary log in the email route and send to your own address.

- [ ] **Step 2: Preview a craft email**

Same check with a lead in the tømrer/VVS branch. Verify `vestfjends.vercel.app` link appears.

- [ ] **Step 3: Preview a photo email**

Test with `fotograf` branch. Verify it hits the `photo` group (not `service` fallback) and shows `buurfoto.vercel.app`.

- [ ] **Step 4: Verify restaurant scrape filter**

Trigger a scrape for a city (e.g., Aalborg). Confirm no restaurant leads appear with fewer than 15 reviews in the Leads sheet.

- [ ] **Step 5: Verify score distribution**

Check a few leads in the sheet. A 4★ restaurant with 50 reviews + old website should score 70+. A business with 2 reviews and no website should score below 40.
