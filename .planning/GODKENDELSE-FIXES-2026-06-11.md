# Godkendelse-tab — bug + features (11/6 2026)

> Lucas-feedback efter live-brug: afviste leads kommer tilbage, og man kan
> ikke fjerne dem man har godkendt (fx "No Scandinavia" som han fortrød).

## Bug 1 — afviste leads kommer tilbage i køen

**Symptom:** Lucas afviser en lead i godkendelse-tab'en. På næste engine-run
dukker den samme lead op igen som ny pending-draft.

**Root cause:** `src/lib/queue.ts:55-67` — `appendDrafts` deduper KUN mod
leads med en PENDING draft. Rejected/approved drafts blokerer ikke et nyt
draft. Så engine'en kan frit re-picke en afvist lead på næste run.

```ts
// Nuværende kode (linje 56-58):
const pendingLeadIds = new Set(
  existing.filter((d) => d.status === "pending" && d.leadId).map((d) => d.leadId)
);
```

**Fix:** udvid dedupe-sættet til også at omfatte rejected drafts inden for
de sidste 14 dage. Permanent skjult kan gøres senere (forklar trade-off
til Lucas).

```ts
// Forslag:
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;
const cutoff = Date.now() - TWO_WEEKS_MS;
const recentlyRejectedLeadIds = new Set(
  existing
    .filter((d) =>
      d.status === "rejected" &&
      d.leadId &&
      new Date(d.updatedAt ?? d.createdAt ?? 0).getTime() > cutoff
    )
    .map((d) => d.leadId)
);
const blockedLeadIds = new Set([...pendingLeadIds, ...recentlyRejectedLeadIds]);
```

**Tests:** unit-test for `appendDrafts`:
- Rejected for 13 dage siden → blokerer
- Rejected for 15 dage siden → tillader genoptagelse
- Approved → tillader (vi har ikke besluttet om approved også skal blokere
  — det er en separat trade-off, hold udenfor denne PR)

## Feature 1 — fjern allerede godkendt lead

**Krav:** Lucas vil kunne fjerne en lead han ALLEREDE har godkendt (fx
"No Scandinavia"). Lige nu er der ingen UI-knap til det, og ingen
backend-action.

**Implementering:**

1. **Backend** — udvid `ActionBody.action` i `src/app/api/approve/queue/route.ts`:
   tilføj `"unapprove"` der flytter en approved draft tilbage til `pending`
   eller direkte til `rejected` (vi vælger `rejected` — Lucas's intent er
   "fjern denne lead helt").
   - Hvis draften allerede er sendt (`status === "sent"`), afvis med 409
     (Conflict) — vi kan ikke un-sende en mail. Returnér klart fejl.
   - Hvis approved → rejected: kør samme Sheets-clean-up (revert
     `registerDraftApproved`-effekten hvis det er nemt — ellers tilføj en
     `unregisterDraftApproved` i `datalayer.ts`).

2. **UI** — `src/app/approve/page.tsx` (eller komponenten der viser
   godkendt-listen). Tilføj "Fjern"-knap pr. row i "Godkendte" sektionen.
   Klik → bekræftelses-dialog ("Sikker? Lead'en flyttes til afviste.")
   → POST `{ id, action: "unapprove" }`.

3. **Tests:**
   - Unapprove fra approved → rejected ✓
   - Unapprove fra sent → 409 fejl ✓
   - Unapprove fra pending → 400 (forkert state) ✓

## Feature 2 — "Spørg Claude" kan gøre det samme

**Krav:** Lucas vil have natural-language-versionerne også: "Claude, afvis
No Scandinavia og bloker den i 2 uger" → den udfører handlingen automatisk.

**Implementering:**

`src/app/api/chat/route.ts` udvides med to nye tool-calls (eller intent-
detektion hvis det er en simpel chat):

- `reject_lead(name_or_id, block_weeks?)` — finder lead'en i køen (best-
  match på navn hvis ID ikke gives), markerer rejected, evt. tilføjer
  `blockUntil` timestamp ud over de 14 dage hvis Lucas siger længere.
- `unapprove_lead(name_or_id)` — samme som UI'en, men via chat.

Begge skal:
- Returnere klar dansk bekræftelse ("Afvist 'No Scandinavia'. Den dukker
  ikke op igen før 25/6.")
- Logge handlingen i `ai_log` eller tilsvarende — så Lucas kan se hvad
  Claude har gjort.
- ALDRIG sende mails / ALDRIG ændre andet end den specifikke draft's
  status.

## Implementeringsrækkefølge

1. **Bug 1 fix** (queue.ts dedupe) — 30 min, lavest risiko, største impact.
2. **Feature 1** (unapprove UI + backend) — 1-2 timer.
3. **Feature 2** (chat-integration) — 1 time, efter 1+2 er live.

## Test-data

Lucas's konkrete eksempel: **"No Scandinavia"** — slå op i køen, brug som
ende-til-ende test for unapprove-flow.

## Safety

- Lead-system har strikse send-regler — ALDRIG send mails uden eksplicit
  Lucas-ja. Denne PR rører IKKE send-laget.
- `PauseSchedule!A2 = 2026-07-01` skal ALDRIG røres.
- Allowlist (buur.aigro + 1charlie.nielsen) gælder alle test-mails.
