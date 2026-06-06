# Nat-rapport 2026-06-06 — Lib-hærdning (12 fixes)

Autonom bug-jagt + test-pass på kerne-libs. Hver fix = ægte bug → test der fanger
den → atomic commit. Alt på `command-center-v3`, intet sendt/deployet.

## Røde tråd
Sheets-værdier bærer stray whitespace/casing; rå `===` mis-gater lydløst. Fundet
+ fikset på hvert send-kritisk + Mission-Control-sted.

## Fixes (commit-rækkefølge)
| Commit | Hvad | Hvorfor det betød noget |
|---|---|---|
| send-gate (canSendTo) | trim+lowercase status/emailStatus | `"bounced "`/`" Unsubscribed "`/`"Skip"` slap forbi → re-mail af en der svarede/afmeldte (compliance) |
| sheets row-delete | pure `planRowDeletions` (dedupe + desc-sort + drop header) | dublet-række-nr ville slette forkert nabo-række (data-tab); id=1 ville slette header |
| store JSONL | pure `parseJsonl` | én korrupt linje slettede HELE loggen (spend.jsonl) |
| engine PICK | `isUnworkedStatus` (blank = un-worked) | blank-status leads blev usynlige for motoren |
| draft-gate | bloker `DKK` + `€` | gate fangede `kr` men ikke DKK/euro |
| deck (Mission Control) | `norm()` på alle status-sammenligninger | `"replied "` skjulte et ægte svar → forkerte tal |
| clients/fees | `normalizeFeeInput` | tastefejl ("abc") skrev blankt = nulstillede omsætning lydløst → nu 400 |
| reply-classifier | drop bare `lad os` | "lad os vente/tænke over det" markeret som vundet kunde |
| AI spend-cap | wire `DAILY_CAP_DKK=150` | var defineret men aldrig håndhævet; nu stopper generate() ved cap |
| email Danish | fix `complimentLine` food-gren | "Jeg er stoedt paa [navn]" på HVER restaurant-koldmail (din kernebranche) |
| eligibility-gate | `norm()` + gør testbar | 2. send-gate med samme whitespace-bug → en der svarede kunne få follow-up |
| UI counts | `norm()` på /leads + EmailStatsPanel | dirty-row under-tælling |

## Resultat
Build grøn · 28 test-suiter / 473 checks grønne · lint 0 · rent træ.
6 nye test-suiter (rowplan, store, pickfilter, money, email, eligibility).

## Kræver Lucas (uændret)
- Fix .env.production malformet SA_JSON (kun lokal `next start` — IKKE prod).
- IMAP_ALLOW_SELFSIGNED=1 i .env.local for lokale svar.
