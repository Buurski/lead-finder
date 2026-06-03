# Personlig outreach-motor — plan & idéer (2026-06-02)

## Den nye kerne-idé

Det der vinder kunder for dig nu er **AI-researchet, personlig 1:1-outreach** — ikke
masse-skabeloner. Din rigtige arbejdsgang i dag er:

> "Claude, skriv til den her kunde" → Claude undersøger deres hjemmeside + Facebook +
> Google → finder noget specifikt → skriver en varm, menneskelig besked.

Det skal være **systemet**, ikke en manuel undtagelse. Vercel-appen gør det modsatte
(blaster skabeloner via Gmail, der ikke leverer). Vi vender det om: **færre, langt bedre,
dybt personlige beskeder** — med Claude i loopet på hver enkelt.

## Loopet vi bygger

```
1. PICK     → systemet finder de bedst egnede leads (kvalitet, beauty-fokus, frisk)
2. RESEARCH → Claude undersøger hver lead: hjemmeside, Facebook/Instagram, Google,
              anmeldelser → trækker 1-2 ægte, specifikke kroge ud
3. DRAFT    → Claude skriver en menneskelig besked der bruger krogen — i din stemme,
              ingen robot-CTA
4. APPROVE  → du ser udkastene (digest/godkendelse) og sender — eller retter
5. SEND     → rigtig kanal (mail eller Messenger), pacet, personligt
6. LEARN    → svar/kunde registreres automatisk → feeder targeting
```

Pointen: trin 2-3 er præcis det du gør manuelt nu. Vi formaliserer det.

## Voice-overhaul — menneskelige beskeder

Alle nuværende skabeloner skal væk fra det robotagtige. Konkret:

- **Drop** "skriv hvis du vil se mere :)", "helt uforpligtende", "lille idé til …",
  to-demoer-i-hver-mail, og den generiske komplimentsætning.
- **Hver besked åbner med noget kun denne lead har** — fundet i research-trinnet.
- Variabel længde og formulering (ikke samme skelet hver gang).
- Codificér din stemme én gang som en voice-guide (der findes en brand-voice-skill til
  netop dette), så hver bespoke besked stadig lyder som dig.

**Før (nuværende skabelon):**
> Hej Salon X, Salon X ser ud til at have bygget noget særligt op i Aalborg. Jeg kiggede
> forbi jeres hjemmeside — den fungerer fint … Jeg har lavet et par demoer → linkA → linkB.
> Skriv hvis du vil høre mere. Lucas

**Efter (researchet, personlig):**
> Hej Maria! Faldt over jeres balayage-arbejde på Instagram — især det galleri I lagde op
> efter omdannelsen af salonen på Storegade ser virkelig skarpt ud. La' mig spørge: når folk
> finder jer dér, hvor sender I dem så hen for at booke? Jeg leger med websites ved siden af
> mit job og lavede den her til en anden salon [link] — tænkte jeres billeder ville stå vildt
> godt i sådan et udtryk. Mvh Lucas

## Research-værktøjskassen (det Claude bruger i trin 2)

- **Web:** hent hjemmeside (rigtig Chrome-UA, ikke LeadBot) → om-os, ydelser, tone.
- **Facebook/Instagram:** via Apify-aktørerne (allerede forbundet) — bio, seneste opslag,
  anmeldelser, åbningstider, "for nylig"-begivenheder. Her bor beauty-krogene.
- **Google:** anmeldelsestekster (hvad roser kunder dem for?), Google Business-profil.
- **Chrome-agent:** til JS-tunge sider Apify ikke får.
- Output pr. lead: 1-2 konkrete kroge + et "undgå"-flag (fx ny hjemmeside → spring over).

## Orkestrering — 3 forskellige idéer

**Idé 1 — Daglig personlig digest (mindst ny teknik).**
Som din messenger-digest, men hver morgen vælger Cowork fx 5-8 bedste leads, researcher dem,
skriver bespoke beskeder, og mailer dig en godkendelses-digest. Du sender fra mobilen. Bygger
direkte på det du allerede har og stoler på.

**Idé 2 — lead-system som MCP-motor + agent-loop (mest kraftfuld).**
lead-system bliver en MCP-server med værktøjer: `get_best_leads`, `research_lead`,
`draft_personal_message`, `queue_for_approval`, `register_client`. En Claude-agent kører
loopet og kalder værktøjerne. Én logik, ingen engangs-scripts. Det her er retningen du valgte.

**Idé 3 — "Skriv til X"-kommando (formalisér det du gør nu).**
Du skriver bare "skriv til [lead]" til Cowork; agenten gør research+udkast færdigt og lægger
det til godkendelse. Samme motor som idé 2, bare manuelt trigget i stedet for batch.

**Min anbefaling:** byg motoren (idé 2) én gang, og kør både den daglige digest (idé 1) og
"skriv til X" (idé 3) ovenpå den. Samme værktøjer, to måder at trigge på.

## Kanal & deliverability (Gmail-problemet)

- Færre + personlige mails = bedre levering næsten af sig selv (ingen blast-mønstre).
- **Beauty bør ofte gå via Messenger** — de bor på Facebook, og det er varmere end mail.
- Behold den gode List-Unsubscribe + pacing.
- På sigt: overvej en dedikeret afsender-strategi hvis volumen stiger igen, men det er ikke
  nødvendigt med den personlige, lav-volumen tilgang.

## Hvordan det passer ind i den valgte retning

Det her ER thin-motor + MCP-retningen — bare med den rigtige kerneopgave: **personlig
research + udkast**, ikke skabelon-blast. Vi rydder op i appen (fix ødelagt finder, dræb
død tracking), flytter logik ind i ét lag, og eksponerer det som MCP-værktøjer agenten kan
kalde.

## Foreslået sekvens

1. **Voice-guide:** codificér din stemme + de nye besked-principper (kort, genbrugeligt).
2. **Research-modul:** én funktion der researcher en lead (web+FB+Google) → kroge.
3. **Draft-modul:** krog + voice-guide → bespoke besked (+ validering: ingen pris, ingen robot-CTA).
4. **Godkendelses-digest:** daglig 5-8 personlige udkast til dig (idé 1).
5. **MCP-motor:** pak 2-4 som værktøjer + "skriv til X" (idé 2+3).
6. **Oprydning af appen** parallelt: fix finder, dræb tracking, konsolidér scripts.

## Næste skridt jeg foreslår
Før vi bygger: lad mig lave ét **live bevis-eksempel** — vælg en rigtig beauty-lead, lad mig
researche den (hjemmeside + FB + Google) og skrive den færdige personlige besked, så du ser
præcis hvad motoren vil producere. Så beslutter vi voice-guiden ud fra noget konkret.
