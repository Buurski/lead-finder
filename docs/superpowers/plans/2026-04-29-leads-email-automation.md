# Lead Expansion + Email Automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand lead scraping to hele Midtjylland + alle servicevirksomheder, og tilføj et komplet email-system med personlige skabeloner per branche, tracking, bulk-send og automatisk follow-up.

**Architecture:** Gmail SMTP via Nodemailer sender fra buur.aigro@gmail.com. Google Sheets udvides med 5 email-tracking-kolonner (O–S). Tracking sker via egne Next.js API-endpoints (tracking pixel + click-redirect). UI får en email-sektion i side-panelet per lead + et bulk-send-panel på dashboardet.

**Tech Stack:** Next.js App Router · Nodemailer · Google Sheets API · Tailwind/inline styles (matcher eksisterende kodebase)

---

## Filer der oprettes eller ændres

| Fil | Handling | Ansvar |
|---|---|---|
| `src/lib/apify.ts` | Modificer | BRANCHES + CITIES arrays, dynamisk query-generator |
| `src/lib/sheets.ts` | Modificer | Lead-type udvides med email-kolonner O–S, nye funktioner |
| `src/lib/email.ts` | Opret | Nodemailer-setup, skabeloner per branche, tracking-URL-builder |
| `src/app/api/leads/[id]/send-email/route.ts` | Opret | Send én mail til ét lead |
| `src/app/api/email/bulk-send/route.ts` | Opret | Send til alle Tier A/B leads med email |
| `src/app/api/email/send-followups/route.ts` | Opret | Send follow-up til leads uden åbning efter 5 dage |
| `src/app/api/email/track/open/[leadId]/route.ts` | Opret | Tracking pixel — logger åbning |
| `src/app/api/email/track/click/[leadId]/route.ts` | Opret | Logger klik, redirecter |
| `src/components/EmailPanel.tsx` | Opret | Email-sektion i side-panelet |
| `src/components/EmailPreviewModal.tsx` | Opret | Preview + bekræft-modal |
| `src/components/BulkEmailPanel.tsx` | Opret | Bulk-send + follow-up panel på dashboard |
| `src/components/LeadTable.tsx` | Modificer | Tilføj EmailPanel i side-panelet |
| `src/app/page.tsx` | Modificer | Tilføj BulkEmailPanel |

---

## Task 1: Udvid lead-queries i apify.ts

**Filer:**
- Modificer: `src/lib/apify.ts`

- [ ] **Step 1: Erstat DEFAULT_QUERIES med dynamisk BRANCHES + CITIES**

Åbn `src/lib/apify.ts` og erstat linjerne 16–27 (DEFAULT_QUERIES-konstanten) med:

```ts
export const BRANCHES = [
  // Håndværk
  "tømrer", "maler", "elektriker", "VVS-installatør", "blikkenslager", "tagdækker", "murermester",
  // Service
  "rengøringsvirksomhed", "vinduespudser", "anlægsgartner",
  // Professionelle
  "advokat", "revisor", "fysioterapeut", "tandlæge", "optiker",
  // Mad & oplevelse
  "restaurant", "café", "fotograf",
  // Skønhed
  "frisørsalon",
];

export const CITIES = [
  "Herning", "Ikast", "Silkeborg", "Viborg", "Holstebro",
  "Ringkøbing", "Struer", "Skive", "Lemvig", "Horsens",
];

export function buildQueries(branches = BRANCHES, cities = CITIES): string[] {
  return branches.flatMap((b) => cities.map((c) => `${b} ${c}`));
}
```

- [ ] **Step 2: Opdater runScraper til at bruge buildQueries som default**

Find linjen `export async function runScraper(queries = DEFAULT_QUERIES)` og erstat med:

```ts
export async function runScraper(queries = buildQueries()): Promise<ApifyPlace[]> {
```

- [ ] **Step 3: Verificer at filen kompilerer**

```bash
cd C:\Users\Buur\Documents\Workflows\lead-system
npx tsc --noEmit
```

Forventet output: ingen fejl

- [ ] **Step 4: Commit**

```bash
git add src/lib/apify.ts
git commit -m "feat: expand lead queries to hele Midtjylland + alle servicebrancher"
```

---

## Task 2: Udvid Lead-type og sheets.ts med email-tracking-kolonner

**Filer:**
- Modificer: `src/lib/sheets.ts`

- [ ] **Step 1: Tilføj email-felter til Lead interface**

