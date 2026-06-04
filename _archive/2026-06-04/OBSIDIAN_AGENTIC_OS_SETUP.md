# Obsidian + Agentic OS + YouTube — Setup-guide

> Mål: Tage YouTube-videoer (fx andres agentic-OS builds), få dem fordøjet
> automatisk, gemme dem som rene noter i Obsidian, og bruge dem som
> videns-/hukommelseslag for dit eget agentic OS — på en måde der senere kan
> deles med kollegaer uden at rode i resten.

---

## 1. Den mentale model: 3 lag

Du blander tre ting sammen lige nu. Hold dem adskilt, så bliver alt nemt:

| Lag | Værktøj | Job |
|-----|---------|-----|
| **Research / fordøjelse** | **NotebookLM** | Sluger MANGE videoer, transskriberer gratis, svarer med kildehenvisninger. "Hvad siger disse 12 videoer om X?" |
| **Hukommelse / viden** | **Obsidian (vault)** | Den permanente, søgbare arkiv. Én ren note pr. video + dine egne syntese-noter. Det er HER din viden bor. |
| **Eksekvering** | **Claude / dit agentic OS** | Læser vaulten, finder mønstre, bygger ting (din OS-twist, hjemmesider, automationer). |

Reglen: **NotebookLM fordøjer → Obsidian husker → Claude bygger.**
Ingen rå transskriptioner direkte ind i Claude (spild af tokens). Altid:
video → fordøjet note → derfra arbejder Claude.

---

## 2. Vault-struktur (sync-agnostisk, klar til kollegaer)

Lav én mappe = din vault. Læg den et neutralt sted (IKKE inde i kode-repoet
endnu — så er den nem at dele isoleret senere). Forslag:

```
KnowledgeOS/                  ← Obsidian-vaulten (åbn denne i Obsidian)
├── 00_Inbox/                 ← rå/nye noter lander her, ryddes løbende
├── 01_Sources/
│   └── YouTube/              ← én .md-note pr. video (atomare noter)
├── 02_Syntese/               ← dine egne tværgående noter ("Agentic OS-mønstre")
├── 03_Projekter/
│   └── Agentic-OS/           ← noter knyttet direkte til dit system
├── 90_Templates/             ← skabeloner (se afsnit 5)
└── 99_Meta/                  ← README, konventioner kollegaer skal følge
```

Hvorfor sådan: rene markdown-filer + mapper betyder at det er **ligegyldigt**
hvordan I deler senere (Git, Obsidian Sync eller delt drev) — strukturen
overlever alle tre. Beslut delingen når kollegaerne faktisk skal med.

> Til deling senere (kort): **Git/GitHub** er det rene valg for jer der bygger
> hjemmesider sammen (versioneret, gratis, Claude kan læse+skrive). Obsidian
> Sync hvis kollegaerne er ikke-tekniske. Undgå Dropbox/Drive til samtidige
> redigeringer — det giver sync-konflikter på .md-filer.

---

## 3. Det præcise flow (gør dette hver gang)

1. **Saml videoerne.** Læg alle YouTube-URLs til ét tema i en liste (fx 8–15
   videoer om "agentic OS / personal OS builds").
2. **Opret en notebook i NotebookLM** pr. tema. Indsæt alle URLs som kilder —
   NotebookLM transskriberer automatisk. (Op til ~300 kilder pr. notebook.)
3. **Stil målrettede spørgsmål** (ikke "opsummer alt"). Brug master-prompten i
   afsnit 6. Få fordøjede, kildehenviste svar ud.
4. **Gem som Obsidian-note.** Lav én note i `01_Sources/YouTube/` pr. video
   (eller én syntese-note pr. tema i `02_Syntese/`) med skabelonen i afsnit 5.
5. **Lad Claude/dit OS arbejde** fra `02_Syntese/` og `03_Projekter/` — aldrig
   fra de rå transskriptioner.

---

## 4. Tre måder at få YouTube ind på (vælg efter situation)

**A) NotebookLM-broen — bedst når du har MANGE videoer**
Mange URLs → én notebook → spørg på tværs → kopier de fordøjede svar til
Obsidian. Gratis, kildehenvist, ingen tokens brændt. Det er din standard når
du vil "undersøge hvor mange videoer jeg giver den".

**B) Web Clipper / plugin — bedst til ÉN video hurtigt**
- Obsidian **Web Clipper** eller **YTranscript**-plugin: trækker transskript
  direkte ind i en note med én kommando.
- Chrome-udvidelsen **youtube-to-obsidian**: gemmer videoen som markdown-note
  direkte i vaulten.
  Brug når du bare vil arkivere én video uden NotebookLM-rundtur.

