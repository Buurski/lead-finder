# Fase 1-log

## Task 1 baseline (2026-09-22)
- Worktree lead-system-crm @ origin/main e4ea4d6, tag pre-crm-hq-2026-09-22
- npm run verify: exit 0; lint 0 fejl/7 advarsler; ℹ tests 211 ℹ pass 211 ℹ fail 0 

## Task 6 (fakturaer)
- Sol-review: CHANGES → (1) advisory lock i saveSubscriptions RETTET; (2) nummer forbruges før gem (samme som KV-udgaven) = ACCEPTERET RISIKO, løses i fase 4: kladder får først nummer ved afsendelse.
- TODO fase-slut: login_token-tabel ubrugt (magic-link bruger KV-store) — slet eller tag i brug.

## Task 9 (auth)
- Sol CHANGES (4) + Opus CHANGES (6): alle rettet undtagen ikke-atomisk token-indløsning (accepteret, low).
- CUTOVER-KRAV: sæt APP_URL (https://lead-finder-three-beta.vercel.app), CC_USERS (lucas:<mail>,charlie:<mail>) og CC_MAGIC=1 i Vercel prod — ellers sendes ingen login-mails.
- Neon provisioneret 22/9 (kinly-hq, fra1), migration 0000 kørt, 12 tabeller.

## Sol-review DB-lag (22/9)
- CHANGES 10 fund. Rettet: negativt row_no for kunder uden lead (kollision m. Sheets-rækker før cutover + ikke i getLeads), entydigt klient↔lead-match, tvetydige navne → companyId null, advisory lock på writeQueue, outreach.position (KV-rækkefølge), addClient idempotent + unikt primær-deal-indeks, clientRemoved i stedet for at nulstille clientNo, hel-tals-validering af kunde-id.
- Accepteret: saveTask + "Opgave oprettet"-aktivitet ikke i samme transaktion (manglende logpost ved fejl).
- Migration 0001 kørt på Neon. verify: 268/268.