Find `export interface Lead {` og tilføj disse 5 felter efter `email: string;`:

```ts
  emailSentAt: string;       // kolonne O
  emailOpenedAt: string;     // kolonne P
  emailClickedAt: string;    // kolonne Q
  emailStatus: string;       // kolonne R: "" | "sent" | "opened" | "clicked" | "replied"
  followupSentAt: string;    // kolonne S
```

- [ ] **Step 2: Opdater LEADS_RANGE og getLeads()**

Erstat:
```ts
const LEADS_RANGE = "Leads!A2:N";
```
Med:
```ts
const LEADS_RANGE = "Leads!A2:S";
```

Tilføj disse 5 linjer i `getLeads()` mapping-objektet efter `email: row[13] ?? "",`:
```ts
    emailSentAt:    row[14] ?? "",
    emailOpenedAt:  row[15] ?? "",
    emailClickedAt: row[16] ?? "",
    emailStatus:    row[17] ?? "",
    followupSentAt: row[18] ?? "",
```

- [ ] **Step 3: Tilføj updateLeadEmailStatus-funktion**

Tilføj dette nederst i `src/lib/sheets.ts`:

```ts
export async function updateLeadEmailStatus(
  rowIndex: number,
  fields: {
    emailSentAt?: string;
    emailOpenedAt?: string;
    emailClickedAt?: string;
    emailStatus?: string;
    followupSentAt?: string;
  }
): Promise<void> {
  const sheets = getSheetsClient();
  const row = rowIndex + 2;
  const data: { range: string; values: string[][] }[] = [];
  if (fields.emailSentAt    !== undefined) data.push({ range: `Leads!O${row}`, values: [[fields.emailSentAt]] });
  if (fields.emailOpenedAt  !== undefined) data.push({ range: `Leads!P${row}`, values: [[fields.emailOpenedAt]] });
  if (fields.emailClickedAt !== undefined) data.push({ range: `Leads!Q${row}`, values: [[fields.emailClickedAt]] });
  if (fields.emailStatus    !== undefined) data.push({ range: `Leads!R${row}`, values: [[fields.emailStatus]] });
  if (fields.followupSentAt !== undefined) data.push({ range: `Leads!S${row}`, values: [[fields.followupSentAt]] });
  if (data.length === 0) return;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: { valueInputOption: "RAW", data },
  });
}
```

- [ ] **Step 4: Verificer at filen kompilerer**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/sheets.ts
git commit -m "feat: add email tracking columns O-S to Lead type and sheets"
```

---

## Task 3: Installer nodemailer

**Filer:**
- Modificer: `package.json`

- [ ] **Step 1: Installer nodemailer + types**

```bash
cd C:\Users\Buur\Documents\Workflows\lead-system
npm install nodemailer
npm install --save-dev @types/nodemailer
```

- [ ] **Step 2: Tilføj env vars til .env.local**

Åbn `.env.local` og tilføj:
```
GMAIL_USER=buur.aigro@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
APP_URL=http://localhost:3000
```

> **Vigtigt:** GMAIL_APP_PASSWORD er IKKE din normale Gmail-adgangskode. Gå til:
> myaccount.google.com → Security → 2-Step Verification → App passwords
> Vælg "Mail" + "Windows Computer" → kopiér det genererede password

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: install nodemailer for email sending"
```

---

## Task 4: Opret src/lib/email.ts — skabeloner + Nodemailer

**Filer:**
- Opret: `src/lib/email.ts`

- [ ] **Step 1: Opret filen med komplet indhold**

Opret `src/lib/email.ts`:

```ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// Mapping: branch-keyword → skabelon-gruppe
const BRANCH_GROUP_MAP: Record<string, string> = {
  tømrer: "craft", maler: "craft", elektriker: "craft",
  "vvs-installatør": "craft", blikkenslager: "craft",
  tagdækker: "craft", murermester: "craft",
  rengøringsvirksomhed: "service", vinduespudser: "service", anlægsgartner: "service",
  advokat: "professional", revisor: "professional",
  fysioterapeut: "professional", tandlæge: "professional", optiker: "professional",
  restaurant: "food", café: "food", fotograf: "food",
  frisørsalon: "beauty",
};

function getBranchGroup(branch: string): string {
  const normalized = branch.toLowerCase().trim();
  for (const [key, group] of Object.entries(BRANCH_GROUP_MAP)) {
    if (normalized.includes(key)) return group;
  }
  return "craft"; // fallback
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface TemplateVars {
  name: string;
  branch: string;
  city: string;
  trackingPixelUrl: string;
  trackedReplyUrl: string;
}

function buildHtml(body: string, trackingPixelUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
<br><br>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" />
</body></html>`;
}