**C) Claude-drevet (automatisk, inde i dit OS) — bedst når det skal skaleres**
- En **YouTube-transcript MCP** (fx `sinco-lab/mcp-youtube-transcript`) giver
  Claude direkte adgang til transskriptioner, så dit agentic OS selv kan hente
  + skrive noten ind i vaulten.
- Eller skill'en `BayramAnnakov/notebooklm-youtube-skill`, der styrer
  NotebookLM via browseren automatisk.
  Brug når flowet skal køre uden manuelle skridt (det er her dit "OS" giver mening).

> Anbefaling: Start med **A** (manuelt, lær hvad der virker), arkivér i Obsidian
> med skabelonen. Når mønsteret sidder, automatiser med **C** inde i systemet.

---

## 5. Note-skabelon (læg i `90_Templates/`)

```markdown
---
title:
url:
channel:
date_added: {{date}}
tags: [youtube, agentic-os]
status: inbox        # inbox | bearbejdet | syntetiseret
---

# {{title}}

**Kilde:** [link]({{url}}) — {{channel}}

## Kerneidé (1-3 sætninger)

## Nøglepointer
-

## Hvad er relevant for MIT agentic OS / Obsidian-setup
-

## Konkrete ting at afprøve
- [ ]

## Citater / tidsstempler
-

## Links til andre noter
-
```

Én note pr. video = du kan linke præcist til den fra andre noter og bygge
videns-grafen op (det er hele pointen med Obsidian).

---

## 6. Master-prompten (det du efterspurgte)

### 6a. Til NotebookLM — fordøj på tværs af mange videoer

> Kopier ind i NotebookLM-chatten når dine videoer er tilføjet som kilder:

```
Du analyserer [N] videoer om at bygge et personligt "agentic OS" og om at
bruge Obsidian som videnslag.

For HVER video, giv mig:
1. Kerneidé i max 3 sætninger.
2. De 3-5 vigtigste konkrete teknikker/værktøjer/arkitekturvalg de viser.
3. Hvad de bruger Obsidian (eller noter/hukommelse) til, hvis noget.
4. Hvad de bruger til at fange YouTube/eksternt indhold, hvis noget.

Til sidst, PÅ TVÆRS af alle videoer:
- Hvilke mønstre går igen? (rangér efter hvor ofte de nævnes)
- Hvor er de uenige?
- Hvad er de 5 mest "stjæl-værdige" idéer til et ÉN-persons system der senere
  skal kunne deles med 1-2 kollegaer?
Henvis til hvilken video hver pointe kommer fra.
```

### 6b. Til Claude / dit agentic OS — lav vault-klar note + udtræk til dit system

> Kopier NotebookLM-svaret ind og kør denne i Claude:

```
Her er fordøjede noter fra [N] YouTube-videoer om agentic OS + Obsidian
(indsæt NotebookLM-output nedenfor).

Lav to ting:

1) For hver video: skriv en færdig Obsidian-note efter denne skabelon
   [indsæt skabelonen fra afsnit 5]. Returnér som separate markdown-blokke
   jeg kan gemme direkte i 01_Sources/YouTube/.

2) Skriv ÉN syntese-note til 02_Syntese/ med titlen
   "Agentic-OS mønstre [dato]" der samler:
   - De tilbagevendende mønstre på tværs af videoerne
   - Konkret hvordan HVERT mønster kan oversættes til MIT setup
     (Obsidian-vault som videnslag + Claude som eksekvering + senere
     deling med kollegaer)
   - En prioriteret "byg-dette-først"-liste (max 5 punkter)
   - Hvad jeg bevidst skal IKKE-gøre / undgå

Skriv kort og konkret. Brug danske termer. Ingen fyld.

[NotebookLM-output her]
```

---

## 7. Hvordan kollegaerne kommer med (når I er klar)

- Hold vaulten som ren markdown (det gør du allerede med strukturen ovenfor).
- `99_Meta/README.md` = jeres "spilleregler": mappe-navngivning, hvornår en note
  flyttes fra Inbox, hvilke tags I bruger. Det er det der gør delingen rolig.
- Når I beslutter delingsmetode: bare flyt/init vaulten ind i det valgte system
  (Git-repo eller sync-mappe) — intet andet skal laves om.

---

## 8. Næste skridt (hvad jeg kan gøre for dig nu)

- Oprette hele `KnowledgeOS/`-mappestrukturen + skabelonen, klar til brug.
- Wire en YouTube-transcript-MCP ind, så dette Claude selv kan hente
  transskriptioner (måde C).
- Lave et færdigt `99_Meta/README.md` med jeres konventioner.

Sig til hvilken af dem du vil starte med.
