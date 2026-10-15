# Har svaret med kontekst — design (2026-10-15)

Ejer: Lucas + Charlie. Status: UDKAST til godkendelse. Ingen kode skrevet. Branch: `feat/har-svaret-kontekst` (worktree `Workflows/hq-har-svaret`, fra `origin/main` 5a4ec45).

## 1. Ønske

Lucas: se hvad leads faktisk har svaret, før vi kontakter dem. Få et pænt overblik over *hvordan* vi kontakter hver enkelt, og vær kritisk: svaret alene er ikke nok, konteksten tæller.

Succes = Lucas kan åbne `/har-svaret`, læse hvert svar (uddrag + dato), se hvad vi selv skrev og hvornår, og få en begrundet anbefaling af kanal (skriv / ring / tjek først / luk). Intet sendes af systemet.

## 2. Problem (målt i prod-DB 15/10, kun SELECT, 75 rækker)

| Fund | Tal | Konsekvens |
|---|---|---|
| Åbne "har svaret"-leads | 75 (65 svaret, 10 interesseret) | |
| lead_status `called` | 54 | Arv fra Sheets-tiden |
| Har logget opkald/møde/note/udfald i CRM | **0 af 75** | Ingen ved hvad der blev sagt eller aftalt |
| Vores seneste mail >90 dage siden | 64 af 75 (kun 1 inden for 14 d, 6 uden dato) | Svarene er gamle; "varme" er de næppe |
| Har ejer / Jev-karakter | **0 af 75** | Kolonnerne er tomme; "Se svar" falder tilbage til den indloggede persons indbakke, også når den anden sendte mailen |
| Outreach-rækker i PG for de 75 | kun 9 | Hvad vi skrev er ukendt for ~66; kun Gmail Sendt ved det |
| Noter | 49 har note, mange kun `…; cvr_unchecked` | CVR/reklamebeskyttelse er ikke tjekket pr. lead |
| Alle `replied` i DB | 104: 34 skip/ikke_egnet, 3 kunde, 1 tabt, 75 åbne | Resten er allerede sorteret fra |

Kode (origin/main):
- `syncReplies` (`src/lib/sync-replies.ts`) henter kun `envelope` og matcher **afsender-adressen**. Tekst, dato og emne gemmes ikke. Dagligt kl. 04:30.
- Kandidater udelukker leads med `emailStatus === "replied"`: et **andet svar fra samme lead ses aldrig**.
- Et svar fra en anden adresse (ejerens private mail, en kontakt) fanges ikke af sync, selvom `findCompanyByEmail` kender kontakter.
- Svarteksten findes kun i `inbox/digest` (KV): én overskrevet snapshot, ikke pr. lead. Jev-dommen (`reply-judgments`) blokerer derfor på "svartekst mangler".
- `/har-svaret` sorterer efter *vores* seneste kontakt og kender ikke svardatoen. "Ring" er første knap på alle rækker, uanset hvad de skrev.

Kritisk læsning: `replied` betyder "der kom en mail fra adressen". Det kan være ferie-autosvar, "nej tak" eller en bounce-lignende mail. Uden tekst kan listen ikke skelne. Og med 64/75 gamle ved vi ikke om det haster eller om et opkald i dag føles underligt for modtageren.

## 3. Ikke-mål (YAGNI)

- Intet sendes, ingen auto-svar. "Skriv tilbage" er et `mailto:`-link (som "Mail igen" i dag).
- Ingen AI/Jev på svarene i v1; deterministiske regler. Jev-dommen kan senere bruge den lagrede tekst.
- Ingen suppression-tabel (findes ikke i DB; spærring sker via `lead_status`/`isContactable` som i dag).
- Ingen nye crons.
- Ingen CVR-opslag for reklamebeskyttelse (viser kun et "CVR ikke tjekket"-mærke).

## 4. Datamodel

Ny tabel `lead_reply` (migration `drizzle/0017_lead_reply.sql`, genereret med drizzle-kit):

| Kolonne | Type | Note |
|---|---|---|
| id | uuid pk | |
| company_id | uuid fk company | |
| account | text | `lucas` \| `charlie`: indbakken der modtog svaret |
| message_id | text **unique** | RFC Message-ID, gør upsert idempotent |
| thread_id | text null | Gmail X-GM-THRID hvis tilgængelig |
| received_at | timestamptz | |
| subject | text | |
| snippet | text | højst 600 tegn, citeret tekst og signatur fjernet |
| category | text | `interested` \| `question` \| `objection` \| `not-interested` \| `auto-reply` \| `other` (eksisterende `classifyReply`, plus header-regel for autosvar) |
| asks_call | boolean | tekst nævner ring/telefon eller indeholder et telefonnummer |
| created_at | timestamptz | |

Index `(company_id, received_at desc)`. Ingen kolonne på `company`: seneste svar udledes af `lead_reply`.

Opbevaring: `captureReplies` nulstiller til sidst `snippet` på rækker >180 dage (ét `update`, ingen nyt job); metadata beholdes.

## 5. Indsamling

