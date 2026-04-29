# Design Spec: Udvidet Lead-scraping + Email-automatisering

**Dato:** 2026-04-29  
**Status:** Godkendt af bruger

---

## Kontekst

Lead-systemet finder lokale danske virksomheder uden hjemmeside, score-rangerer dem og lader Lucas ringe dem op. Næste fase:

1. **Flere leads** — udvid til hele Midtjylland og flere brancher
2. **Email-automatisering** — kold salgsmail + follow-up per lead, bulk-send for Tier A/B
3. **Tracking** — åbnet/klikket per lead i Google Sheets
4. **UI** — send-mail-knap per lead + bulk-send fra dashboard

**Mål med mailen:** "Jeg har lavet en gratis demo-hjemmeside til dig — vil du se den?" Lav tærskel, få dem til at svare.

---

## Del 1: Udvidede Leads

### Brancher (udvidede)
Ny konfiguration i `src/lib/apify.ts` erstatter hardcoded array:

```ts
const BRANCHES = [
  // Håndværk
  'tømrer', 'maler', 'elektriker', 'VVS', 'blikkenslager', 'tagdækker', 'murermester',
  // Service
  'rengøring', 'vinduespudser', 'anlægsgartner',
  // Professionelle
  'advokat', 'revisor', 'fysioterapeut', 'tandlæge',
  // Mad & oplevelse
  'restaurant', 'café', 'fotograf',
  // Frisør / velvære
  'frisør', 'frisørsalon',
]

const CITIES = [
  'Herning', 'Ikast', 'Silkeborg', 'Viborg', 'Holstebro',
  'Ringkøbing', 'Struer', 'Skive', 'Lemvig', 'Horsens',
]
```

Queries genereres som `"${branch} ${city}"` for alle kombinationer (~200 queries). Apify-actoren kører dem i batches på 10 ad gangen.

### Ændrede filer
- `src/lib/apify.ts` — BRANCHES + CITIES arrays, dynamisk query-generator

---

## Del 2: Email-infrastruktur

### Provider
**Gmail SMTP via Nodemailer** — sender fra `buur.aigro@gmail.com`. Kræver Google App Password (ikke normal adgangskode).

Setup:
1. Aktiver 2-faktor på Google-konto
2. Gå til myaccount.google.com → Security → App Passwords
3. Generer password → gem som `GMAIL_APP_PASSWORD` i `.env.local`

### Nye env vars
```
GMAIL_USER=buur.aigro@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
APP_URL=http://localhost:3000  # bruges til tracking-URLs
```

### Nye Sheets-kolonner
| Kolonne | Navn | Indhold |
|---|---|---|
| O | emailSentAt | ISO timestamp |
| P | emailOpenedAt | ISO timestamp |
| Q | emailClickedAt | ISO timestamp |
| R | emailStatus | sent / opened / clicked / replied |
| S | followupSentAt | ISO timestamp |

### Nye lib-filer
**`src/lib/email.ts`**
- `sendLeadEmail(lead, type: 'cold' | 'followup')` — sender mail via Nodemailer
- `getEmailTemplate(branch, type)` — returnerer subject + HTML per branche-gruppe
- `buildTrackingPixelUrl(leadId)` — `${APP_URL}/api/email/track/open/${leadId}`
- `buildTrackedLink(leadId, url)` — `${APP_URL}/api/email/track/click/${leadId}?url=...`

### Nye API-routes

| Route | Metode | Formål |
|---|---|---|
| `/api/leads/[id]/send-email` | POST | Send kold mail til ét lead |
| `/api/email/bulk-send` | POST | Send til alle Tier A/B med email, ikke sendt før |
| `/api/email/send-followups` | POST | Send follow-up til leads hvor sentAt > 5 dage og ingen åbning |
| `/api/email/track/open/[leadId]` | GET | Tracking-pixel (1×1 transparent PNG), logger åbning |
| `/api/email/track/click/[leadId]` | GET | Logger klik, redirecter til `?url=` param |

---

## Del 3: Email-skabeloner

Én skabelon per branche-gruppe. Alle bruger variablerne:
`{{virksomhedsnavn}}`, `{{branche}}`, `{{by}}`, `{{afsenderNavn}}`

### Branche-grupper og tone

