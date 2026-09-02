# Lead-gen (porteret til repo 2026-09-02)

Daglig lead-gen: Google Places → filtrér/scor → CVR + mail-enrich → drafts i
approval-køen + Sheets + `KnowledgeOS/data/leadgen.json`. Sender aldrig noget selv.

Scriptet lå før untracked på Lucas' PC (`scripts/_leadgen_v2_selective.mjs`) og kørte
som Cowork-task med hardcodede sandbox-stier. Udvælgelseslogikken er uændret — kun
stier, credentials og kontaktfilteret er nyt.

## Hard gate — læs før du kører
`GOOGLE_PLACES_API_KEY` skal være verificeret gyldig først (billing aktiv + dagskvote).
Test med et enkelt Text Search-kald (curl-eksemplet står øverst i `vps-run.sh`).
Kører du uden gyldig nøgle, brænder du en dag uden leads.

**VPS-status 2026-09-02 (verificeret via ssh):** `/root/.hermes/credentials.env` har
`GOOGLE_PLACES_API_KEY` (ugyldig — `API_KEY_INVALID`) og `GOOGLE_SHEET_ID`, men
**ingen** `GOOGLE_SERVICE_ACCOUNT_JSON` eller `GOOGLE_KEY_FILE`. Uden dem fejler
`apply` (Sheets-append) højt. Begge skal lægges i `credentials.env` af Lucas før
første kørsel. `/root/lead-system` har node_modules og `nyt-cronjob.sh` ligger i
`/root/.hermes/scripts/`.

## Lucas' regel (19/8 2026 — ufravigelig)
**Kun leads med verificeret mail ELLER telefon må drafts.** Det er et hårdt filter
(`hasContact()`), ikke bare point i fitScore. Leads uden begge dele udvælges slet
ikke i `finalize` og tælles som `skip: "no-contact"` / `no_contact` i result-JSON'en.

## Env-variabler
| Variabel | Default | Bruges af |
|---|---|---|
| `KOS_ROOT` | `../KnowledgeOS` (ift. repo-rod) | `apply` → `$KOS_ROOT/data/leadgen.json` |
| `LEADGEN_WORKDIR` | `.leadgen-work/` i repo-rod | fase-filer mellem faserne (gitignored) |
| `LEAD_QUEUE_PATH` | `.send_queue/approval_queue.json` | `apply` |
| `GOOGLE_PLACES_API_KEY` | — (kræves i `source`) | `source` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | — | Sheets (`source`, `apply`) |
| `GOOGLE_KEY_FILE` | — | fallback hvis JSON'en ikke er i env |
| `GOOGLE_SHEET_ID` | — | Sheets |

Findes hverken `GOOGLE_SERVICE_ACCOUNT_JSON` eller `GOOGLE_KEY_FILE`, fejler
`source`/`apply` højt med besked. `plan`, `rate` og `finalize` kører uden creds.
Lokalt læses `.env.local` / `.env.production` automatisk (env vinder over fil).

## Kør lokalt
```bash
node scripts/leadgen/run.mjs plan       # tørt tjek: byer + antal kald i dag (INGEN netværkskald)
node scripts/leadgen/run.mjs source     # Sheets-dedup + Places-sourcing
node scripts/leadgen/run.mjs rate       # gentag til "remaining": 0
node scripts/leadgen/run.mjs finalize   # udvælg + CVR + mail-enrich
node scripts/leadgen/run.mjs apply      # drafts → kø + Sheets + leadgen.json
node --test scripts/leadgen/run.test.mjs
```

## Kør på VPS
`bash scripts/leadgen/vps-run.sh` — source'er `/root/.hermes/credentials.env`, kører
alle faser i rækkefølge, pusher vaulten med `safe-push.sh` og logger til
`/root/.hermes/logs/leadgen-<dato>.log`. Registreres via `nyt-cronjob.sh`, ikke
manuelt i `jobs.json`.

## Attributions-rapport
`node --conditions=react-server scripts/attribution-report.mjs` læser `Leads`-fanen
read-only og printer udfald (sendt/svaret/bounced/unsub/svar-%) pr. branche, pr.
score-bucket (0-49/50-69/70-100) samt total og sidste 30 dage. Kun leads med
`emailSentAt` tælles med; brancher med n < 10 rulles sammen i én linje. Scriptet
skriver ALDRIG til Sheets og ændrer ingen score-vægte — det er datagrundlag.
Seneste kørsel er gemt i `KnowledgeOS/wiki/os/attribution-2026-09-02.md`.
