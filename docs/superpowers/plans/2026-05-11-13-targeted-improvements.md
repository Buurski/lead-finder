# 13 Targeted Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix followup templates, merge chain dedup lists, add callback dates, Fyn cities, professional targeting, unsubscribe footers, phone dedup, score-sorted sends, and client revenue totals.

**Architecture:** 10 files modified, 2 new files created. All changes are isolated within their file boundaries except chains.ts (consumed by bulk-send and cleanup routes) and sheets.ts Lead type (consumed by LeadTable and callback route).

**Tech Stack:** Next.js 16 App Router, TypeScript, Google Sheets API, nodemailer, React 19

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `src/lib/chains.ts` | Merged chain detection — replaces inline lists in both routes |
| Modify | `src/lib/sheets.ts` | Add `callbackDate` to Lead, add `getLeadPhones()`, add `updateCallbackDate()` |
| Modify | `src/lib/apify.ts` | Add Fyn cities to CITIES |
| Modify | `src/lib/email.ts` | Add `daysSince` to TemplateVars, fix followup copy, add unsubscribe footer |
| Modify | `src/app/api/email/bulk-send/route.ts` | Import chains, professional branch filter, sort by score, update GET response |
| Modify | `src/components/BulkEmailPanel.tsx` | Update to use `b.eligible` from new GET response |
| Modify | `src/app/api/leads/cleanup/route.ts` | Import `isChain` from chains.ts |
| Modify | `src/app/api/scrape/route.ts` | Phone dedup via `getLeadPhones()` |
| Create | `src/app/api/leads/[id]/callback/route.ts` | PATCH endpoint for callbackDate |
| Modify | `src/components/LeadTable.tsx` | callbackDate date input + row highlighting |
| Modify | `src/app/clients/page.tsx` | Revenue totals header |

---

## Task 1: Create src/lib/chains.ts

**Files:**
- Create: `src/lib/chains.ts`

This replaces the three separate chain lists in `bulk-send/route.ts` (CHAIN_EXACT + CHAIN_CONTAINS) and `cleanup/route.ts` (CHAIN_KEYWORDS). The exported `isChain` function accepts an optional `extra` array for ad-hoc keywords (used by cleanup route's API).

- [ ] **Step 1: Create src/lib/chains.ts**

```typescript
const CHAIN_EXACT = [
  "jysk", "netto", "lidl", "aldi", "zara", "ikea", "matas", "stark", "shell", "subway",
  "bones", "flammen", "sticks'n'sushi", "cofoco", "sunset boulevard",
  "joe & the juice", "joe and the juice", "espresso house", "baresso",
  "pizza hut", "domino's", "papa john's",
  "kfc", "taco bell", "wendy's",
];

const CHAIN_CONTAINS = [
  // Optics
  "synoptik", "profiloptik", "specsavers", "fielmann", "louis nielsen",
  // Electronics
  "elgiganten", "power electronics", "power (elektronik", "harold nyborg",
  // Fast food / cafes
  "mcdonalds", "mcdonald's", "mcdonald", "burger king", "7-eleven", "starbucks",
  "domino", "pizza king", "wingstop", "wagamama", "hereford beefstouw",
  "lagkagehuset", "riccos kaffebar", "the union kitchen",
  "sticks n sushi", "sunset blvd",
  // Grocery / retail
  "rema 1000", "bilka", "føtex", "kvickly", "coop", "normal store", "normal a/s",
  "søstrene grene", "flying tiger", "tiger stores", "h&m",
  "sportsmaster", "intersport",
  // DIY / building
  "silvan", "xl-byg", "bauhaus", "jem & fix",
  // Fuel
  "circle k", "q8 energie", "ok benzin",
  // Kitchen
  "kvik køkken",
  // Fitness
  "fitness world", "sats fitness",
  // Professional services chains
  "deloitte", "pwc", "kpmg", "ernst & young", "bdo revision",
];

export function isChain(name: string, extra?: string[]): boolean {
  const lower = name.toLowerCase();
  for (const chain of CHAIN_EXACT) {
    if (new RegExp(`\\b${chain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) return true;
  }
  const containsList = extra ? [...CHAIN_CONTAINS, ...extra] : CHAIN_CONTAINS;
  return containsList.some((chain) => lower.includes(chain.toLowerCase()));
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/chains.ts
git commit -m "feat: add src/lib/chains.ts — unified chain detection"
```

---

## Task 2: Update src/lib/sheets.ts

**Files:**
- Modify: `src/lib/sheets.ts`

Three changes: (a) add `callbackDate` field to Lead and expand the range, (b) add `getLeadPhones()` for phone dedup in scrape, (c) add `updateCallbackDate()` for the callback API.

- [ ] **Step 1: Add callbackDate to Lead interface**

In the `Lead` interface, after `reviewsCount`, add:
```typescript
  callbackDate: string;      // column U — ISO date "YYYY-MM-DD" or ""
