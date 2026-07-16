# Faktura-modul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faktura-modul i lead-system: månedlige abonnements-fakturaer pr. kunde (fx VIDA 750 kr), ad-hoc fakturaer, professionel PDF, send via mail fra systemet (Lucas klikker), betalings-/forfaldstracking, cron-genererede kladder + brief-endpoint.

**Architecture:** Records i KV via eksisterende `store`-facade (`src/lib/store.ts`), PDF'er genereres on-demand med `@react-pdf/renderer` og gemmes i Blob ved send. Send sker via dedikeret API-route der genbruger `getTransporter` fra `senders.ts` med attachment (approve-queue genbruges IKKE — dens `QueueDraft` er outreach-formet). UI: sektion på `/clients/[id]` + oversigtsside `/fakturaer`. `finance.ts` røres ikke.

**Tech Stack:** Next 16 (App Router, server components), React 19, TypeScript, `@vercel/kv`+`@vercel/blob` via store-facade, nodemailer, `@react-pdf/renderer` (ny dep), node:test.

## Global Constraints

- Tests: `node --test --experimental-strip-types src/lib/**/*.test.ts` (npm test). Test-filer ligger ved siden af kilden i `src/lib/`.
- KV/Blob må ALDRIG importeres direkte i feature-kode — kun via `import { store } from "@/lib/store"` (get/put/delete/list/putAsset).
- Systemet sender ALDRIG mail uden eksplicit klik fra Lucas i UI. Cron laver kun kladder.
- `src/lib/finance.ts` må ikke ændres.
- Beløb internt som **øre-frie hele kroner (number)**; visning da-DK ("5.750 kr").
- Fortløbende fakturanumre uden huller: format `2026-0001`. Counter i store, read-modify-write (én bruger — acceptabelt; `// ponytail: no atomic incr via store facade, fine at 1 user`).
- Sprog i UI/PDF: dansk. CSS: eksisterende `cc-card`, `cc-btn`, `cc-btn-accent`, `cc-chip`, `cc-dim`-klasser — ingen nye designsystemer.
- Moms: `vatRate` felt fra dag 1, 0 nu. Afsender-config i store-key `settings/business` — CVR-felter betingede.
- Cron-auth: `Bearer ${process.env.CRON_SECRET}`-mønster som `src/app/api/cron/engine/route.ts`.

---

### Task 1: Datamodel + nummerserie (`src/lib/invoices.ts`)

**Files:**
- Create: `src/lib/invoices.ts`
- Test: `src/lib/invoices.test.ts`

**Interfaces (Produces):**
```ts
export interface InvoiceLine { description: string; amount: number } // hele kr
export type InvoiceStatus = "kladde" | "sendt" | "betalt" | "forfalden" | "rykket";
export interface Invoice {
  number: string;              // "2026-0003" — også store-key suffix
  clientName: string;          // stabil nøgle (Sheets row-id skifter — brug navn)
  recipient: { name: string; att?: string; address?: string; cvr?: string };
  issueDate: string;           // YYYY-MM-DD
  dueDate: string;             // issueDate + 14 dage
  lines: InvoiceLine[];
  vatRate: number;             // 0 nu
  status: InvoiceStatus;
  sentAt?: string; paidAt?: string; remindedAt?: string;
  pdfUrl?: string;
  payerType: "privat" | "cvr";
  note?: string;
}
export interface Subscription {
  clientName: string; lines: InvoiceLine[]; dayOfMonth: number; active: boolean;
}
export interface BusinessSettings {
  name: string; address: string; city: string; phone: string; email: string;
  bankReg: string; bankAccount: string; cvr?: string; payerType: "privat" | "cvr";
}
export function invoiceTotal(inv: Pick<Invoice, "lines" | "vatRate">): { subtotal: number; vat: number; total: number }
export function nextDueDate(sub: Subscription, today: string): string   // næste YYYY-MM-DD hvor dayOfMonth rammes
export function addDays(date: string, days: number): string
export async function nextInvoiceNumber(today: string): Promise<string>  // store-key "invoice-counter/<år>"
export async function saveInvoice(inv: Invoice): Promise<void>           // store-key `invoice/${inv.number}`
export async function getInvoice(number: string): Promise<Invoice | null>
export async function listInvoices(): Promise<Invoice[]>                 // store.list("invoice/"), sorteret nyeste først
export async function listInvoicesFor(clientName: string): Promise<Invoice[]>
export async function getSubscriptions(): Promise<Subscription[]>        // store-key "invoice-subscriptions" (én liste)
export async function saveSubscriptions(subs: Subscription[]): Promise<void>
export async function getBusinessSettings(): Promise<BusinessSettings>   // store-key "settings/business", med default (Lucas' data fra eksisterende faktura: Flaskagervej 5, 7430 Ikast, reg 2570, konto 5498102702, tlf +45 23 24 24 82, buur.aigro@gmail.com, payerType "privat")
```