const TEMPLATES: Record<string, Record<"cold" | "followup", (v: TemplateVars) => EmailTemplate>> = {
  craft: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nMit navn er Lucas, og jeg arbejder som webdesigner med fokus på lokale ${v.branch}-firmaer i ${v.city}-området.\n\nJeg har lavet en gratis demo-hjemmeside specielt til dig — du kan se den uden at binde dig til noget som helst.\n\nSynes du det lyder interessant, så svar bare på denne mail.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Mit navn er Lucas, og jeg arbejder som webdesigner med fokus på lokale <strong>${v.branch}</strong>-firmaer i ${v.city}-området.</p>
<p>Jeg har lavet en gratis demo-hjemmeside specielt til dig — du kan se den uden at binde dig til noget som helst.</p>
<p>Synes du det lyder interessant, så svar bare på denne mail.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nJeg vil bare følge op på min mail fra forrige uge om den gratis demo-hjemmeside til ${v.branch}-firmaer i ${v.city}.\n\nDen er stadig klar — helt uforpligtende. Svar gerne hvis du er nysgerrig.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg vil bare følge op på min mail fra forrige uge om den gratis demo-hjemmeside til <strong>${v.branch}</strong>-firmaer i ${v.city}.</p>
<p>Den er stadig klar — helt uforpligtende. Svar gerne hvis du er nysgerrig.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  service: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og er webdesigner. Jeg har lavet en gratis demo-hjemmeside til ${v.branch}-virksomheder i ${v.city} — du kan se den uden at forpligte dig til noget.\n\nInteresseret? Svar på denne mail.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og er webdesigner. Jeg har lavet en gratis demo-hjemmeside til <strong>${v.branch}</strong>-virksomheder i ${v.city} — du kan se den uden at forpligte dig til noget.</p>
<p>Interesseret? Svar på denne mail.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nBare en hurtig opfølgning — demo-hjemmesiden til din virksomhed i ${v.city} er stadig klar. Gratis og uforpligtende.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Bare en hurtig opfølgning — demo-hjemmesiden til din virksomhed i ${v.city} er stadig klar. Gratis og uforpligtende.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  professional: {
    cold: (v) => ({
      subject: `Digital tilstedeværelse til ${v.name}`,
      text: `Hej ${v.name},\n\nMit navn er Lucas, og jeg er webdesigner. Jeg har udarbejdet en gratis demo-hjemmeside specifikt til ${v.branch} i ${v.city}-området.\n\nDer er ingen forpligtelse — jeg sender den gerne til dig så du kan se hvad jeg mener.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Mit navn er Lucas, og jeg er webdesigner. Jeg har udarbejdet en gratis demo-hjemmeside specifikt til <strong>${v.branch}</strong> i ${v.city}-området.</p>
<p>Der er ingen forpligtelse — jeg sender den gerne til dig så du kan se hvad jeg mener.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Demo-hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name},\n\nOpfølgning på min mail fra forrige uge. Demo-hjemmesiden er klar og du er stadig velkommen til at se den gratis.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Opfølgning på min mail fra forrige uge. Demo-hjemmesiden er klar og du er stadig velkommen til at se den gratis.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  food: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name} 🍽️`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og laver hjemmesider til lokale spisesteder og kafeer i ${v.city}. Jeg har lavet en gratis demo specielt til jer — I kan se den uden at binde jer til noget.\n\nInteresseret? Skriv endelig!\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og laver hjemmesider til lokale <strong>${v.branch}</strong> i ${v.city}. Jeg har lavet en gratis demo specielt til jer — I kan se den uden at binde jer til noget.</p>
<p>Interesseret? Skriv endelig!</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen!\n\nFølger lige op på min mail fra sidst om den gratis demo til ${v.name} i ${v.city}. Den er stadig klar hvis I vil se den.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen!</p>
<p>Følger lige op på min mail fra sidst om den gratis demo til <strong>${v.name}</strong> i ${v.city}. Den er stadig klar hvis I vil se den.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },

  beauty: {
    cold: (v) => ({
      subject: `Gratis hjemmeside til ${v.name}?`,
      text: `Hej ${v.name},\n\nJeg hedder Lucas og laver hjemmesider til frisørsaloner i ${v.city}. Jeg har lavet en gratis demo til jer — I kan se den uden at binde jer til noget overhovedet.\n\nSvar bare på mailen hvis I er nysgerrige!\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Jeg hedder Lucas og laver hjemmesider til frisørsaloner i ${v.city}. Jeg har lavet en gratis demo til jer — I kan se den uden at binde jer til noget overhovedet.</p>
<p>Svar bare på mailen hvis I er nysgerrige!</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
    followup: (v) => ({
      subject: `Re: Gratis hjemmeside til ${v.name}`,
      text: `Hej igen ${v.name}!\n\nFølger op på min mail om den gratis demo-hjemmeside. Den venter stadig på jer hvis I vil se den.\n\nVenlig hilsen\nLucas`,
      html: buildHtml(`
<p>Hej igen ${v.name}!</p>
<p>Følger op på min mail om den gratis demo-hjemmeside. Den venter stadig på jer hvis I vil se den.</p>
<p>Venlig hilsen<br>Lucas</p>`, v.trackingPixelUrl),
    }),
  },
};

export function buildTrackingPixelUrl(leadId: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/track/open/${leadId}`;
}

export function buildTrackedClickUrl(leadId: string, destination: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/email/track/click/${leadId}?url=${encodeURIComponent(destination)}`;
}

export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "trackingPixelUrl" | "trackedReplyUrl"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  const trackedReplyUrl = buildTrackedClickUrl(vars.leadId, `mailto:${process.env.GMAIL_USER}`);
  return template({ ...vars, trackingPixelUrl, trackedReplyUrl });
}

export async function sendLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; email: string },
  type: "cold" | "followup"
): Promise<void> {
  const template = getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
  });
  await transporter.sendMail({
    from: `Lucas <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
  });
}

export function previewEmailTemplate(
  lead: { id: string; name: string; branch: string; city: string },
  type: "cold" | "followup"
): EmailTemplate {
  return getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
  });
}
```

- [ ] **Step 2: Verificer at filen kompilerer**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/email.ts
git commit -m "feat: add email lib with branch templates, Nodemailer, tracking URLs"
```

---

## Task 5: Opret /api/leads/[id]/send-email route

**Filer:**
- Opret: `src/app/api/leads/[id]/send-email/route.ts`

- [ ] **Step 1: Opret filen**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { type = "cold" } = await req.json().catch(() => ({}));
    const leads = await getLeads();
    const rowIndex = parseInt(params.id) - 2;
    const lead = leads[rowIndex];

    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.email) return NextResponse.json({ error: "Lead has no email" }, { status: 400 });

    await sendLeadEmail(lead, type as "cold" | "followup");

    const now = new Date().toISOString();
    const isFollowup = type === "followup";
    await updateLeadEmailStatus(rowIndex, {
      ...(isFollowup ? { followupSentAt: now } : { emailSentAt: now }),
      emailStatus: isFollowup ? lead.emailStatus || "sent" : "sent",
    });

    return NextResponse.json({ ok: true, sentAt: now });
  } catch (err) {
    console.error("send-email error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Test manuelt — send en mail til dig selv**

Start dev-serveren (`npm run dev`) og kør i en ny terminal:

```bash
curl -X POST http://localhost:3000/api/leads/2/send-email \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"cold\"}"
```

Forventet: `{"ok":true,"sentAt":"..."}` og en mail i buur.aigro@gmail.com inbox.
(Erstat `2` med et lead-ID der har en email-adresse)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/leads/
git commit -m "feat: add send-email API route"
```

---

## Task 6: Opret tracking-endpoints

**Filer:**
- Opret: `src/app/api/email/track/open/[leadId]/route.ts`
- Opret: `src/app/api/email/track/click/[leadId]/route.ts`

- [ ] **Step 1: Opret tracking/open endpoint**

Opret `src/app/api/email/track/open/[leadId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

// 1x1 transparent PNG
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const rowIndex = parseInt(params.leadId) - 2;
    if (!isNaN(rowIndex) && rowIndex >= 0) {
      const leads = await getLeads();
      const lead = leads[rowIndex];
      // Only log first open
      if (lead && !lead.emailOpenedAt) {
        await updateLeadEmailStatus(rowIndex, {
          emailOpenedAt: new Date().toISOString(),
          emailStatus: "opened",
        });
      }
    }
  } catch {
    // Silently fail — never break email rendering
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}
```

- [ ] **Step 2: Opret tracking/click endpoint**

Opret `src/app/api/email/track/click/[leadId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

export async function GET(
  req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  const url = req.nextUrl.searchParams.get("url") ?? "/";
  try {
    const rowIndex = parseInt(params.leadId) - 2;
    if (!isNaN(rowIndex) && rowIndex >= 0) {
      const leads = await getLeads();
      const lead = leads[rowIndex];
      if (lead && !lead.emailClickedAt) {
        await updateLeadEmailStatus(rowIndex, {
          emailClickedAt: new Date().toISOString(),
          emailStatus: "clicked",
        });
      }
    }
  } catch {
    // Silently fail
  }
  return NextResponse.redirect(url);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/
git commit -m "feat: add email tracking pixel + click-redirect endpoints"
```

---

## Task 7: Opret /api/email/bulk-send route

**Filer:**
- Opret: `src/app/api/email/bulk-send/route.ts`

- [ ] **Step 1: Opret filen**

```ts
import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

function getTier(score: number) {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) =>
      lead.email &&
      !lead.emailSentAt &&
      (getTier(lead.score) === "A" || getTier(lead.score) === "B") &&
      lead.status !== "skip" &&
      lead.status !== "client"
    );

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      results.push({ name: lead.name, email: lead.email, ok: true });
      // Small delay to avoid Gmail rate limiting
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ sent, failed, results });
}