```

- [ ] **Step 2: Update LEADS_RANGE**

```typescript
const LEADS_RANGE = "Leads!A2:U";
```

- [ ] **Step 3: Add callbackDate to getLeads() mapping**

After `reviewsCount: Number(row[19]) || 0,`, add:
```typescript
    callbackDate: row[20] ?? "",
```

- [ ] **Step 4: Add callbackDate placeholder to appendLeads()**

In `appendLeads`, the row array comment says `// columns O–S`. Change the row mapping to add a 21st element after `l.reviewsCount ?? 0`:
```typescript
    l.reviewsCount ?? 0,     // column T
    "",                       // column U — callbackDate (empty at scrape time)
```

- [ ] **Step 5: Add getLeadPhones() function**

After `getLeadNames()`, add:
```typescript
export async function getLeadPhones(): Promise<string[]> {
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: "Leads!C2:C",
  });
  return (res.data.values ?? []).map((r) => r[0] ?? "").filter(Boolean);
}
```

- [ ] **Step 6: Add updateCallbackDate() function**

After `updateLeadEmailStatus()`, add:
```typescript
export async function updateCallbackDate(rowIndex: number, date: string): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `Leads!U${row}`,
    valueInputOption: "RAW",
    requestBody: { values: [[date]] },
  });
}
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/sheets.ts
git commit -m "feat: add callbackDate to Lead, getLeadPhones(), updateCallbackDate()"
```

---

## Task 3: Update src/lib/apify.ts — Fyn cities

**Files:**
- Modify: `src/lib/apify.ts`

- [ ] **Step 1: Add Fyn section to CITIES array**

After the `// South Jutland` section, add:
```typescript
  // Fyn
  "Odense", "Middelfart", "Svendborg", "Nyborg", "Kerteminde",
```

The full CITIES export will now have 33 cities.

- [ ] **Step 2: Commit**

```bash
git add src/lib/apify.ts
git commit -m "feat: add Fyn cities to CITIES (Odense, Middelfart, Svendborg, Nyborg, Kerteminde)"
```

---

## Task 4: Update src/lib/email.ts — daysSince + unsubscribe

**Files:**
- Modify: `src/lib/email.ts`

Three changes: (a) add `daysSince` to TemplateVars so followup templates can show actual days, (b) replace hardcoded "en uges tid siden" in all 5 followup templates, (c) append unsubscribe footer to all emails via buildHtml and getEmailTemplate.

- [ ] **Step 1: Add UNSUBSCRIBE constants after BRANCH_DISPLAY**

After the `BRANCH_DISPLAY` declaration, add:
```typescript
const UNSUBSCRIBE_TEXT = `\n\n---\nØnsker du ikke at høre fra mig igen? Skriv blot tilbage, så fjerner jeg dig fra listen.`;
const UNSUBSCRIBE_HTML = `<br><br><hr style="border:none;border-top:1px solid #eee;margin:16px 0;"><p style="color:#999;font-size:12px;">Ønsker du ikke at høre fra mig igen? Skriv blot tilbage, så fjerner jeg dig fra listen.</p>`;
```

