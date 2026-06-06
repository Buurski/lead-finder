---
name: inbox-triage-morning
description: Morning inbox triage — Opus ranks which emails actually need a reply and pushes a digest to the Command Center "Svar" page. Sends nothing.
schedule: "0 6 * * *"
---

# inbox-triage-morning

Daglig morgen-triage af Lucas's Gmail-indbakke. Bruger Opus 4.8 (på Lucas's
abonnement — gratis, ikke Vercel API-budget) til at finde de mails der FAKTISK
kræver et svar, og pusher en rangeret digest til Command Center. **Sender ALDRIG
mail** — det er ren triage/visning.

## Hvad den gør
1. Bygger triage-prompten (`buildInboxTriagePrompt` i
   `src/lib/inbox-cowork-prompt.ts`).
2. Kører den i Cowork/Claude med Gmail-værktøjer: scanner INBOX (~7 dage),
   klassificerer, rangerer (importance 0–100, needsReply), drafter korte svar til
   de vigtige.
3. POST'er en `InboxDigest` til `${APP_URL}/api/inbox/digest` med
   `Authorization: Bearer $INBOX_DIGEST_SECRET`.

## App-siden
`/api/replies` læser digesten (artifact-first) og "Svar"-siden viser den: de
vigtigste øverst, støj foldet sammen. Hvis ingen digest findes endnu, falder
siden tilbage til en live, deterministisk scan af lead-matchede svar.

## Senere: Charlie
Tilføj et andet kald med `account: "charlie"` (hans Gmail-konto). Digesten
understøtter flere konti via `account`-feltet på hver item.

## Guardrails
- Triage er read-only. Send aldrig svar fra denne opgave.
- `suggestedReply`: ingen priser/kr, ingen robot-CTA, afslut "Mvh, Lucas".
- Test-mail (hvis nogensinde): kun buur.aigro.