- [ ] **Step 1: Skriv failing tests** for de rene funktioner (`invoiceTotal` med vatRate 0 og 25, `nextDueDate` før/efter dayOfMonth + månedsskift, `addDays` over månedsgrænse). Testene importerer fra `./invoices.ts`. Ingen store-mock nødvendig for rene funktioner.
- [ ] **Step 2:** `npm test` → FAIL (module not found).
- [ ] **Step 3:** Implementér `src/lib/invoices.ts`. Rene funktioner øverst (dato-matematik med `Date.UTC`, aldrig lokal tid); store-funktionerne nederst efter mønsteret i `src/lib/queue.ts` (import { store }). `nextInvoiceNumber`: læs `invoice-counter/<år>` (number, default 0), +1, skriv tilbage, returnér `${år}-${String(n).padStart(4, "0")}`.
- [ ] **Step 4:** `npm test` → PASS. `npm run typecheck` → clean.
- [ ] **Step 5:** Commit `feat(invoices): datamodel, nummerserie og totals`

### Task 2: PDF-generering (`@react-pdf/renderer`)

**Files:**
- Create: `src/lib/invoice-pdf.tsx`
- Create: `src/app/api/invoices/[number]/pdf/route.ts`
- Modify: `package.json` (dep `@react-pdf/renderer`)

**Interfaces:**
- Consumes: `Invoice`, `BusinessSettings`, `invoiceTotal`, `getInvoice`, `getBusinessSettings` (Task 1)
- Produces: `export async function renderInvoicePdf(inv: Invoice, biz: BusinessSettings): Promise<Buffer>`

- [ ] **Step 1:** `npm i @react-pdf/renderer`
- [ ] **Step 2:** `src/lib/invoice-pdf.tsx`: `<Document><Page size="A4">` med sektioner: (1) header "FAKTURA" + nummer + udstedelses-/forfaldsdato, (2) to kolonner "Faktura til" (recipient) / "Fra" (biz — vis `CVR: ...` KUN hvis `biz.cvr`, ellers linjen "Privatperson · uden CVR"), (3) linjetabel beskrivelse/beløb, (4) subtotal + moms-linje KUN hvis vatRate>0 + total, (5) betalingsboks: "Bankoverførsel · Reg. {bankReg} · Konto {bankAccount} · Betales senest {dueDate}", (6) note-boks når payerType=privat: "Beløbet indberettes af {biz.name} som personlig indkomst (B-indkomst) — ingen moms opkrævet, jf. SKAT's regler for privatpersoner under 50.000 kr/år i salgsindkomst.", (7) footer "På forhånd tak · {biz.name} · {biz.phone}". Typografi: Helvetica, 10pt brød, 20pt titel, diskret grå linjer — professionelt, ikke ASCII. `renderInvoicePdf` bruger `renderToBuffer`.
- [ ] **Step 3:** Route `GET /api/invoices/[number]/pdf`: hent invoice (404 hvis mangler), render, returnér `new NextResponse(buf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": \`inline; filename="faktura-${number}.pdf"\` } })`. `export const dynamic = "force-dynamic"`.
- [ ] **Step 4 (verify):** `npm run dev`, opret test-faktura via node-repl mod store (eller vent til Task 4-UI) — minimum: `npm run build` grøn + typecheck clean. Visuel verifikation sker i Task 4.
- [ ] **Step 5:** Commit `feat(invoices): PDF-generering med react-pdf`

### Task 3: Send-route med attachment + statusskift