- [ ] **Step 2: Update buildHtml to include unsubscribe HTML before tracking pixel**

Replace the existing `buildHtml` function:
```typescript
function buildHtml(body: string, trackingPixelUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
${UNSUBSCRIBE_HTML}
<br><br>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" />
</body></html>`;
}
```

- [ ] **Step 3: Add daysSince to TemplateVars interface**

Replace the existing `TemplateVars` interface:
```typescript
interface TemplateVars {
  name: string;
  branch: string;
  branchDisplay: string;
  city: string;
  trackingPixelUrl: string;
  websiteStatus: string;
  websiteQualityTier: string;
  daysSince: number;
}
```

- [ ] **Step 4: Fix food followup template — use daysSince**

In `TEMPLATES.food.followup`, replace the hardcoded line:
```
Jeg sendte en mail for en uges tid siden om en ny hjemmeside til jer — hørte ikke tilbage, men tilbuddet gælder stadig.
```
With:
```
Jeg sendte en mail for ${v.daysSince} dage siden om en ny hjemmeside til jer — hørte ikke tilbage, men tilbuddet gælder stadig.
```
Do this in both the `text` string and the HTML `<p>` tag.

- [ ] **Step 5: Fix craft followup template — use daysSince**

In `TEMPLATES.craft.followup`, replace:
```
Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
With:
```
Jeg sendte en mail for ${v.daysSince} dage siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
In both text and HTML.

- [ ] **Step 6: Fix photo followup template — use daysSince**

In `TEMPLATES.photo.followup`, replace:
```
Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
With:
```
Jeg sendte en mail for ${v.daysSince} dage siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
In both text and HTML.

- [ ] **Step 7: Fix professional followup template — use daysSince**

In `TEMPLATES.professional.followup`, replace:
```
Jeg sendte en mail for en uges tid siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
With:
```
Jeg sendte en mail for ${v.daysSince} dage siden — hørte ikke tilbage, men tilbuddet gælder stadig.
```
In both text and HTML.

- [ ] **Step 8: Fix service followup template — use daysSince**

In `TEMPLATES.service.followup`, replace:
```
Jeg sendte en mail for en uges tid siden om en hjemmeside til jer — tilbuddet gælder stadig.
```
With:
```
Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.
```
In both text and HTML.

- [ ] **Step 9: Append unsubscribe text in getEmailTemplate, update sendLeadEmail signature**

In `getEmailTemplate`, append UNSUBSCRIBE_TEXT to the result text (HTML is handled by buildHtml). Replace the return statement:
```typescript
export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "trackingPixelUrl" | "branchDisplay"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  const branchDisplay = getBranchDisplay(branch);
  const result = template({ ...vars, trackingPixelUrl, branchDisplay });
  return { ...result, text: result.text + UNSUBSCRIBE_TEXT };
}
```

- [ ] **Step 10: Update sendLeadEmail to compute daysSince and pass emailSentAt**

Replace `sendLeadEmail`:
```typescript
export async function sendLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; email: string; websiteStatus: string; websiteQualityTier: string; emailSentAt: string },
  type: "cold" | "followup"
): Promise<void> {
  const daysSince = type === "followup" && lead.emailSentAt
    ? Math.round((Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24))
    : 7;
  const template = getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
    daysSince,
  });
  await transporter.sendMail({
    from: `Lucas Buur <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}
