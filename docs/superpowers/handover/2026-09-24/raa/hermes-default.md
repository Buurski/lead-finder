1. IDÉEN

Kinly skal omsætte synlighed til konkrete henvendelser: kinly.dk viser arbejde, priser og et gratis udkast; SEO-tjek og kommende blog besvarer de spørgsmål, lokale virksomheder faktisk søger på. Kinly HQ samler leads, kundedialog, opgaver og godkendelser, så Lucas og Charlie kan følge op uden at miste kontekst. Målgruppen er især selvstændige danske servicevirksomheder, ikke kæder. Blogmålet er fire korte, kildeunderbyggede opslag om måneden med en relevant vej videre til ydelse, SEO-tjek eller kontakt. Agenten forbereder og kvalitetstjekker; Lucas godkender. Forsiden viser nu priser fra 3.997 kr. og udkastet som indgang. ([kinly.dk](https://kinly.dk/))

2. LAVET

Dette er systemstatus, ikke en påstand om at jeg personligt har skrevet alle commits.

• kinly.dk, `/root/kinly-site`: SEO-/interne links, `/billig-hjemmeside/`, PostHog cookieless og måling, responsive billeder, SEO-tjek-rettelser og senest enklere forsidepriser på `main` (`6342fb6`, 24/9). Forsiden svarer HTTP 200; pris og udkast er synlige live. PostHog-events blev efterprøvet i projektdata 24/9; se `wiki/kinly/posthog-sundhedstjek-2026-09-22.md`. ([kinly.dk](https://kinly.dk/))
• Blog: plan, konkurrent-scan og pipeline-spec ligger i `/root/KnowledgeOS/wiki/kinly/`; tre artikelkladder og billedkandidater er beskrevet i `blog-plan-2026-09-24.md`. Site-koden ligger på `agent/0924-blog-s4-fix` (`85f598f`, senere `ca32685`): indeks, opslag, RSS, schema og tests. Logget review: 24/24 tests, build, typecheck og SEO-kontrol grønne; pilotopslag giver 200 + noindex. Ikke merget: `https://kinly.dk/blog/` gav HTTP 404 ved mit live-tjek.
• Kinly HQ, `/root/lead-system`, prod `https://lead-finder-three-beta.vercel.app`: Postgres/Neon, personligt login, kundeprofiler, aftaler, opgaver, Svar-indbakke og agent-ruter. 24/9-deploys `0dbf223`, `a07ff54`, `fe93427` gav CRM-læsning, asynkron chat og læs/opdater Svar; statusfilen `wiki/os/kinly-hq-status-2026-09-23.md` logger 413 tests + typecheck/lint/build og en chat-E2E. Svar-tråde fik senere Gmail-trådlink og udfaldsknap (`8599a78`). Blog-boardets B4-kerne er kun på arbejdsgrenen `agent/0924-1932-lead-system` (`695d755`): 37 fokuserede tests og lint grønne, ikke fuld suite eller prod.
• ICP-analysen `wiki/os/ideal-kunde-icp-v2-2026-09-24.md` læste 1.427 CRM-rækker, men skelner korrekt mellem CRM-rækker, svar og de fire faktiske kunder. Rangering v2 er en hypotese, ikke en målt forbedring.

3. MANGLER, prioriteret

1) Få mail-sync/Svar-digest gennem release-gaten: begge jobs er pauset efter lokale tests, uden ny live-kørsel. Afklar data og stop enhver risiko for utilsigtet udsendelse.
2) Færdiggør blogkæden: review af B4, billed-assets, CRM-board, eksport/udgiver og E2E; derefter Lucas’ merge og godkendelse af de tre opslag. `agent-blog-ideer` og `agent-blog-dybdescan` er planlagt, ikke oprettet.
3) Ryd lead-data og mål den faktiske godkendelseskø før ny score: dubletter/kæder, menneskelige versus automatiske svar, og case-links. KT VVS mangler en godkendt offentlig case; brug ikke demoen som om den var en case.
4) Afklar Ikast AutoServices pris, Jernbanecaféens usendte faktura 010 og kalenderforbindelse pr. bruger. CVR-piloten afventer Lucas’ Datafordeler-adgang; ingen betalte Places-opslag er godkendt.