**Files:**
- Create: `src/app/api/invoices/[number]/send/route.ts`
- Create: `src/app/api/invoices/[number]/status/route.ts`

**Interfaces:**
- Consumes: `getInvoice`, `saveInvoice`, `renderInvoicePdf`, `getBusinessSettings`; `getTransporter("lucas")`, `formatFrom("lucas")` fra `src/lib/senders.ts`; `store.putAsset` til PDF-arkivering.
- Produces: `POST /api/invoices/:number/send` body `{ to: string, subject?: string, body?: string }`; `POST /api/invoices/:number/status` body `{ status: InvoiceStatus }`.

- [ ] **Step 1:** Send-route: kun `status === "kladde" || "sendt"` (gen-send tilladt). Render PDF-buffer → `store.putAsset(\`invoices/faktura-${number}.pdf\`, buf, "application/pdf")` → gem `pdfUrl`. Default subject `Faktura ${number} — ${biz.name}`, default body kort venlig dansk tekst (Lucas-tone, se wiki [[brand-og-tone]]: varm, kort, "sig endelig til hvis noget driller"). Send: `transporter.sendMail({ from: formatFrom("lucas"), to, subject, text: body, attachments: [{ filename: \`faktura-${number}.pdf\`, content: buf }] })`. Ved succes: `status: "sendt", sentAt: nu, dueDate` genberegnes IKKE (sat ved oprettelse). Fejl → 500 med fejltekst, status uændret.
- [ ] **Step 2:** Status-route: valider status mod union, sæt `paidAt`/`remindedAt` timestamps ved "betalt"/"rykket". 
- [ ] **Step 3:** `npm run typecheck` + build grøn.
- [ ] **Step 4:** Commit `feat(invoices): send-route med PDF-attachment + status-API`

### Task 4: UI — kundesektion + oversigtsside + ny-faktura-form

**Files:**
- Create: `src/app/fakturaer/page.tsx` (server component, lister alle + subscriptions med nextDue)
- Create: `src/app/fakturaer/FakturaClient.tsx` ("use client": ny-faktura-form med kundedropdown fra `getClients()` ELLER fritekst-modtager, linje-editor, "Opret kladde"-knap → `POST /api/invoices`; send-knap m. bekræft-dialog → send-route; status-knapper betalt/rykket)
- Create: `src/app/api/invoices/route.ts` (`GET` liste, `POST` opret kladde: nummer fra `nextInvoiceNumber`, dueDate = issueDate+14)
- Modify: `src/app/clients/[id]/page.tsx` (ny `<Deliverable icon="Receipt" title="Fakturaer">` med `listInvoicesFor(client.name)`: nummer, total, status-chip, dage-til-forfald/"X dage forfalden", link til PDF + link til /fakturaer)
- Modify: `src/lib/nav-config.ts` (nav-punkt "Fakturaer" under økonomi-gruppen)

**Interfaces:** Consumes alt fra Task 1-3. Status-chips: kladde=grå, sendt=blå, betalt=grøn, forfalden/rykket=rød — brug `cc-chip` + inline farve som eksisterende chips.

- [ ] **Step 1:** API-route (`POST` validerer: mindst én linje, amount>0, modtagernavn). 
- [ ] **Step 2:** Oversigtsside + form. Abonnements-kort øverst: "VIDA — 750 kr/md — næste: 1. august (om 16 dage)" + "Generér nu"-knap (opretter kladde fra subscription-lines).
- [ ] **Step 3:** Klient-sektion på `/clients/[id]`.
- [ ] **Step 4 (verify, browser-loop):** `npm run dev` → opret kladde for VIDA → åbn PDF i browser → **KIG på PDF'en** (screenshot) — layout skal ligne professionel dansk faktura, ikke rå tekst. Iterér til pænt.
- [ ] **Step 5:** Commit `feat(invoices): UI — oversigt, ny-faktura, kundesektion`

### Task 5: Abonnementer + cron (kladder + forfalden-markering)

**Files:**
- Create: `src/app/api/cron/invoices/route.ts`
- Create: `src/app/api/invoices/subscriptions/route.ts` (GET/PUT subscriptions — UI-redigering fra /fakturaer)
- Modify: `vercel.json` (cron `/api/cron/invoices`, `0 5 * * *`)
- Test: udvid `src/lib/invoices.test.ts`