```

- [ ] **Step 11: Update previewEmailTemplate to accept emailSentAt**

Replace `previewEmailTemplate`:
```typescript
export function previewEmailTemplate(
  lead: { id: string; name: string; branch: string; city: string; websiteStatus: string; websiteQualityTier: string; emailSentAt?: string },
  type: "cold" | "followup"
): EmailTemplate {
  const daysSince = type === "followup" && lead.emailSentAt
    ? Math.round((Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24))
    : 7;
  return getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
    daysSince,
  });
}
```

- [ ] **Step 12: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add daysSince to followup templates, add unsubscribe footer to all emails"
```

---

## Task 5: Update src/app/api/email/bulk-send/route.ts

**Files:**
- Modify: `src/app/api/email/bulk-send/route.ts`
- Modify: `src/components/BulkEmailPanel.tsx`

Four changes: (a) remove inline chain logic, import from chains.ts, (b) add PROFESSIONAL_BRANCHES with higher score threshold, (c) sort eligible list by score DESC, (d) update GET response shape.

- [ ] **Step 1: Replace the entire file content**

```typescript
import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";
import { isChain } from "@/lib/chains";

export const maxDuration = 300;

function getTier(score: number): "A" | "B" | "C" {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

const PROFESSIONAL_BRANCHES = ["advokat", "revisor", "fysioterapeut", "tandlæge", "optiker"];

function isEligible(lead: { score: number; branch: string; email: string; emailSentAt: string; status: string; websiteQualityTier: string; name: string }): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!lead.email || !emailRegex.test(lead.email)) return false;
  if (lead.emailSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  if (lead.websiteQualityTier === "modern") return false;
  if (isChain(lead.name)) return false;
  const isProfessional = PROFESSIONAL_BRANCHES.some((b) => lead.branch.toLowerCase().includes(b));
  const minScore = isProfessional ? 70 : 40;
  return lead.score >= minScore;
}

export async function GET() {
  const leads = await getLeads();
  const eligible = leads
    .filter(isEligible)
    .sort((a, b) => b.score - a.score);
  return NextResponse.json({
    eligible: eligible.length,
    leads: eligible.map((l) => ({
      id: l.id,
      name: l.name,
      score: l.score,
      branch: l.branch,
      city: l.city,
      email: l.email,
      websiteQualityTier: l.websiteQualityTier,
    })),
  });
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isEligible(lead))
    .sort((a, b) => b.lead.score - a.lead.score);

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      if (lead.status === "new") {
        await updateLeadStatus(rowIndex, "called");
      }
      results.push({ name: lead.name, email: lead.email, ok: true });
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
```

- [ ] **Step 2: Update BulkEmailPanel.tsx — use b.eligible instead of b.count**

In `src/components/BulkEmailPanel.tsx`, line 25:
```typescript
    setBulkCount(b.eligible ?? 0);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/bulk-send/route.ts src/components/BulkEmailPanel.tsx
git commit -m "feat: bulk-send — chain dedup from lib, professional threshold, score sort, richer GET response"
```

---

## Task 6: Update src/app/api/leads/cleanup/route.ts

**Files:**
- Modify: `src/app/api/leads/cleanup/route.ts`

Remove inline CHAIN_KEYWORDS and local `isChain`, import from chains.ts.

- [ ] **Step 1: Replace the entire file content**

```typescript
import { NextResponse } from "next/server";
import { getLeads, deleteLeadRows } from "@/lib/sheets";
import { isChain } from "@/lib/chains";

// GET — preview which leads would be deleted (dry run)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const extra = searchParams.get("extra")?.split(",").filter(Boolean) ?? [];

  const leads = await getLeads();
  const matches = leads.filter((l) => isChain(l.name, extra));

  return NextResponse.json({
    count: matches.length,
    leads: matches.map((l) => ({ id: l.id, name: l.name, branch: l.branch, city: l.city, status: l.status })),
  });
}

// POST — delete chain leads. Pass { extra: ["keyword1", ...] } to add ad-hoc chain names.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const extra: string[] = Array.isArray(body.extra) ? body.extra : [];

  const leads = await getLeads();
  const toDelete = leads.filter((l) => isChain(l.name, extra));

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No chain leads found" });
  }

  const sheetRowNumbers = toDelete.map((l) => Number(l.id));
  await deleteLeadRows(sheetRowNumbers);

  return NextResponse.json({
    deleted: toDelete.length,
    names: toDelete.map((l) => l.name),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/leads/cleanup/route.ts
git commit -m "refactor: cleanup route — import isChain from lib/chains.ts"
```