Ny funktion `captureReplies({ since })` i `src/lib/sync-replies.ts`, kaldt fra `/api/cron/sync-replies` lige efter `syncReplies` (best-effort, må ikke vælte status-synk, samme mønster som sendt-scanningen) og fra en "Opdatér"-knap på siden (POST, kun læsning af Gmail).

- Scanner INBOX på begge konti for **alle** leads med mail (også `replied`) plus `contact`-adresser, matcher på afsender.
- Henter `source` kun for matchede beskeder; `decodeMailBody` (findes) → fjern citat (`>`-linjer, "Den … skrev:" og alt efter) → 600 tegn.
- Autosvar: headers `Auto-Submitted`, `X-Autoreply`, `Precedence: auto_reply|bulk`, eller emne `Automatisk svar|Out of office|Fraværende|Autosvar`.
- Upsert på `message_id`. Nulstiller aldrig status; rører ikke `lead_status`.
- Backfill: engangsscript `scripts/backfill-lead-replies.mjs`, `--dry-run` som standard, opslag pr. adresse over 365 dage (ingen 60-dages-grænse), udskriver kun tal. Skrivning kræver `--apply`.

## 6. Kanal-regler (deterministiske, første match vinder)

| Bucket | Regel | Primær handling | Skjult |
|---|---|---|---|
| **Luk** | `not-interested` / afmeld i tekst | "Luk" (eksisterende udfald `ikke-interesseret`) | Ring, Mail igen |
| **Tjek først** | `auto-reply`, `other`, eller ingen tekst fanget | "Åbn i Gmail" | Ring |
| **Ring** | `asks_call` og seneste svar ≤60 d | Ring (viser nummeret fra teksten hvis det findes) | |
| **Skriv tilbage** | `interested`/`question`/`objection`, seneste svar ≤60 d | `mailto:` Re:-emne | Ring bag "…" med advarsel |
| **Gammel** | seneste svar >60 d (uanset kategori, undtagen Luk) | Åbn i Gmail; ingen foreslået handling | Ring |

Princip: de svarede på mail, så mail er standardkanalen. Ring kun hvis de selv bad om det. Ring-knappen bag "…" viser: "De bad ikke om opkald. Tjek reklamebeskyttelse (CVR) først." Svar på vores kolde mail giver lov til at svare, ikke til nye kolde forsøg (kold førstekontakt er pauset, §10).

## 7. UI (`/har-svaret`)

- Toppen: bucket-chips med antal (filter). Rækkefølge: Skriv tilbage, Ring, Tjek først, Gammel, Luk. Inden for bucket: nyeste svar først.
- Række = kort:
  - Venstre: navn, branche · by, Jev (hvis sat), mærker: "CVR ikke tjekket" (fra noter), "Markeret ringet, ingen log" (`called` uden opkaldsaktivitet).
  - Midt: "Svarede for 3 d siden · efter 1 d" (svartid fra vores mail), kategori-chip, uddrag på 2 linjer (udfold til 600 tegn), "Åbn tråd i Gmail" mod den konto der modtog svaret (`lead_reply.account`).
  - Højre: anbefalet kanal + én linjes begrundelse + handlinger (eksisterende Log opkald, Ring senere, Book møde bevares).
  - Under: "Vi skrev: trin N, dato, vinkel" fra `outreach` hvis rækken findes, ellers "ukendt, se Sendt".
- Tom tilstand for leads uden indsamlet tekst: "Svartekst ikke hentet endnu. Tryk Opdatér."

## 8. Rækkefølge og gates

1. **PR 1 — data:** migration + `captureReplies` + backfill-script. Verificering: enhedstests, `--dry-run` mod prod giver tal for Lucas. Prod-migration og `--apply` er Lucas' ja.
2. **PR 2 — UI:** bucket-funktion (ren, testet), nye kort, filtre. Live-check med screenshot før "done".
3. Deploy kun fra `origin/main` efter `git fetch`; højst 2-3 prod-deploys/dag. Codex Sol reviewer migration + indsamling (kode, der læser mail).

## 9. Test

- `bucketFor()` tabeltest (alle regler + grænsen på 60 d).
- Citat-/signatur-strip og 600-tegns-klip, autosvar-headers, `asks_call`-regex.
- Upsert idempotent (samme `message_id` to gange = én række).
- PGlite: sideforespørgslen giver bucket + seneste svar + "vi skrev"; leads uden svar-række vises som "Tjek først".
- `npm run verify` grøn.

## 10. Risici

- **Persondata:** uddrag af erhvervsmails (inkl. enkeltmandsvirksomheder). Mindsket: 600 tegn, ingen vedhæftninger, 180 dages opbevaring, kun egne Gmail-konti, intet sendes til AI.
- **IMAP-tid:** backfill pr. adresse; kør uden for kontortid, `socketTimeout` som i sync-replies. Fejl pr. konto isoleres.
- **Regex-klassificering tager fejl** (fx sarkasme, mix af ja/nej): derfor "Åbn i Gmail" på alle kort og "Tjek først" som sikkerhedsnet.
- **Ældre end 60 dage:** 64 af 75 falder sandsynligvis i Gammel. Det er pointen, men betyder at siden i starten mest viser "gamle". Realistisk forventning: få varme, resten oprydning.

