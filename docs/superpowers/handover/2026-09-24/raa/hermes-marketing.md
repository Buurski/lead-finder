Handover fra marketing-profilen. Alt nedenstående er læst ud af mine egne filer, sessions-databasen, kanban-boardet og git i denne kørsel — ingen gæt. Intet er sendt udad, intet er ændret.

1. IDÉEN

Mit område er "blive fundet og valgt" for kinly.dk og for Kinlys kunder: SEO, GEO/AI-søgning, Google Ads, Google Business Profile, social. Målet er ikke trafik — det er telefonen der ringer. Kæden er: nogen søger lokalt eller spørger en AI → møder os i Google/AI-svaret → lander på /seo-tjek/ eller /hvad-koster-en-hjemmeside/ → kontakter os → Lucas svarer med tre-punkter-løftet. Pengene kommer fra opsætning (3.997/4.997 kr) + Hjemmesidepas (fra 479 kr/md).

Det store initiativ de sidste dage er /blog på kinly.dk: 4 opslag/md, story-drevet, men i praksis en GEO-maskine — korte klare svar, rigtige tal, kilde pr. påstand, så både Google og ChatGPT kan gengive os. Udgivelse skal ske via CRM: jeg skriver kladden, Lucas godkender i lead-systemet, et job udgiver. Jeg skriver aldrig selv ud.

2. LAVET (10 dage)

kinly.dk (repo /root/kinly-site, main):
- Responsive billeder/srcset: d8dddfc + 848d5c8, merget ac09ad1 (22-09). Målt før/efter 390x844 DPR3: forsiden hentede ~530 KB billeder, 18 af 23 for store. Note: wiki/kinly/forside-vaegt-2026-09-22.md.
- Webp-fix på bysiderne: ea36ee3, merget 080f1e7 (24-09). Live-verificeret: 480/960/1440w serveres.
- PostHog: capture_pageleave + web_vitals (60b5179, 937adde, merget 0199c91) og cookieless indtil samtykke (3b6a5fe, 3a662ed). Verificeret 24-09 med fjerde uafhængige måling; kort t_f2bafddb lukket. Note: wiki/kinly/posthog-sundhedstjek-2026-09-22.md.
- Forsidens priser strømlinet: 6342fb6 (24-09 17:50). LIVE bekræftet i dag: gamle "hvad er inkluderet" er væk, ny `border-ember/40` findes i HTML'en.
- /seo-tjek/-rettelser: a112886 (relative links), 2c2383e (CVR-format), 2180837 (cap 97), 9cd5f9a (neutrale checks, Maps-links valideres). Live.
- SEO B2B-navne + noindex på Aalborg/Aarhus-bølge: 84a90c5, merget 9e41aa0.
- /billig-hjemmeside/ og nationale undersider: 0e83cd5, 22cb250, 2aea569 + interne links 322ca5c/769f3d4.
- /blog: gren agent/0924-blog-kinly-site (0b3df4e, ca32685), reviewet i 4 slices; pilot-opslag rettet til noindex i 539ca32/5f13f0f på agent/0924-1746-kinly-site. IKKE merget. https://kinly.dk/blog/ svarer 404 i dag.

Kunder:
- VIDA: 3 behandlingssider live (783425e), nav-rettelse (de01e80), forside-fix (4c0df5a), titel/meta (4f038e8), Maps-link (3babcaa). Svar-kladde til Lene ligger i drafts/.
- Ikast AutoService: case-side + "Sider vi byggede" (bad46a3), GSC-baseline (t_b441fbc2), står 2/2 i GEO-målingen.
- KT VVS: case-rute (48a68e7).

Indhold og planer: tre blogkladder er færdige og maskin-grønne i /root/KnowledgeOS/drafts/blog/ — artikel 1 "SEO der sælger" (1.399 ord), artikel 2 "Billigste og bedste webbureau" (1.367), artikel 3 "Bliver din virksomhed nævnt af ChatGPT" (1.398). Alle med 6 råd + council, efterkontrol og kilde-tjek (BrightLocal-83 %-tallet er udeladt, fordi det ikke findes i originalen). Plan og spec: wiki/kinly/blog-plan-2026-09-24.md, wiki/kinly/blog-pipeline-spec-2026-09-24.md, wiki/kinly/blog-konkurrent-scan.md. Grafer i drafts/blog/assets-20260924/.

Målinger: wiki/kinly/geo-log.md (22-09: 6/12, 24-09: 6/12; Ikast 2/2, VIDA 1/2). Ugekort 23-09: "webbureau herning" 9,4 → 8,2, stadig 0 klik; 28 dage = 16 målte besøg, 0 kontaktklik, 0 formularer.

3. MANGLER (prioriteret)

1. /blog er 404. Hele blog-cyklussen står stille: kort t_08a3b8b7 (default) er blocked, og de tre kladder kan ikke udgives før den er live. Kræver Lucas' go-live.
2. Lucas' SKAL TJEKKES-svar på alle tre kladder + flaget BLOG_PUBLISH_LIVE=1 + beslutning om mailadresse i CTA. Punkterne står i kladdernes bund.
3. CRM-pipelinen i lead-system: review af B (t_2a875736, AFVIST → fix-kort t_8b1461a7 kører), derefter B2 (scores/scanReport), C (UI-board), E2E-gate (t_6135e505) og udgiver-job (t_784ba422). Kontrakterne ligger som kommentarer på t_91d3080f og t_784ba422.
4. Artikel 3 mangler én dateret egen måling — Perplexity/Google/ChatGPT blokerer VPS'ens IP. Skal køres fra Lucas' telefon; intet fiktivt tal er indsat.
5. GBP: opslag indsendt 24-09 afventer Google; loggen data/gbp-opslag.md skal opdateres når det er live. Kort t_e727b67f (5+ anmeldelser → /anmeldelser/ + Review-schema) er blocked på Lucas.
6. CVR → whNap/NAP-citations (t_1c3e7458, blocked, kræver CVR).
7. t_37678d3d: mål "webbureau herning" uden for Jev-totalen (confidence 0,55 gør totalen ulæselig).