---

## Task 7: Update src/app/api/scrape/route.ts — phone dedup

**Files:**
- Modify: `src/app/api/scrape/route.ts`

Add phone dedup: fetch existing phones from column C and skip new leads whose phone is already in the sheet.

- [ ] **Step 1: Add getLeadPhones import**

Change the sheets import line from:
```typescript
import { appendLeads, getLeadNames } from "@/lib/sheets";
```
To:
```typescript
import { appendLeads, getLeadNames, getLeadPhones } from "@/lib/sheets";
```

- [ ] **Step 2: Fetch phones in parallel with names and build phone set**

Replace:
```typescript
    // Skip duplicates already in sheet
    const existing = await getLeadNames();
    const existingSet = new Set(existing.map((n) => n.toLowerCase()));
```
With:
```typescript
    // Skip duplicates already in sheet (by name or phone)
    const [existing, existingPhones] = await Promise.all([getLeadNames(), getLeadPhones()]);
    const existingSet = new Set(existing.map((n) => n.toLowerCase()));
    const existingPhoneSet = new Set(existingPhones);
```

- [ ] **Step 3: Add phone dedup to the filter**

In the `.filter((p) => { ... })` block, after the name dedup check, add:
```typescript
        if (p.phone && existingPhoneSet.has(p.phone)) return false;
```
So the full filter block becomes:
```typescript
      .filter((p) => {
        if (!p.title || existingSet.has(p.title.toLowerCase())) return false;
        if (p.phone && existingPhoneSet.has(p.phone)) return false;
        const branch = (p.categoryName ?? "").toLowerCase();
        if (
          ((branch === "restaurant" || branch === "café") && (p.reviewsCount ?? 0) < 30) ||
          ((branch === "skønhedsklinik" || branch === "hudklinik" ||
            branch === "negle & vippeextensions salon") &&
           (p.reviewsCount ?? 0) < 15) ||
          (branch === "frisørsalon" && (p.reviewsCount ?? 0) < 25)
        ) return false;
        return true;
      })
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/scrape/route.ts
git commit -m "feat: phone dedup in scrape — skip leads with existing phone in sheet"
```

---

## Task 8: Create src/app/api/leads/[id]/callback/route.ts

**Files:**
- Create: `src/app/api/leads/[id]/callback/route.ts`

Note: `id` equals the sheet row number (e.g. "3" = row 3). `rowIndex = Number(id) - 2` because Lead.id = sheet row, and rowIndex = sheet row - 2.

- [ ] **Step 1: Create the file**

```typescript
import { NextResponse } from "next/server";
import { updateCallbackDate } from "@/lib/sheets";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { date } = await req.json();
  const rowIndex = Number(id) - 2;
  await updateCallbackDate(rowIndex, date ?? "");
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/api/leads/[id]/callback/route.ts"
git commit -m "feat: PATCH /api/leads/[id]/callback — save callbackDate to sheet col U"
```

---

## Task 9: Update src/components/LeadTable.tsx — callbackDate UI + row highlights

**Files:**
- Modify: `src/components/LeadTable.tsx`

Three additions: (a) a date input in the side panel that PATCHes on change, (b) row background highlighting for due/overdue callbacks, (c) update onMouseLeave to restore callback color not always transparent.

- [ ] **Step 1: Add updateCallback function near updateStatus**

After the `updateStatus` function definition (around line 131), add:

