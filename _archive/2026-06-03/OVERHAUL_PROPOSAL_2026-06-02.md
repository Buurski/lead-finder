# Lead-system — overhaul-vurdering & idéer (2026-06-02)

Din observation er rigtig: Vercel-appen blev bygget til **dengang du selv sad og styrede
et dashboard manuelt**. Men arbejdet er flyttet — det meste sker nu via Cowork/agent +
scripts i `.send_queue/` + planlagte opgaver. De to systemer er drevet fra hinanden.

## Diagnose — hvad der faktisk er sket

1. **To systemer, ikke ét.** Appen (`src/`) er et manuelt dashboard. Den rigtige drift
   er ~40 engangs-scripts i `.send_queue/` (`.compose`, `.enrich`, `.messenger_digest`,
   `.search_*` …) + scheduled tasks. Logikken (kandidatfiltre v4/v5, voice-regler,
   `KNOWN_HANDLES`) lever i scripts, ikke i appen.

2. **Appen er begyndt at forfalde.** `bulk-find-emails/route.ts` har **to `POST`-funktioner**
   (duplikeret kode + et afhugget fragment) → den kompilerer ikke som den står. Symptom på
   at ingen reelt vedligeholder appen længere.

3. **To kilder til sandhed.** Pipeline-status ligger i Google Sheet; messenger/queue-status
   ligger i JSON-filer i `.send_queue/`. De kan komme ud af sync (præcis som da VIDA blev
   vundet men aldrig blev opdateret i arket).

4. **Død overflade.** Open/klik-tracking + tilhørende dashboard-paneler virker ikke (Gmail).
   De fylder i koden og giver falsk tryghed.

5. **E-mail-finderen er forældet** — og det er målbart: den missede VIDA. `LeadBot/1.0`-UA
   (bot-blokeres), kun hjemmeside+CVR (ingen FB/IG/booking), og den kasserer gmail/hotmail.
   Beauty-leads rammes hårdest — deres mail står tit kun på Facebook eller i en gmail.

## Den strategiske pointe

Workflowet er gået fra **"Lucas styrer et dashboard"** → **"Claude/Cowork styrer systemet."**
Så en overhaul bør ikke gøre dashboardet finere. Den bør gøre lead-system til en **ren,
agent-drivbar motor** — med ét datalag og veldefinerede handlinger — og lade Cowork være
operatøren. Dashboardet skrumper til en lille godkendelses-/overbliksflade.

## Tre retninger (vælg én at gå efter)

**A. Thin engine + agent-as-operator (min anbefaling).**
Strip appen ned til (1) ét rent datalag, (2) veldefinerede handlinger (find-emails, send-batch,
get-pipeline, register-client, analytics), (3) en lille read-only/approval-side. Cowork kalder
disse handlinger i stedet for at skrive nye `.mjs`-scripts hver morgen. Ét sted for logik, ingen
drift. Mellem indsats, størst gevinst — og passer 1:1 med hvor dit arbejde allerede er.

**B. Fuld genopbygning på rigtig database.**
Skift Sheets ud med Postgres/Supabase, byg en ordentlig pipeline-UI, indbygget e-mail-finding,
svar-indbakke, analytics. Reneste slutresultat, men stor indsats — og Sheets fungerer faktisk
fint som "database" for din skala. Jeg ville ikke starte her.

**C. Inkrementel oprydning.**
Behold Sheets, fix de ødelagte ruter, flyt `.send_queue`-logik ind i appens `lib/`, dræb død
kode, tilføj svar-baseret analytics. Mindst risiko, men løser ikke det grundlæggende
"to-systemer"-problem. God som *del 1* af retning A.

## Konkrete idéer (masser, grupperet)

### Motor & arkitektur
- **★ Gør lead-system til en MCP-server.** Så får Cowork rigtige værktøjer:
  `find_emails`, `scrape_leads`, `send_batch`, `get_pipeline`, `register_client`,
  `reply_triage`. I stedet for at agenten genopfinder en `.mjs` hver morgen, kalder den
  bare værktøjet. Der er endda en `mcp-builder`-skill til netop dette. Dette er den
  enkelt-idé der binder hele dit nuværende workflow sammen.
- **Konsolidér de ~40 `.send_queue`-scripts** til ét lille sæt moduler i appens `lib/`
  (candidate-filter, voice, handle-resolver). Slet resten. Én sandhed for kandidatlogik.
- **Ét datalag.** Flyt messenger/queue-state fra løse JSON-filer ind i arket (egen fane)
  eller en lille DB, så pipeline-status aldrig kan være ude af sync med virkeligheden.

### E-mail-finding 2.0 (det der missede VIDA)
- Skift `LeadBot/1.0` → rigtig Chrome-UA + ét retry + jina-fallback (samme hærdning som
  06-01-batchen brugte).
- **Tilføj sociale kilder:** Facebook "Om"-side, Instagram-bio, Google Business-profil,
  booking-system-sider (mange saloner har kun mail dér).
- **Behold gmail/hotmail for beauty** når den står på virksomhedens egen FB/hjemmeside —
  saloner bruger ofte privat-mail. Domæne-match er for stramt til dette segment.
- **Bridge:** beauty-leads hvor mail ikke kan findes → ryger automatisk i Messenger-digesten
  i stedet for at blive tabt. (De 602 mail-løse beauty-leads, hvoraf 164 har høj score.)

### Analytics (uden tracking)
- Svar-baseret dashboard: svarrate pr. segment/by/branche, trukket direkte fra arket.
  Erstatter de døde open/klik-paneler.
- "Skjulte VIDA'er": liste over svar der aldrig blev til kunde + leads systemet markerede
  "ingen mail" men har høj score.

### Svar & konvertering
- **Svar-assistent:** auto-klassificér indkommende svar (interesseret / ikke nu / afmeld /
  spørgsmål) og udkast et svar i din stemme. Du har 84 svar — der gemmer sig flere kunder.
- Auto-registrér en kunde når et svar bekræftes (så næste VIDA ikke forsvinder).

### Beauty-specifikt
- Niche-demoer pr. under-branche (frisør / negle-vipper / hudpleje / barber) i stedet for
  altid de samme to.
- Når VIDA-siden er live: brug den som *den* beauty-demo + bed om anbefaling + udtalelse
  → social proof til de næste beauty-pitches.
- Kanal-test: Messenger-først vs. mail-først for beauty.

### Deliverability & oprydning
- Fjern open/klik-tracking helt (pixel + redirect + endpoints + UI). Det er kun risiko nu.
- Behold den fine List-Unsubscribe + paced sending (det er allerede godt).
- Slet de gamle backup/`.bak`/`OLD_PRICING`-filer der roder i `.send_queue` og `src/lib`.

## Forslag til rækkefølge
1. **Del 1 (oprydning, lav risiko):** fix `bulk-find-emails` (fjern dublet-POST), opgradér
   finderen (UA + sociale kilder + behold free-mail for beauty), dræb død tracking.
2. **Del 2 (motoren):** byg lead-system som MCP-server med 5-6 kerneværktøjer.
3. **Del 3 (intelligens):** svar-baseret analytics + svar-assistent + auto-kunderegistrering.
4. **Del 4 (beauty-vækst):** e-mail→messenger-bridge, niche-demoer, kanal-test.

Min anbefaling: start med **Del 1** (jeg kan fixe finderen i dag — det er også det der
direkte giver dig flere VIDA-typer), og beslut dig så for om vi går efter MCP-motoren (Del 2).
