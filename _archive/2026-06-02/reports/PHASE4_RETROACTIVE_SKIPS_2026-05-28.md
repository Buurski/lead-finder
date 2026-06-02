# Fase 4 — retroaktiv skip-audit (28. maj 2026)

Kørt på alle 8.459 leads, mod NY `isChain` (apostrof-fix) + ny `isPublicSector`.
Identificerer leads der **allerede har modtaget en cold-mail**, men nu fanges af de hærdede filtre.

## Resumé

| Kategori | Antal |
|---|---|
| Total leads med cold-mail sendt | 798 |
| Kæder der slap igennem (apostrof-miss) | **3** |
| Offentlig sektor der slap igennem | **1** |
| Broken-claim mails til TreatAsAlive-domæner | 0 |
| Allerede markeret skip (ingen handling) | 3 |
| **Anbefales retroaktivt skippet** | **4** |

## A) Kæder — Bone's (apostrof-misset i praksis)

| Row | Navn | By | Email | Sendt | Follow-up? |
|---|---|---|---|---|---|
| 6226 | Bone's | Billund | billund-event@lalandia.dk | 2026-05-12 | nej |
| 8073 | Bone's Herning | Herning | info@bones.dk | 2026-05-19 | nej |
| 8077 | Bone's Silkeborg | Silkeborg | info@bones.dk | 2026-05-19 | nej |

> `info@bones.dk` er Bone's corporate-mail — vi har mailet HQ to gange. Dette er den **konkrete burn** apostrof-fixet løser. Mine commits B + D blokerer allerede yderligere follow-ups til disse leads automatisk, men de bør også markeres `skipReason: chain` for at lukke audit-loopet.

## B) Offentlig sektor

| Row | Navn | By | Email | Sendt | Follow-up? |
|---|---|---|---|---|---|
| 5355 | Træningsafdelingen / Tønder Sygehus | Tønder | redaktion@toender.dk | 2026-05-12 | **JA** |

> Allerede fulgt op — kan vi desværre ikke trække tilbage. `skipReason: bad_fit` foreslås for at hindre yderligere kontakt.

## C) Broken-claim på TreatAsAlive-domæne

Ingen fundet — TreatAsAlive-listen har 4 domæner, ingen af dem er blevet sendt en "broken hjemmeside"-mail. Godt.

## Anbefalet handling (i morgen, manuelt eller via review/skip-endpointet)

For hver af de 4 rækker: sæt `skipReason` til den relevante værdi.

```
POST /api/review/skip   { leadId: "6226", reason: "chain" }
POST /api/review/skip   { leadId: "8073", reason: "chain" }
POST /api/review/skip   { leadId: "8077", reason: "chain" }
POST /api/review/skip   { leadId: "5355", reason: "bad_fit" }
```

Eller direkte i Sheet: kolonne V (skipReason) for hver række.

## Krydstjek mod audit-task'ens Fase 4

Audit-task'en (Dispatch) lavede formentlig sin egen Fase 4 dry-run. Paste den, så krydstjekker vi de to lister. Skulle den have fundet andre/flere, samler vi dem.

## Hvorfor det matcher

Bone's-misset (apostrof) → uden fixet ville `isChain("Bone's Herning")` returnere false → leadet passerer eligibility → får cold-mail. Nu med fixet returnerer den true. De tre rækker er den live evidens for at det var et reelt aktivt problem, ikke kun teoretisk.
