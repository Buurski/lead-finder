# Bundle E: Command Center faerdiggoer + trim (2026-07-02)

Status: FAERDIG. Branch `feat/bundle-e-cc-trim-2026-07-02` pushet, IKKE merget.
Preview: https://lead-finder-7sbuo3x52-buurskis-projects.vercel.app (deployment-protected, 307 til Vercel SSO er forventet)

## Hvad blev lavet

### 1. De 3 kerneflader er faerdige end-to-end

**/approve (godkendelse)**
- Skeleton-cards ved foerste load (foer: blank side).
- Fejl ved hentning viser nu et advarselskort med "Proev igen"-knap i stedet
  for den misvisende "Koeen er tom"-tomtilstand.
- Fejlbesked viser HTTP-status, saa man kan se hvad der gik galt.
- Manuel opdatering beholder listen paa skaermen (ingen skeleton-blink).
- Handlingsraekken wrapper paa smalle skaerme.

**/replies (svar-triage)**
- "Proev igen"-knap paa fejlkortet (ikke ved manglende Gmail-opsaetning,
  der er beskeden i stedet en opsaetningsguide).
- "Scan nu" viser en kort fejlnotits hvis scanningen fejler (foer: stille fejl).
  Notitsen rydder sig selv efter 8 sekunder.
- Tomtilstand og arm-live-send-flow var allerede paa plads og er beholdt.

**/leads**
- BulkEmailPanel taaler nu at status-hentningen fejler: viser "Kunne ikke
  hente mail-status" med "Proev igen" i stedet for en uhaandteret fejl.
- Tomtilstanden i LeadTable skelner mellem "ingen leads endnu" og "Sheets
  kunne ikke naas" (foer sagde den "klik Hent leads" under en Sheets-fejl).
- Follow-up-genvejen er fjernet (siden den pegede paa er arkiveret).
- Mobil: tabellen scroller vandret i stedet for at klippe.

### 2. Arkiverede sider (bevaret paa branch `archive/thin-pages-2026-07-02`)

Slettet fra main-linjen, historik intakt paa arkiv-branchen:
/radar, /sms, /spend, /memory, /build-guide, /followup-review, /journal.

Ogsaa slettet (foraeldreloest efter arkiveringen):
- /api/radar og /api/sms (kun brugt af de arkiverede sider)
- src/lib/radar.ts og src/lib/sms/* (kun brugt af de slettede routes)
- /api/email/send-followups (mistede sin eneste UI-indgang; en send-kapabel
  endpoint uden UI skal ikke ligge og flyde)
- FollowupReviewClient-komponenten

### 3. UI-trim

- Sidebar: 19 -> 8 punkter. Workspace: Mission Control, Godkendelse, Svar,
  Leads, Klienter. Self: SEO, Studio, Indstillinger.
- /leadgen, /messenger, /goals, /claude og /hermes findes stadig via direkte
  URL, men er ude af nav og kommandopalet (begge laeser nav-config).
- Mission Control: kun een primaer CTA til godkendelseskoeen (raekken i
  "Dagens opgaver"); koekortets fuldbredde-knap er nedgraderet til tekstlink.
- Doede links fjernet: /spend-alert og AI-forbrug-kortet linker ikke laengere
  til den arkiverede side (detaljer ligger inline paa Agents-fanen), journal-
  links erstattet med vault-stien, /claude-sidens Plan-historik-kort fjernet,
  chat-systemprompt henviser til de 8 rigtige sider.
- Faelles WarnBanner-komponent erstatter 4 duplikerede advarselskort.
- Tomtilstande tilfoejet paa Studio (branchefilter uden demoer) og Goals.

## Kvalitetsgates

- npm run build: groen.
- npm run lint: 0 fejl (9 forudgaaende fejl ryddet op undervejs; 11 harmloese
  warnings tilbage, alle forudgaaende).
- Council-review (3 linser) koert efter begge store dele; alle fund indarbejdet.

## Kendte forhold (ikke Bundle E)

- scripts/test_all.mjs: 5 suiter fejler paa forhaand paa origin/main
  (test_pipeline 1, test_reply 7, test_tone_mixer 2, test_compose og
  test_demo_render crasher). Fejlene ligger i compose/reply/demo-libs som
  Bundle E ikke roerer; ligner drift efter Charlie-sender-hybridarbejdet
  (signatur-forventninger). Boer tages som separat opgave.
- /goals naevnes stadig af chat-assistenten ved maal-kommandoer; siden findes
  men er ude af nav (bevidst, jf. scope-listen).

## Arkiv-gendannelse

En side kan hentes tilbage med:
`git checkout archive/thin-pages-2026-07-02 -- src/app/<side>`