**Interfaces:** Produces `export function subscriptionsDue(subs: Subscription[], existing: Invoice[], today: string): Subscription[]` (ren funktion i invoices.ts: due hvis active, dayOfMonth <= dagens dag, og der IKKE allerede findes faktura for clientName i indeværende måned).

- [ ] **Step 1: Failing tests** for `subscriptionsDue` (due, allerede-faktureret denne måned, inaktiv, dayOfMonth i fremtiden) + `isOverdue(inv, today)` (sendt + dueDate passeret).
- [ ] **Step 2:** `npm test` FAIL → implementér begge i invoices.ts → PASS.
- [ ] **Step 3:** Cron-route (CRON_SECRET-auth-mønster fra engine): (a) opret kladder for `subscriptionsDue`, (b) markér sendte fakturaer med passeret dueDate som "forfalden". Returnér `{ created: [...], overdue: [...] }`.
- [ ] **Step 4:** Seed VIDA-subscription via /fakturaer-UI: lines `[{Hosting,250},{CMS-kontrolpanel,500}]`, dayOfMonth 1.
- [ ] **Step 5:** Commit `feat(invoices): abonnementer + daglig cron for kladder og forfald`

### Task 6: Brief-endpoint + backfill

**Files:**
- Create: `src/app/api/invoices/brief/route.ts` — offentlig-læsbar JSON (samme auth som øvrige API'er): `{ dueToday: [...], overdue: [{number, clientName, total, daysOverdue}], upcoming: [{clientName, nextDue}] }`. Morgen-briefen genereres i KnowledgeOS-vaulten — den henter herfra.
- Modify (vault): tilføj i vaultens brief-instruktion at hente `/api/invoices/brief` og skrive sektionen "Fakturaer" (skal sendes i dag / forfaldne / næste).

- [ ] **Step 1:** Byg route (ren aggregering over `listInvoices` + `getSubscriptions`).
- [ ] **Step 2:** Opdatér vault-brief-instruktion + notér i `wiki/os/faktura-modul-plan.md` at modulet er live.
- [ ] **Step 3: Backfill** via /fakturaer-UI: opret KUN `2026-0001` (Hjemmeside-opsætning 5.000 + Hosting juni 250 + CMS juni 500 = 5.750, issueDate 2026-06-11, status "sendt" — Lucas markerer betalt). Juli-fakturaen er IKKE sendt endnu: opret `2026-0002` (Hosting juli 250 + CMS juli 500 = 750, dags dato) som **kladde** — den bliver systemets første live send når Lucas klikker. Counter ender på 2, næste = 0003.
- [ ] **Step 4:** Commit `feat(invoices): brief-endpoint + backfill VIDA`

### Task 7: Deploy + live-verifikation

- [ ] **Step 1:** `npm run build` + `npm test` + `npm run lint` grønne. Git-tag `pre-invoice-deploy` FØR deploy.
- [ ] **Step 2:** Deploy (eksisterende Vercel-flow). Verificér live: /fakturaer renderer, PDF-route giver 200 med rigtig PDF (åbn + KIG), cron-route med Bearer-secret returnerer ok.
- [ ] **Step 3:** Testmail til Lucas' egen adresse (buur.aigro@gmail.com) med PDF-attachment — verificér i indbakken at PDF åbner og ser rigtig ud. INGEN mail til Lene før Lucas godkender.
- [ ] **Step 4:** Commit + status-note i vault `wiki/os/`.

## Self-review
- Spec-dækning: abonnement m. næste-dato ✓ (T5), ad-hoc/ny modtager ✓ (T4), send fra systemet m. klik ✓ (T3/T4), 14-dages tracking + dage-tæller ✓ (T4/T5), brief ✓ (T6), backfill ✓ (T6), CVR-fremtidssikring ✓ (betingede felter T2, settings T1), finance.ts urørt ✓.
- Kendt begrænsning: ingen transaktionsgaranti opret+PDF+send (accepteret, én bruger). Betalt = manuelt klik (aftalt).
- Åbent: er faktura 0001/0002 betalt? (afgør backfill-status — default "sendt", Lucas retter).