## 11. Åbne punkter (LUCAS)

1. Må uddrag af svar (600 tegn, 180 dage) gemmes i HQ's DB? *(anbefalet: ja)*
2. Gamle svar (>60 d): kun vis, eller også tilbyde "Er det stadig aktuelt?" som kladde? Det er en jura-vurdering (§10), derfor ikke foreslået her.
3. OK at Ring skjules bag "…" medmindre de selv bad om opkald?
4. Backfill 365 dage tilbage OK?

## 12. PR 1 — afvigelser fra spec'en (implementeret)

- `captureReplies` bor i `src/lib/capture-replies.ts` (ikke i `sync-replies.ts`, som er uændret); DB-delen i `src/lib/hq/lead-replies.ts`, parseren i `src/lib/hq/reply-parse.ts`.
- `category` gemmer hele `ReplyCategory` (også `unsubscribe` og `wrong-person`), ikke kun listen i §4.
- `asks_call`: et telefonnummer alene tæller **ikke** (står i de fleste signaturer). Kun "ring/ringe", "giv et ring" og "telefonsamtale"; "ringer/ringede" tæller ikke. Nummeret læses fra uddraget når UI'et skal vise det.
- Kategori og opkalds-tjek læser hele den signatur-rensede tekst, ikke det 600-tegns klippede uddrag.
- Afmeldte/bouncede/arkiverede leads lyttes der ikke efter (§4 persondata-minimering).
- Cron-hook kører kun når `REPLY_CAPTURE=1` er sat i Vercel (default fra), så en deploy før migration 0017 ikke rammer en tabel der ikke findes.
- Rettet i forbifarten ved roden: `cleanupBody` (`mail-decode.ts`) klippede ikke dansk Gmail-citatheader "Den … kl. … skrev Navn <mail>:". Rammer også `/replies`. Regressionstest tilføjet.
- Dry-run mod prod er kørt (Lucas' ja 15/10, kun tal): 150 mails/365 d, 62 af 75 åbne leads har et fanget svar. Intet skrevet. Migration 0017 og `--apply` afventer Lucas' ja.

## 13. PR 2 — afvigelser fra spec'en (implementeret)

- Bucket-præcedens i `bucketFor()` (`src/lib/hq/reply-bucket.ts`): Luk → intet svar = Tjek → **Gammel (>60 d) før kategori** → autosvar/uklart/forkert person/uden uddrag = Tjek → asks_call = Ring → ellers Skriv. §6-tabellens "Gammel undtagen Luk" gælder altså også Tjek: et 90 dage gammelt autosvar står som Gammel.
- Data: `listRepliedLeadsWithContext` (`replied-leads.ts`) bruger `repliedLeadsWhere()` uændret, så KPI og liste har stadig samme mængde. Mangler `lead_reply` (før migration 0017) gives `captureReady=false`: siden virker, alle står som Tjek, advarsel øverst, "Opdatér svar" er slået fra.
- "Opdatér svar" kalder `POST /api/replies/capture` (30 d, læser kun Gmail, skriver kun `lead_reply`). Uden tabel svarer ruten med en dansk fejl.
- Luk-knappen bruger det eksisterende udfald `ikke-interesseret`. Intet sendes nogen steder; "Skriv tilbage" er et `mailto:`.
- Luk-rækker har hverken Ring eller Mail igen. Ring bag "…" kun når de ikke bad om opkald (med CVR-advarsel).
- Klassifikatoren er ikke finjusteret på "Uklart" (ville flytte ~3 mails og deles med andre flows).

## 14. Sol-review 15/10 — rettet og udskudt

Rettet (alle med test): `replyCandidates` spærrer også `leadStatus` afmeldt/bounced (samme `isSuppressed` som send-gaten) og spærrer en afmeldt adresse globalt, så den ikke genindsamles under en anden virksomhed; en adresse delt af flere aktive virksomheder udelades (kan ikke henføres). Svar-fejl logges/returneres via `safeError` (ingen SQL-parametre = ingen svar-uddrag i logs). Signaturer (Med venlig hilsen, Mvh, Bedste hilsner, Kind regards) klippes af uddrag, kategori og opkalds-tjek. Negerede opkaldsønsker ("ring ikke") er ikke `asksCall` (hellere for lidt Ring end for meget). `mergeCompanies` flytter `lead_reply` med. Gammel-grænsen sammenlignes i ms, ikke afrundede døgn.

Udskudt (kendt begrænsning, ingen af dem sender eller skriver noget):
- Gmail-link og "Skriv tilbage" bruger virksomhedens hovedadresse, ikke den faktiske afsender (kontakt der svarer fra en anden adresse, eller tom hovedadresse). Kræver en `from_email`-kolonne i 0017.
- "Vi skrev" viser antal mails og dato, ikke trin og vinkel fra `outreach` (§7).
