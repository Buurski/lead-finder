---
title: Outreach-systemet (tone-mixer v2)
type: proces
updated: 2026-06-04
---

# Outreach-systemet — tone-mixer v2

Bygget på den faktiske outreach-analyse (apr-jun 2026, ~80 mails). Se
`OUTREACH_ANALYSIS_2026-06-04.md`.

## Åbnere (prioriteret)
1. **Achievement** — "Tillykke med [bedrift] — ærlig talt netop derfor jeg
   skriver". Analysens #1 (RR Studio svarede på 17 timer). Bruges altid når en
   bedrift findes.
2. **Konkret teknisk problem** — "jeg kan ikke tilgå [domain] / siden er gammel".
   Føles som rådgivning (VIDA-tråden → lukket aftale).
3. **Anmeldelses-tal** — kundens EGET rigtige tal ("210 anmeldelser — det er folk
   der kommer tilbage").
4. **Anmeldelses-citat** — ægte kunde-ord.
5. **Demo-krog** / **brand-tolkning** — neutrale, lav-risiko fallbacks.

## Det vi droppede
- "Ser ud til at have bygget noget særligt op" (0 konvertering på 30+ sends).
- "Lille idé til" som robot-frase. "Helt uforpligtende" / pris-ord (voice-guide).

## Regler
- **Compose-at-draft-time**: mailen bygges ÉN gang, valideres, sendes som-er.
- **Send-gate (`canSendTo`)**: hostile-blacklist, chain, public (kommune/sygehus),
  bounced, replied, unsubscribed, duplicate — ét sted.
- **Follow-up: 7 dage** (ikke 12). Follow-up vælger en ANDEN åbner-kind.
- **Strict branche-routing** med NEUTRAL fallback ved tvivl.
- **Salgselev-hobby-disclosure beholdt** — det er differentiatoren.

## Hostile-blacklist
Thellufsenfoto, Caroline Bjerring. Modtager aldrig mere.