4. PROBLEMER

En reviewkørsel afviste blogkoden for `1970-01-01` i metadata, et SEO-tjek der ikke kunne fejle, og et tomt offentligt indeks. En senere gren fik grønt review, men et tomt `/blog/` indtil første rigtige opslag samt skrøbelig brug af Next `.meta` står stadig i planen. Fuld HQ-testsuite er udskudt fra B4 til E2E; kald ikke kernen produktionsklar. `nat-build-check` fejlede 24/9 på 30 minutters lead-system-timeout, og tunnel-rotation fejlede på systemd-restart. Ældre vault-status omtaler 152 ventende kladder; nyere CRM-analyse siger 55. Brug et nyt prod-opslag, ikke et af de tal, som aktuel køstørrelse.

5. KØRENDE AUTOMATIK

Status læst fra cron-JSON 24/9 kl. ca. 23 CEST. Relevante jobs:
• `morning-brief` 07:15, script/default, ok 24/9; `morgenrapport` (cofounder) 07:00, script/default, ok 24/9; `uge-marketing` onsdag 09:00, script/default, ok 23/9.
• `agent-blog-cyklus` mandag 08:00, DeepSeek V4.1 Flash: aktiv, aldrig kørt. `blog-drafter-nat` mandag 02:30 og `authority-sprint-daglig` 10:00: pauset.
• `kinly-preview-intake` hvert 30. minut, DeepSeek: ok 24/9; `agent-leadgen-daglig` 06:00, script/default: ok 24/9. De føder preview-/leadflowet, ikke automatisk udsendelse.
• `crm-mail-sync` 08/10/15, DeepSeek, og `inbox-digest-sync` 08:50/10:50/15:50, script/default: begge pauset med status `not_run_after_release_gate`. Scripts: `/root/.hermes/scripts/crm_mail_sync_jev.py` og `inbox_digest_jev.py`. Mailaktiviteter går via KV og `/api/cron/kv-crm-bridge` til Postgres; opgaver og Svar har også signerede agent-ruter. KV-broen importerer nye id’er, men overskriver ikke senere opgaverettelser.
• `team-checkin` hverdage 09:00, DeepSeek: ok 24/9 og skriver svar til `/api/agent/log`. Det er et eksisterende job, der selv stiller Telegram-spørgsmål, og bør holdes op mod Lucas’ grænse om aldrig at sende beskeder.
• `nat-build-check` 06:00, DeepSeek: fejl 24/9; `cloudflared-quick-tunnel-rotate` hver 12. time, DeepSeek: fejl 24/9. Øvrige ops-jobs står i `/root/.hermes/cron/jobs.json` og profilernes `cron/jobs.json`.

6. AFHÆNGIGHEDER

Lucas: merge- og tekstgodkendelse, valg af blogbilleder, KT VVS-case, CVR-adgang og afklaring af de åbne kundeforhold. Charlie/Claude Code: færdiggør og tester blog-board/udgiver i lead-system samt integrationen mod kinly-site; koordinér branches først. Rør ikke mine cron-profiler, credentials, release-gates eller delte KnowledgeOS-noter parallelt uden aftale. Ingen live-kundesider, mails eller beskeder som del af handoveren.

7. FORSLAG

1) Frys nye blogfunktioner, indtil én artikel kan gå hele vejen fra CRM-godkendelse til målt live-side.
2) Erstat tunge, timeoutende nat-builds med små kontrakttests; behold fuld suite ved merge.
3) Lav én autoritativ CRM-optælling med entydige nævnere før score v2.
4) Fjern dobbelt blog-drafting og dublerede statusjobs, når boardet faktisk virker. Nyhedsbrev med fire kunder giver ikke værdi nu.

Intet er ændret eller sendt i denne gennemgang.