4. PROBLEMER

- Jeg er selv blevet flaskehalsen. Blog-kæden er serialiseret (én tung kørsel ad gangen pga. RAM), og to reviews gav AFVIST (s4: pilot-opslag blev 404; B4: menneskets A/B-valg kunne omgås). Hver afvisning koster ca. et døgn. Min "færdig i morgen"-melding til Lucas holdt ikke.
- Full npm test kan ikke køre i én kørsel: 46 filer/~440 kald, ~24 s pr. test = 1-3 timer, mens workerens terminal har 420 s og kode.sh 25 min. Den ligger nu som krav i E2E-gaten. Det er en ærlig udskydelse, ikke en løsning.
- GEO-citation-loopet fejlede 21-09 med "KnowledgeOS har lokale ændringer; GEO-log blev ikke skrevet" (fail-closed). Den kører igen 28-09 08:20 og fejler igen, hvis vaulten er beskidt netop da.
- Tallene kan ikke bære en konklusion: 16 målte besøg, 0 kontaktklik, 0 formularer på 28 dage. Jeg kan vise positioner, ikke kunder.
- Blog-rangering er en hypotese, ikke et resultat. 4 opslag/md er endnu ikke målt på én eneste henvendelse.
- Betalt er helt ude: Google Ads-kontoen er bevidst lukket. Alt jeg kan vise er organisk + GEO.
- /root/.hermes/state/prod-env-decoded.env og .json ligger dekodet på disk (mode 600). Jeg har ikke læst dem. Bør flyttes eller slettes.
- To next-server-processer lyttede på 0.0.0.0:3210 og :4317 fra blogarbejdet — åbne porte.
- mine mandags-kæder (seo-drift-ugentlig, kinly-signal-ugentlig) har aldrig kørt endnu; seneste signal-fil er 23-09 16:15. Næste rigtige kørsel er 28-09.

5. KØRENDE AUTOMATIK

Min profil (4 jobs i /root/.hermes/profiles/marketing/cron/jobs.json):
- uge-marketing, "0 9 * * 3" (bash → kanban-kort til mig, ingen model). Sidst 23-09 ok. Næste 30-09. Leverer til Lucas' Telegram.
- maaned-marketing, "0 10 1 * *". Sidst 01-09 FEJL ("script not found"); scriptet ligger nu i scripts/ og er aldrig kørt. Næste 01-10 — uverificeret.
- agent-blog-cyklus, "0 8 * * 1", deepseek-v4-flash. Har aldrig kørt. Første kørsel 28-09 08:00.
- agent-posthog-pageleave-verifikation: engangsjob, kørt 24-09 ok, afsluttet.

Skriver til CRM: ikke mig. agent-leadgen-daglig kører 06:00 (ok 24-09 06:01) → data/leadgen.json → Vercel-ingest 06:30 → CRM-kø; leadgen-watchdog hver 6. time. crm-mail-sync og inbox-digest-sync er slået fra (release-gate: grøn 0-send-gate mangler). Jeg læser kun.

6. AFHÆNGIGHEDER

Fra Lucas: (1) go-live af /blog + BLOG_PUBLISH_LIVE=1, (2) SKAL TJEKKES-svar på artikel 1-3, (3) opdater GBP-loggen når opslaget er godkendt, og CVR til t_1c3e7458, (4) køre artikel 3-målingen fra telefonen.
Fra Charlie/default: B→B2→C→E2E i lead-system (kort-id'erne i punkt 3.3) og merge af /blog-grenen efter review.

Claude Code må ikke røre: drafts/blog/* (Lucas retter selv), data/gbp-opslag.md, mine scripts og cron-jobs i /root/.hermes/profiles/marketing/, samt lead-systemets /replies- og Svar-side-filer (låst i alle B-kontrakter). Og som altid: kinly.dk's hero, priser og cookie-tekst er Lucas' alene.

7. FORSLAG

1. Få /blog live før der skrives kladde nummer fire — 3 kladder er klar, 0 kan udgives. Pris: 0 kr., kræver Lucas' tryk. Risiko ved at vente: fire uger mere uden et målepunkt.
2. Slå agent-blog-cyklus fra indtil /blog er live (0 8 * * 1 vil ellers lave kladde #4 oveni tre uudgivne).
3. Gør GEO-loopet selv-committende, og ryd vaulten senest søndag, så mandagens 08:20-kørsel ikke fejler igen på beskidt træ.
4. Giv hver artikel sin egen indgangssti, så CRM og GSC kan vise om 4 opslag/md overhovedet giver henvendelser, før vi skalerer kadencen.
Fjern: blog-drafter-nat og authority-sprint-daglig (begge slået fra, ingen værdi), og arkivér wiki/kinly/viden-sektion-forslag-2026-09-24.md — den er afløst af /blog.

Næste handling for dig: læs bunden af de tre filer i drafts/blog/ — de indeholder præcis de beslutninger, der blokerer udgivelsen.