export async function GET() {
  const leads = await getLeads();
  const count = leads.filter(
    (l) =>
      l.email &&
      !l.emailSentAt &&
      (getTier(l.score) === "A" || getTier(l.score) === "B") &&
      l.status !== "skip" &&
      l.status !== "client"
  ).length;
  return NextResponse.json({ count });
}

function getTier(score: number) {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}
```

> **Note:** `getTier` er defineret to gange — fjern én. Korrekt version:

```ts
import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

function getTier(score: number): "A" | "B" | "C" {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

export async function GET() {
  const leads = await getLeads();
  const count = leads.filter(
    (l) =>
      l.email &&
      !l.emailSentAt &&
      (getTier(l.score) === "A" || getTier(l.score) === "B") &&
      l.status !== "skip" &&
      l.status !== "client"
  ).length;
  return NextResponse.json({ count });
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) =>
      lead.email &&
      !lead.emailSentAt &&
      (getTier(lead.score) === "A" || getTier(lead.score) === "B") &&
      lead.status !== "skip" &&
      lead.status !== "client"
    );

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      results.push({ name: lead.name, email: lead.email, ok: true });
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  return NextResponse.json({ sent, failed, results });
}
```

- [ ] **Step 2: Verificer kompilering**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/email/bulk-send/
git commit -m "feat: add bulk-send API route for Tier A/B leads"
```