```typescript
  async function updateCallback(lead: Lead, date: string) {
    await fetch(`/api/leads/${lead.id}/callback`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    const updated = { ...lead, callbackDate: date };
    setLeads((prev) => prev.map((l) => l.id === lead.id ? updated : l));
    setSelected(updated);
  }
```

- [ ] **Step 2: Add todayStr computation in the component body**

After the `const paginated = useMemo(...)` line, add:

```typescript
  const todayStr = new Date().toISOString().slice(0, 10);
```

- [ ] **Step 3: Add callbackRowBg helper function**

After `todayStr`, add:

```typescript
  function callbackRowBg(lead: Lead): string {
    if (!lead.callbackDate) return "transparent";
    if (lead.callbackDate < todayStr) return "rgba(239,68,68,0.08)";
    if (lead.callbackDate === todayStr) return "rgba(251,146,60,0.1)";
    return "transparent";
  }
```

- [ ] **Step 4: Update each row's background and mouseLeave handler**

Find the `<tr>` in the table body (around line 349). Replace its `style` and event handlers:

```typescript
                  <tr key={lead.id}
                    onClick={() => selectLead(lead)}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: active ? "var(--green-dim)" : callbackRowBg(lead),
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                      boxShadow: active ? "inset 3px 0 0 var(--green)" : "none",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = callbackRowBg(lead); }}
                  >
```

- [ ] **Step 5: Add callback date input in the side panel**

In the side panel, after the Notes `<div>` block (around line 746) and before the Actions `<div>`, add:

```typescript
            {/* Callback date */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", display: "block", marginBottom: 6 }}>
                Ring tilbage
              </label>
              <input
                type="date"
                value={selected.callbackDate ?? ""}
                onChange={(e) => updateCallback(selected, e.target.value)}
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: selected.callbackDate && selected.callbackDate < todayStr
                    ? "1px solid rgba(239,68,68,0.6)"
                    : selected.callbackDate === todayStr
                    ? "1px solid rgba(251,146,60,0.6)"
                    : "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "7px 12px",
                  fontSize: 13,
                  color: "var(--text)",
                  outline: "none",
                  fontFamily: "inherit",
                  boxSizing: "border-box" as const,
                }}
              />
              {selected.callbackDate && (
                <button
                  onClick={() => updateCallback(selected, "")}
                  style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer", background: "none", border: "none", padding: "4px 0 0", display: "block" }}
                >
                  Fjern dato
                </button>
              )}
            </div>
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LeadTable.tsx
git commit -m "feat: callbackDate date picker + row highlights in LeadTable"
```

---

## Task 10: Update src/app/clients/page.tsx — revenue totals

**Files:**
- Modify: `src/app/clients/page.tsx`

Add MRR + setup fee totals displayed in the subtitle area.

- [ ] **Step 1: Compute totals and update the page**

Replace the entire `ClientsPage` component:

```typescript
import { getClients } from "@/lib/sheets";
import ClientCard from "@/components/ClientCard";

export const revalidate = 0;

export default async function ClientsPage() {
  let clients: Awaited<ReturnType<typeof getClients>> = [];
  try {
    clients = await getClients();
  } catch {
    // not configured yet
  }

  const totalMRR = clients.reduce((sum, c) => sum + (parseFloat(c.monthlyFee) || 0), 0);
  const totalSetup = clients.reduce((sum, c) => sum + (parseFloat(c.setupFee) || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h1 style={{
          fontFamily: "var(--font-fraunces), serif",
          fontSize: 26,
          fontWeight: 700,
          color: "var(--text)",
          letterSpacing: "-0.03em",
        }}>
          Klienter
        </h1>
        <p style={{ color: "var(--text-dim)", fontSize: 13, marginTop: 4 }}>
          {clients.length} bekræftede klienter
          {clients.length > 0 && (
            <> · <strong style={{ color: "var(--text)" }}>MRR: {totalMRR.toLocaleString("da-DK")} kr</strong> · Setup: {totalSetup.toLocaleString("da-DK")} kr</>
          )}
        </p>
      </div>

      {clients.length === 0 ? (
        <div style={{
          border: "1px dashed var(--border-light)",
          borderRadius: 12,
          padding: "80px 0",
          textAlign: "center",
          color: "var(--text-dim)",
          fontSize: 14,
        }}>
          Ingen klienter endnu. Marker et lead som &quot;Klient ✓&quot; for at tilføje dem her.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {clients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/clients/page.tsx
git commit -m "feat: clients page — show MRR, setup fee total, client count"
```

