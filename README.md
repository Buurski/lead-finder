# Lead System

Cold email-CRM til at sælge hjemmesider til lokale danske virksomheder.
Scraper Google Places → scorer leads → sender personaliserede danske mails →
tracker svar/bounces. Google Sheets er databasen (ingen SQL).

## Kør lokalt

```bash
npm install
npm run dev          # Next.js dev-server
npm run verify        # lint + typecheck + test + build (kør før commit)
```

Nødvendige env-vars (`.env.local`): `GOOGLE_SHEET_ID`, `GOOGLE_KEY_FILE` eller
`GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLACES_API_KEY`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, `APP_URL`. Ingen key ⇒ AI-dele kører deterministisk.

## Deploy

Vercel, 10 crons (`vercel.json`) — scrape/verify/inbox-triage/leadgen/
email-find/cleanup/seo-followup/snapshot/invoices, plus engine hver time.
Push til `main` = production-deploy.

## Gates / regler

- **`main` = prod-deploy.** Kun Lucas merger — ingen agent pusher/merger direkte.
- **Test-mail kun til Lucas' egne adresser** (`buur.aigro@gmail.com`) — aldrig
  rigtige leads.
- **Engine sender aldrig selv.** Den fylder kun approval-køen
  (`.send_queue/approval_queue.json`); afsendelse er et separat, manuelt skridt.
- **`GOOGLE_PLACES_API_KEY` = hard gate.** Uden den kan scraping ikke køre —
  aldrig committes, aldrig logges i klartekst.
- Kør aldrig `npm run dev` mens en agent arbejder samtidig (port-konflikt).