---

## Task 8: Opret /api/email/send-followups route

**Filer:**
- Opret: `src/app/api/email/send-followups/route.ts`

- [ ] **Step 1: Opret filen**

```ts
import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

const FOLLOWUP_DAYS = 5;

function isReadyForFollowup(lead: {
  email: string;
  emailSentAt: string;
  emailOpenedAt: string;
  followupSentAt: string;
  status: string;
}): boolean {
  if (!lead.email) return false;
  if (!lead.emailSentAt) return false;
  if (lead.emailOpenedAt) return false; // already opened, skip
  if (lead.followupSentAt) return false; // already followed up
  if (lead.status === "skip" || lead.status === "client") return false;

  const sentDate = new Date(lead.emailSentAt);
  const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= FOLLOWUP_DAYS;
}

export async function GET() {
  const leads = await getLeads();
  const count = leads.filter((l) => isReadyForFollowup(l)).length;
  return NextResponse.json({ count });
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isReadyForFollowup(lead));

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "followup");
      await updateLeadEmailStatus(rowIndex, {
        followupSentAt: new Date().toISOString(),
      });
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

- [ ] **Step 2: Commit**

```bash
git add src/app/api/email/send-followups/
git commit -m "feat: add send-followups API route (5 day delay, no-open filter)"
```

---

## Task 9: Opret EmailPanel.tsx komponent

**Filer:**
- Opret: `src/components/EmailPanel.tsx`

- [ ] **Step 1: Opret filen**

```tsx
"use client";
import { useState } from "react";
import { Mail, Send, Eye } from "lucide-react";
import type { Lead } from "@/lib/sheets";
import EmailPreviewModal from "./EmailPreviewModal";