| Gruppe | Brancher | Tone |
|---|---|---|
| Håndværk | tømrer, maler, elektriker, VVS, blikkenslager, tagdækker, murer | Direkte, praktisk |
| Service | rengøring, vinduespudser, anlægsgartner | Venlig, simpel |
| Professionelle | advokat, revisor, fysioterapeut, tandlæge | Formel, respektfuld |
| Mad & oplevelse | restaurant, café, fotograf | Varm, uformel |
| Skønhed | frisør, frisørsalon | Personlig, frisk |

### Eksempel — Håndværk, kold mail

**Emne:** Gratis hjemmeside til {{virksomhedsnavn}}?

> Hej {{virksomhedsnavn}},
>
> Mit navn er Lucas, og jeg arbejder som webdesigner med fokus på lokale {{branche}}-firmaer i {{by}}-området.
>
> Jeg har lavet en gratis demo-hjemmeside specielt til dig — du kan se den uden at binde dig til noget som helst.
>
> Synes du det lyder interessant, så svar bare på denne mail.
>
> Venlig hilsen  
> Lucas

### Eksempel — Håndværk, follow-up (dag 5)

**Emne:** Re: Gratis hjemmeside til {{virksomhedsnavn}}

> Hej igen {{virksomhedsnavn}},
>
> Bare en hurtig opfølgning på min mail fra forrige uge. Jeg har stadig den gratis demo klar — helt uforpligtende.
>
> Hører gerne fra dig.
>
> Venlig hilsen  
> Lucas

---

## Del 4: UI-ændringer

### LeadTable — Side-panel (ny "Email"-sektion)
Vises kun hvis lead har email-adresse.

```
┌─────────────────────────────────────┐
│ Email                               │
│ kontakt@virksomhed.dk               │
│                                     │
│ Status: [Åbnet ✓]                   │
│ Sendt: 24. apr 2026                 │
│                                     │
│  [Send mail]   [Preview]            │
└─────────────────────────────────────┘
```

- **Send mail** → åbner preview-modal med den færdige mail → bekræft → POST til `/api/leads/[id]/send-email`
- **Preview** → viser mail-indhold uden at sende
- Status-badge: Ikke sendt / Sendt / Åbnet / Klikket / Follow-up sendt / Svarede (manuel)

### Dashboard — Bulk-send panel
Tilføjes øverst på dashboard, ved siden af ScrapeButton:

```
┌──────────────────────────────────────────┐
│ 23 leads klar til email (Tier A/B)       │
│  [Send til alle]   [Preview liste]       │
│                                          │
│ 4 klar til follow-up (sendt > 5 dage)   │
│  [Send follow-ups]                       │
└──────────────────────────────────────────┘
```

### Ny komponent: EmailPreviewModal
- Viser subject + HTML-render af mailen
- Redigerbar emnelinje
- Knap: "Send" / "Annuller"

---

## Dataflow

```
Scrape → Lead i Sheets
          ↓
    [Tier A/B + har email]
          ↓
    Bulk-send / manuel send
          ↓
    /api/leads/[id]/send-email
          ↓
    Nodemailer → Gmail SMTP
          ↓
    Log emailSentAt til Sheets (kol O)
          ↓
    Lead åbner mail → tracking pixel
          ↓
    /api/email/track/open/[id] → log emailOpenedAt (kol P)
          ↓
    [5 dage uden åbning] → follow-up trigger
          ↓
    /api/email/send-followups → log followupSentAt (kol S)
```

---

## Implementeringsrækkefølge (faser)

1. **Fase 1:** Udvidede leads — nye BRANCHES/CITIES i apify.ts
2. **Fase 2:** Email-infrastruktur — lib/email.ts + Nodemailer + Sheets-kolonner
3. **Fase 3:** API-routes — send, bulk-send, tracking-endpoints
4. **Fase 4:** Email-skabeloner — alle branche-grupper
5. **Fase 5:** UI — send-knap i LeadTable + bulk-send panel + preview-modal
6. **Fase 6:** Follow-up — send-followups endpoint + UI-trigger

---

## Afgrænsning (ikke med i denne fase)

- Resend / eget domæne (kan tilsluttes later)
- Bounce-håndtering
- Statistik-side over kampagner
- A/B-test af skabeloner
- Automatisk "svarede"-markering (kræver inbox-polling)
