# Graph Report - .  (2026-05-03)

## Corpus Check
- 53 files · ~64,036 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 169 nodes · 295 edges · 12 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 54 edges (avg confidence: 0.82)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Lead API Routes|Lead API Routes]]
- [[_COMMUNITY_Email Finder|Email Finder]]
- [[_COMMUNITY_Email Automation Plan|Email Automation Plan]]
- [[_COMMUNITY_Email Tracking + Sending|Email Tracking + Sending]]
- [[_COMMUNITY_Lead Scoring + Scraping|Lead Scoring + Scraping]]
- [[_COMMUNITY_Product + Apify Config|Product + Apify Config]]
- [[_COMMUNITY_Website Crawler|Website Crawler]]
- [[_COMMUNITY_Data Extraction|Data Extraction]]
- [[_COMMUNITY_Lead Verification|Lead Verification]]
- [[_COMMUNITY_Website Analysis|Website Analysis]]
- [[_COMMUNITY_Bulk Email UI|Bulk Email UI]]
- [[_COMMUNITY_Dev Rules|Dev Rules]]

## God Nodes (most connected - your core abstractions)
1. `getLeads()` - 32 edges
2. `getSheetsClient()` - 15 edges
3. `Lead Expansion + Email Automation — Implementation Plan` - 13 edges
4. `POST()` - 11 edges
5. `updateLeadEmailStatus()` - 11 edges
6. `sendLeadEmail()` - 10 edges
7. `updateLeadStatus()` - 10 edges
8. `POST()` - 8 edges
9. `Lead System — Personal CRM + Pipeline Tool` - 7 edges
10. `src/lib/email.ts — Branch Templates + Nodemailer + Tracking URLs` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Lead Pipeline Dashboard — Full View` --references--> `Lead System — Personal CRM + Pipeline Tool`  [INFERRED]
  dashboard-full.png → PRODUCT.md
- `Email Tracking Columns O–S in Google Sheets` --conceptually_related_to--> `Google Sheets as Backend Data Store`  [INFERRED]
  docs/superpowers/plans/2026-04-29-leads-email-automation.md → PRODUCT.md
- `Email Preview Modal (Kold mail preview UI with Send button)` --references--> `EmailPreviewModal Component`  [INFERRED]
  preview-click.png → docs/superpowers/plans/2026-04-29-leads-email-automation.md
- `GET()` --calls--> `getLeads()`  [INFERRED]
  src/app/api/email/bulk-find-emails/route.ts → src/lib/sheets.ts
- `Next.js Agent Rules (Breaking Changes Warning)` --rationale_for--> `Next.js Project (create-next-app bootstrapped, Geist font, Vercel deploy)`  [INFERRED]
  AGENTS.md → README.md

## Hyperedges (group relationships)
- **Email Send Pipeline: Email Lib + Send Route + Tracking Columns** — plan_email_lib, plan_send_email_route, plan_email_tracking_columns [INFERRED 0.90]
- **UI Email Flow: EmailPanel + PreviewModal + LeadTable Wiring** — plan_email_panel, plan_email_preview_modal, plan_lead_table_wiring [EXTRACTED 1.00]
- **Bulk + Follow-up Flow: BulkEmailPanel + BulkSendRoute + FollowupRoute** — plan_bulk_email_panel, plan_bulk_send_route, plan_followup_route [EXTRACTED 1.00]

## Communities (27 total, 1 thin omitted)

### Community 0 - "Lead API Routes"
Cohesion: 0.17
Nodes (15): GET(), POST(), GET(), GET(), sendLeadEmail(), addClient(), getLeads(), updateLeadEmailStatus() (+7 more)

### Community 1 - "Email Finder"
Cohesion: 0.14
Nodes (16): POST(), extractEmail(), findEmailForLead(), findEmailOnWebsite(), findEmailViaCVR(), GET(), POST(), GET() (+8 more)

### Community 2 - "Email Automation Plan"
Cohesion: 0.29
Nodes (17): BulkEmailPanel Component (dashboard bulk send + follow-up), API Route: /api/email/bulk-send (Tier A/B leads), Lead Expansion + Email Automation — Implementation Plan, src/lib/email.ts — Branch Templates + Nodemailer + Tracking URLs, EmailPanel Component (per-lead email section in side panel), EmailPreviewModal Component, Email Tracking Columns O–S in Google Sheets, API Route: /api/email/send-followups (5-day no-open filter) (+9 more)

### Community 3 - "Email Tracking + Sending"
Cohesion: 0.27
Nodes (8): GET(), buildTrackedClickUrl(), buildTrackingPixelUrl(), getAppUrl(), getBranchDisplay(), getBranchGroup(), getEmailTemplate(), previewEmailTemplate()

### Community 4 - "Lead Scoring + Scraping"
Cohesion: 0.29
Nodes (7): detectWebsiteStatus(), runScraper(), scoreLead(), searchPlaces(), appendLeads(), getLeadNames(), POST()

### Community 5 - "Product + Apify Config"
Cohesion: 0.2
Nodes (10): Next.js Agent Rules (Breaking Changes Warning), Lead Pipeline Dashboard — Full View, Apify Query Expansion (BRANCHES + CITIES, Midtjylland), Apify Lead Scraping Integration, Brand Tone — Efficient, Clean, Personal (Well-Designed Notebook), Google Sheets as Backend Data Store, Lead System — Personal CRM + Pipeline Tool, Lucas — Solo Freelance Web Designer (Danish Market) (+2 more)

### Community 6 - "Website Crawler"
Cohesion: 0.44
Nodes (8): crawlWebsite(), extractMeta(), fetchFacebookDescription(), googleMapsLookup(), inferAutoFill(), POST(), waitForRun(), saveLeadEmail()

### Community 7 - "Data Extraction"
Cohesion: 0.47
Nodes (8): extractEmail(), extractPhone(), fetchFacebookMeta(), fetchRawHtml(), fetchViaJina(), findFacebookInHtml(), parseWebsiteContent(), POST()

### Community 8 - "Lead Verification"
Cohesion: 0.36
Nodes (8): batchUpdateLeadVerifications(), websiteQualityBonus(), analyzeUrl(), detectCms(), extractCopyrightYear(), extractEmailFromHtml(), extractJQueryVersion(), POST()

### Community 10 - "Website Analysis"
Cohesion: 0.6
Nodes (5): analyzeWebsite(), detectCms(), extractCopyrightYear(), extractJQueryVersion(), GET()

### Community 12 - "Bulk Email UI"
Cohesion: 0.7
Nodes (4): fetchCounts(), runBulkSend(), runFindEmails(), runFollowups()

## Knowledge Gaps
- **7 isolated node(s):** `Next.js Agent Rules (Breaking Changes Warning)`, `Dev Server Rule (No npm run dev while Claude Code active)`, `Lucas — Solo Freelance Web Designer (Danish Market)`, `Sales Funnel (new → called → interested → client)`, `Brand Tone — Efficient, Clean, Personal (Well-Designed Notebook)` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getLeads()` connect `Lead API Routes` to `Email Finder`, `Email Tracking + Sending`, `Website Crawler`, `Data Extraction`, `Lead Verification`, `Website Analysis`?**
  _High betweenness centrality (0.245) - this node is a cross-community bridge._
- **Why does `getSheetsClient()` connect `Email Finder` to `Lead API Routes`, `Lead Verification`, `Lead Scoring + Scraping`, `Website Crawler`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Why does `sendLeadEmail()` connect `Lead API Routes` to `Email Tracking + Sending`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `getLeads()` (e.g. with `GET()` and `POST()`) actually correct?**
  _`getLeads()` has 15 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `POST()` (e.g. with `getLeads()` and `saveEnrichedInfo()`) actually correct?**
  _`POST()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 4 inferred relationships involving `updateLeadEmailStatus()` (e.g. with `POST()` and `POST()`) actually correct?**
  _`updateLeadEmailStatus()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Next.js Agent Rules (Breaking Changes Warning)`, `Dev Server Rule (No npm run dev while Claude Code active)`, `Lucas — Solo Freelance Web Designer (Danish Market)` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._