const EMAIL_STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "":        { label: "Ikke sendt",      color: "#64748b", bg: "#f1f5f9" },
  sent:      { label: "Sendt",           color: "#b45309", bg: "#fef3c7" },
  opened:    { label: "Åbnet ✓",         color: "#15803d", bg: "#dcfce7" },
  clicked:   { label: "Klikket ✓✓",      color: "#14532d", bg: "#bbf7d0" },
  replied:   { label: "Svarede! 🎉",     color: "#14532d", bg: "#bbf7d0" },
};

export default function EmailPanel({ lead, onUpdate }: { lead: Lead; onUpdate: (updated: Partial<Lead>) => void }) {
  const [sending, setSending] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewType, setPreviewType] = useState<"cold" | "followup">("cold");

  if (!lead.email) return null;

  const status = EMAIL_STATUS_LABELS[lead.emailStatus] ?? EMAIL_STATUS_LABELS[""];
  const hasFollowup = !!lead.followupSentAt;
  const canSendFollowup = !!lead.emailSentAt && !lead.emailOpenedAt && !hasFollowup;

  async function send(type: "cold" | "followup") {
    setSending(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.ok) {
        const now = new Date().toISOString();
        onUpdate(type === "cold"
          ? { emailSentAt: now, emailStatus: "sent" }
          : { followupSentAt: now }
        );
      } else {
        alert(`Fejl: ${data.error}`);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Mail size={13} color="var(--text-dim)" />
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Email
        </span>
      </div>

      <div style={{ fontSize: 13, color: "var(--text)", marginBottom: 8, wordBreak: "break-all" }}>
        {lead.email}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{
          background: status.bg, color: status.color,
          borderRadius: 4, padding: "2px 7px", fontSize: 11, fontWeight: 600,
        }}>
          {status.label}
        </span>
        {lead.emailSentAt && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {new Date(lead.emailSentAt).toLocaleDateString("da-DK")}
          </span>
        )}
        {hasFollowup && (
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>· Follow-up sendt</span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {!lead.emailSentAt && (
          <>
            <button
              onClick={() => send("cold")}
              disabled={sending}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "#4f46e5", color: "#fff",
                border: "none", borderRadius: 6, padding: "6px 12px",
                fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sending ? 0.6 : 1,
              }}
            >
              <Send size={12} />
              {sending ? "Sender..." : "Send mail"}
            </button>
            <button
              onClick={() => { setPreviewType("cold"); setShowPreview(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                background: "transparent", color: "var(--text-muted)",
                border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px",
                fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}
            >
              <Eye size={12} />
              Preview
            </button>
          </>
        )}
        {canSendFollowup && (
          <button
            onClick={() => send("followup")}
            disabled={sending}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", color: "#b45309",
              border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sending ? 0.6 : 1,
            }}
          >
            <Send size={12} />
            {sending ? "Sender..." : "Send follow-up"}
          </button>
        )}
        {lead.emailStatus === "replied" ? null : lead.emailSentAt && (
          <button
            onClick={() => onUpdate({ emailStatus: "replied" })}
            style={{
              background: "transparent", color: "#15803d",
              border: "1px solid #86efac", borderRadius: 6, padding: "6px 12px",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            Marker som svarede
          </button>
        )}
      </div>

      {showPreview && (
        <EmailPreviewModal
          lead={lead}
          type={previewType}
          onClose={() => setShowPreview(false)}
          onSend={() => { setShowPreview(false); send(previewType); }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/EmailPanel.tsx
git commit -m "feat: add EmailPanel component with send/followup/preview/replied actions"
```

---

## Task 10: Opret EmailPreviewModal.tsx

**Filer:**
- Opret: `src/components/EmailPreviewModal.tsx`

- [ ] **Step 1: Opret filen**

```tsx
"use client";
import { useEffect, useState } from "react";
import { X, Send } from "lucide-react";
import type { Lead } from "@/lib/sheets";

interface Template { subject: string; text: string; html: string; }

export default function EmailPreviewModal({
  lead,
  type,
  onClose,
  onSend,
}: {
  lead: Lead;
  type: "cold" | "followup";
  onClose: () => void;
  onSend: () => void;
}) {
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Build preview client-side via dedicated endpoint
    fetch(`/api/leads/${lead.id}/email-preview?type=${type}`)
      .then((r) => r.json())
      .then((data) => { setTemplate(data); setLoading(false); });
  }, [lead.id, type]);

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--surface)", borderRadius: 12, padding: 24,
        width: "min(560px, 95vw)", maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>
            {type === "cold" ? "Kold mail" : "Follow-up"} — preview
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <p style={{ color: "var(--text-dim)", fontSize: 13 }}>Henter preview...</p>
        ) : template ? (
          <>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Til</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 500 }}>{lead.email}</p>
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Emne</span>
              <p style={{ margin: "4px 0 0", fontSize: 13, fontWeight: 600 }}>{template.subject}</p>
            </div>
            <div style={{ marginBottom: 20 }}>
              <span style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Besked</span>
              <div style={{
                margin: "8px 0 0", background: "var(--surface-raised, #f8fafc)",
                border: "1px solid var(--border)", borderRadius: 8,
                padding: 14, fontSize: 13, lineHeight: 1.7,
              }}
                dangerouslySetInnerHTML={{ __html: template.html }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={onClose} style={{
                background: "transparent", border: "1px solid var(--border)",
                borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer",
              }}>
                Annuller
              </button>
              <button onClick={onSend} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: "#4f46e5", color: "#fff",
                border: "none", borderRadius: 8, padding: "8px 18px",
                fontSize: 13, fontWeight: 600, cursor: "pointer",
              }}>
                <Send size={13} />
                Send mail
              </button>
            </div>
          </>
        ) : (
          <p style={{ color: "#dc2626", fontSize: 13 }}>Kunne ikke hente preview.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Opret /api/leads/[id]/email-preview route**

Opret `src/app/api/leads/[id]/email-preview/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { previewEmailTemplate } from "@/lib/email";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const type = (req.nextUrl.searchParams.get("type") ?? "cold") as "cold" | "followup";
  const leads = await getLeads();
  const rowIndex = parseInt(params.id) - 2;
  const lead = leads[rowIndex];
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const template = previewEmailTemplate(lead, type);
  return NextResponse.json(template);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/EmailPreviewModal.tsx src/app/api/leads/
git commit -m "feat: add EmailPreviewModal + email-preview API endpoint"
```

---

## Task 11: Opret BulkEmailPanel.tsx

**Filer:**
- Opret: `src/components/BulkEmailPanel.tsx`

- [ ] **Step 1: Opret filen**

```tsx
"use client";
import { useState, useEffect } from "react";
import { Send, RefreshCw } from "lucide-react";

export default function BulkEmailPanel() {
  const [bulkCount, setBulkCount] = useState<number | null>(null);
  const [followupCount, setFollowupCount] = useState<number | null>(null);
  const [sendingBulk, setSendingBulk] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => { fetchCounts(); }, []);

  async function fetchCounts() {
    const [b, f] = await Promise.all([
      fetch("/api/email/bulk-send").then((r) => r.json()),
      fetch("/api/email/send-followups").then((r) => r.json()),
    ]);
    setBulkCount(b.count ?? 0);
    setFollowupCount(f.count ?? 0);
  }

  async function runBulkSend() {
    if (!confirm(`Send kold mail til ${bulkCount} leads? Dette kan ikke fortrydes.`)) return;
    setSendingBulk(true);
    setLastResult(null);
    const res = await fetch("/api/email/bulk-send", { method: "POST" });
    const data = await res.json();
    setLastResult(`Sendt: ${data.sent} ✓  Fejlede: ${data.failed}`);
    setSendingBulk(false);
    fetchCounts();
  }

  async function runFollowups() {
    if (!confirm(`Send follow-up til ${followupCount} leads?`)) return;
    setSendingFollowup(true);
    setLastResult(null);
    const res = await fetch("/api/email/send-followups", { method: "POST" });
    const data = await res.json();
    setLastResult(`Follow-ups sendt: ${data.sent} ✓  Fejlede: ${data.failed}`);
    setSendingFollowup(false);
    fetchCounts();
  }

  if (bulkCount === 0 && followupCount === 0) return null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 18px", display: "flex",
      alignItems: "center", gap: 16, flexWrap: "wrap",
    }}>
      {(bulkCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{bulkCount}</strong> leads klar til kold mail (Tier A/B)
          </span>
          <button
            onClick={runBulkSend}
            disabled={sendingBulk}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "#4f46e5", color: "#fff",
              border: "none", borderRadius: 6, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sendingBulk ? 0.6 : 1,
            }}
          >
            {sendingBulk ? <RefreshCw size={11} className="animate-spin" /> : <Send size={11} />}
            {sendingBulk ? "Sender..." : "Send til alle"}
          </button>
        </div>
      )}

      {(followupCount ?? 0) > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>{followupCount}</strong> klar til follow-up
          </span>
          <button
            onClick={runFollowups}
            disabled={sendingFollowup}
            style={{
              display: "flex", alignItems: "center", gap: 5,
              background: "transparent", color: "#b45309",
              border: "1px solid #fbbf24", borderRadius: 6, padding: "6px 12px",
              fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: sendingFollowup ? 0.6 : 1,
            }}
          >
            {sendingFollowup ? <RefreshCw size={11} /> : <Send size={11} />}
            {sendingFollowup ? "Sender..." : "Send follow-ups"}
          </button>
        </div>
      )}

      {lastResult && (
        <span style={{ fontSize: 12, color: "#15803d", fontWeight: 500 }}>{lastResult}</span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/BulkEmailPanel.tsx
git commit -m "feat: add BulkEmailPanel with bulk-send + follow-up triggers"
```

---

## Task 12: Wire EmailPanel ind i LeadTable og BulkEmailPanel ind i dashboard

**Filer:**
- Modificer: `src/components/LeadTable.tsx`
- Modificer: `src/app/page.tsx`

- [ ] **Step 1: Tilføj EmailPanel import i LeadTable.tsx**

Øverst i `src/components/LeadTable.tsx`, tilføj import:

```ts
import EmailPanel from "./EmailPanel";
```

- [ ] **Step 2: Find side-panelet i LeadTable og tilføj EmailPanel**

Find stedet i `LeadTable.tsx` hvor notes-feltet vises (søg efter `notes` textarea). Tilføj `<EmailPanel>` lige OVER notes-sektionen:

```tsx
<EmailPanel
  lead={selected}
  onUpdate={(updated) => {
    setSelected((prev) => prev ? { ...prev, ...updated } : prev);
    setLeads((prev) =>
      prev.map((l) => (l.id === selected.id ? { ...l, ...updated } : l))
    );
  }}
/>
```

- [ ] **Step 3: Tilføj BulkEmailPanel i src/app/page.tsx**

Åbn `src/app/page.tsx`. Find hvor `<ScrapeButton>` og `<VerifyAllButton>` importeres og tilføj:

```ts
import BulkEmailPanel from "@/components/BulkEmailPanel";
```

Find JSX-sektionen med disse knapper og tilføj `<BulkEmailPanel />` under dem:

```tsx
<BulkEmailPanel />
```

- [ ] **Step 4: Verificer at det bygger**

```bash
npx tsc --noEmit
npm run build
```

Forventet: ingen TypeScript-fejl, build gennemføres

- [ ] **Step 5: Manuel test i browser**

Start `npm run dev`, åbn http://localhost:3000, og verificer:
- BulkEmailPanel vises øverst (hvis der er Tier A/B leads med email)
- Klik på et lead med email → Email-sektion vises i side-panelet
- Klik "Preview" → modal vises med korrekt tekst
- Klik "Send mail" → bekræft i modal → mail sendes

- [ ] **Step 6: Final commit**

```bash
git add src/components/LeadTable.tsx src/app/page.tsx
git commit -m "feat: wire EmailPanel into LeadTable + BulkEmailPanel into dashboard"
```

---

## Verification

**End-to-end flow:**

1. Start `npm run dev`
2. Åbn http://localhost:3000
3. BulkEmailPanel vises øverst med antal leads klar
4. Klik et lead med email i side-panelet → Email-sektion vises
5. Klik "Preview" → mail-preview modal åbner med korrekt dansk tekst og branche-tone
6. Klik "Send mail" → mail ankommer i din Gmail inbox
7. Klik tracking-pixel URL direkte: `http://localhost:3000/api/email/track/open/[leadId]` → returnerer 1×1 PNG
8. Klik tracking-click URL: `http://localhost:3000/api/email/track/click/[leadId]?url=https://google.com` → redirecter til Google
9. Vent 5 dage (eller test ved at sætte emailSentAt til en dato >5 dage tilbage i Sheets) → BulkEmailPanel viser follow-up count
10. Send follow-up → ankommer i inbox