---

## Task 11: Build verification + final commit

**Files:**
- No code changes — build check only

- [ ] **Step 1: Run build**

```bash
npm run build
```

Expected: no TypeScript errors. If errors appear, fix them before proceeding. Common issues to watch for:
- `daysSince` missing from a `getEmailTemplate` call site (check `test-send/route.ts` if it calls `previewEmailTemplate`)
- `callbackDate` missing from any place that constructs a Lead-shaped object manually
- `params` in the callback route needs to be `Promise<{ id: string }>` (Next.js 16 dynamic route params are async)

- [ ] **Step 2: Fix any TypeScript errors**

Run `npm run build` again to confirm zero errors.

- [ ] **Step 3: Final squash commit (if desired) or just push**

```bash
git push origin main
```

---

## Self-Review Checklist

- [x] **Bug 1 (followup daysSince):** Task 4 steps 3–11 — TemplateVars, all 5 templates, sendLeadEmail, previewEmailTemplate
- [x] **Bug 2 (chains.ts merge):** Task 1 (create), Task 5 (bulk-send import), Task 6 (cleanup import)
- [x] **Bug 3 (sort by score):** Task 5 — `eligible.sort((a, b) => b.lead.score - a.lead.score)` in POST, `eligible.sort((a, b) => b.score - a.score)` in GET
- [x] **Bug 4 (phone dedup):** Task 7 — `getLeadPhones()` + existingPhoneSet filter
- [x] **Targeting 5 (professional threshold):** Task 5 — PROFESSIONAL_BRANCHES + isEligible logic
- [x] **Targeting 6 (Fyn cities):** Task 3
- [x] **Email 7 (unsubscribe):** Task 4 steps 1–2, 9 — UNSUBSCRIBE_TEXT/HTML constants, buildHtml, getEmailTemplate append
- [x] **Callback 8 (callbackDate schema):** Task 2 — Lead interface, LEADS_RANGE, getLeads, appendLeads
- [x] **Callback 9 (updateCallbackDate):** Task 2 step 6
- [x] **Callback 10 (API route):** Task 8
- [x] **Callback 11 (UI + highlights):** Task 9
- [x] **CRM 12 (GET response):** Task 5 step 1 (GET handler) + BulkEmailPanel.tsx update
- [x] **CRM 13 (revenue totals):** Task 10

**Placeholder scan:** No TBD, no "implement later", no steps without code.

**Type consistency:**
- `isChain(name, extra?)` — defined in Task 1, used exactly as `isChain(l.name)` and `isChain(l.name, extra)` in Tasks 5, 6.
- `updateCallbackDate(rowIndex, date)` — defined in Task 2 step 6, called as `updateCallbackDate(rowIndex, date ?? "")` in Task 8.
- `getLeadPhones()` — defined in Task 2 step 5, imported in Task 7.
- `callbackDate: string` on Lead — added in Task 2, read in Task 9 (`lead.callbackDate`, `selected.callbackDate`).
- `daysSince: number` in TemplateVars — added in Task 4 step 3, computed in sendLeadEmail (Task 4 step 10) and previewEmailTemplate (Task 4 step 11), used in followup templates via `v.daysSince` (Tasks 4 steps 4–8).
- `b.eligible` in BulkEmailPanel — GET returns `eligible` (Task 5 step 1), consumed as `b.eligible` (Task 5 step 2).
