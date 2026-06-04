# START HER — Din Obsidian + Agentic OS (Fase 0)

> Bygget ud fra dine 12 NotebookLM-kilder **og** dine faktiske filer
> (lead-system, freelance-playbook, klient-websites). Princippet fra videoerne:
> **start minimalt, lad det vokse naturligt.** Du bygger en "hjerne" der husker
> og lærer over tid — ikke et kæmpe system på dag 1.
>
> Vault'en er **selvstændig** (eget repo senere), så den kan rumme HELE din
> verden — lead-jagt, klient-websites, playbook, læring — og deles med din ven
> uden at give ham hele din kodebase.

---

## Sådan er det tænkt (3 lag — hold dem adskilt)

- **Obsidian = hjernen/hukommelsen.** Her bor al viden som markdown.
- **Cowork (her) = cockpittet.** Her *gør* du tingene; Claude læser/skriver i vault'en.
- **VS Code/Claude Code = værkstedet.** Kun når vi rører kode (lead-system, sites).
- *(Senere: Hermes = den mobile hånd. Ikke nu.)*

---

# DEL A — Minimum Viable Setup (gør DETTE først)

Ifølge dine kilder er dette nok til at have en fungerende "hjerne". Lav kun det her i første omgang.

### Trin 1 — Installér Obsidian
Hent og installér Obsidian (gratis, obsidian.md). Claude Desktop/Cowork har du allerede. Det er hele "hardware/software"-kravet.

### Trin 2 — Lav vault-mappen (selvstændig)
Opret én ny, tom mappe:
```
C:\Users\Buur\Documents\KnowledgeOS
```
**Ikke** inde i lead-system. I Obsidian: "Open folder as vault" → vælg `KnowledgeOS`.

### Trin 3 — Opret KUN disse undermapper (hold det fladt)
```
KnowledgeOS\
├── raw\        ← rå kilder (video-noter, PDF'er, web-klip). AI'en ændrer dem ALDRIG.
├── wiki\       ← her skriver AI'en struktureret viden
├── context\    ← stabile fakta om dig + din forretning
└── daily\      ← daglige logs / briefinger
```
> Begynderfejl #1 fra videoerne: at bygge 50 undermapper på dag 1. Lad være. Disse fire er nok — strukturen vokser af sig selv.

### Trin 4 — Opret `claude.md` i roden af vault'en
Det er "regelsættet" der fortæller AI'en hvordan den må arbejde i vault'en. Opret filen `KnowledgeOS\claude.md` og indsæt:

```markdown
# claude.md — regler for denne vault

Dette er Lucas' videns-vault ("KnowledgeOS") — hukommelseslaget for et personligt
agentic OS. Du (AI'en) læser og skriver her efter disse regler.

## Mapper
- raw/      = rå, ubehandlede kilder. LÆS herfra, ÆNDRE dem ALDRIG.
- wiki/     = struktureret viden DU skriver. Atomare noter, én idé pr. fil.
- context/  = stabile fakta om Lucas og forretningen. Læs altid disse først.
- daily/    = daglige logs og briefinger (filnavn: YYYY-MM-DD.md).

## Skrive-konventioner
- Markdown, filnavne i kebab-case (fx kunde-jernbanecafeen.md).
- Hver note starter med YAML-frontmatter: title, tags, status, date, author.
- Lav links mellem noter med [[wikilinks]].
- Hold noter korte og atomare. Én note = én ting.

## Adfærd
- Læs context/ før du svarer på noget om Lucas eller forretningen.
- Find aldrig på fakta. Hvis noget mangler, skriv "[ukendt]" og spørg.
- Når du laver en wiki-note fra en raw-kilde: opsummér, strukturér, og link til kilden.
- Spørg ALTID før du sletter eller omskriver noget væsentligt.
- Skriv på dansk medmindre andet er nævnt.

## Hygiejne
- Én gang om ugen: "lint" vault'en — find dubletter, modstridende noter og døde links, og foreslå oprydning.
```

### Trin 5 — Opret dine context-filer (dette er guldet)
Disse gør AI'en til en der *kender* dig. Opret de to filer og indsæt — de er fyldt ud ud fra dine egne filer, ret hvad der ikke passer.

**`KnowledgeOS\context\about_business.md`:**
```markdown
---
title: Om forretningen
tags: [context, business]
status: stable
date: 2026-06-03
author: Lucas
---

# Forretningen

Solo web-freelancer, dansk marked, Ikast/Herning-området. Finder lokale
virksomheder som leads, bygger hjemmesider til dem, og kører løbende drift/social.

## Hvem er kunderne
Lokale virksomheder: restauranter/cafeer, skønhed/salon (frisør, negle, hudpleje,
barber, klinik), håndværkere, malere — mix, med skønhed vægtet op. Eksempel-kunder
til dato: Jernbanecafeen, denlillemaler, Buurfoto, ktvvs, MidtAdvokaterne.

## Sådan finder jeg kunder
Lead-system (Next.js + Google Sheets): scraper Google Places → scorer → finder
emails → fylder en godkendelses-kø. Motoren SENDER aldrig selv; jeg godkender.

## Pakker (første-kunde-priser, justeres op pr. ny kunde)
- Pakke 1 (Basis): forside + 4 undersider. 4.500 kr + 500/md.
- Pakke 2 (CMS-menu): + selv-opdaterbart område (Notion/Sheets backend). 6.000 kr + 500/md.
- Pakke 3 (Fuld): + sæson-system + social media. 7.500 kr + 1.500/md.

## Vigtigt
- Kører som privatperson (ingen CVR/moms) indtil ~50.000 kr/år, så registreres enkeltmandsvirksomhed.
- Tone over for kunder: afslappet, personlig, ikke corporate.
- Værktøjer: lead-system, Google Sheets, Notion, OneNote, Gmail (buur.aigro@gmail.com).
```

**`KnowledgeOS\context\about_me.md`:**
```markdown
---
title: Om Lucas
tags: [context, me]
status: stable
date: 2026-06-03
author: Lucas
---

# Lucas

Solo web-freelancer. Bygger et personligt agentic OS sammen med én ven (som
senere skal have adgang til det fælles).

## Arbejdsstil / præferencer
- Kort og direkte. Ingen unødig fyld.
- Foretrækker rolige, "rum-agtige", personlige systemer — ikke corporate dashboards.
- Hastighed over pynt. Klarhed over smarthed. Kvalitet og følelse over feature-antal.

## Hvor jeg arbejder
- Cowork (cockpit) til at gøre tingene.
- Obsidian (denne vault) som hjerne/hukommelse.
- VS Code/Claude Code når jeg rører kode (lead-system, klient-sites).

## Mål med systemet
Finde kunder, sende mails/messenger, holde styr på klient-projekter, fange
produkt-/system-idéer, og blive bedre over tid — alt sammen med én delt hukommelse.
```

### Trin 6 — Opret `soul.md` i roden (vibe'en)
Denne giver systemet din "sjæl", så alt det skriver føles som dig.

**`KnowledgeOS\soul.md`:**
```markdown
# soul.md — tonen i alt

Rolig, personlig, varm. Aldrig corporate. Skriv som en dygtig ven, ikke et bureau.
Dansk. Kort frem for langt. Vis ikke frem — vær præcis og brugbar.
Behandl AI'en som en mentor man giver feedback til, ikke en automat.
```

### Trin 7 — Første "ingest" (giv hjernen dens første viden)
1. Kopiér din `freelancewebplaybook.md` ind i `KnowledgeOS\raw\`.
2. Sig til Claude (her i Cowork, med vault'en åben):
   > "Læs `raw/freelancewebplaybook.md` og lav en struktureret wiki-note i `wiki/` efter reglerne i `claude.md`. Link til kilden."
3. Tjek resultatet i `wiki\`. **Nu har du en hjerne der husker.** Det er Fase 0 færdig.

---

# DEL B — Næste lag (i denne rækkefølge, SENERE)

Lav først Del A og brug den et par dage. Udvid så herfra, ét trin ad gangen:

1. **GitHub-handshake (når din ven skal med):** gør `KnowledgeOS` til et privat
   GitHub-repo + installér **Obsidian Git**-pluginnet (auto-push). Det giver
   backup, versionering og sync mellem jer to (og senere agenterne).
2. **Første "hånd" (connection):** forbind ÉT værktøj — fx Google Calendar eller
   lead-systemets Sheets — så AI'en kan handle, ikke kun læse.
3. **Daglig brief:** en scheduled task der hver morgen skriver dagens leads +
   klient-status til `daily\`. (Du har allerede `COMMAND_CENTER_VISION.md` §5 + scheduled tasks at bygge på.)
4. **Hermes (mobil):** den mobile agent på Telegram, der deler samme vault via
   GitHub. Først når fundamentet står.
5. **Personas (Pantheon) + Dreaming:** specialiserede roller og en nat-opgave der
   gennemgår dagens noter. Sidst.

---

# De 5 regler du IKKE må bryde (fra kilderne)

1. **Ingen API-nøgler i chatten** — kun i `.env`/miljøvariabler.
2. **Undgå over-organisering** — lad strukturen vokse, byg ikke 50 mapper på forhånd.
3. **Hold hukommelsen frisk** — kør ugentlig "lint"; gamle modstridende noter = #1 årsag til fejl.
4. **Pas på token-eksplosion** — giv ikke AI'en for mange store filer på én gang.
5. **Mentor, ikke automat** — giv feedback og ret systemet til over tid.

---

## Hvad jeg kan gøre, så snart du siger til
- Få NotebookLM til selv at **søge nye web-kilder** og berige notebook'en (du bad om det).
- **Scaffolde** hele `KnowledgeOS`-mappen med filerne ovenfor klar (hvis du hellere vil have den serveret end at lave den selv).
- Trække de tre dybe opfølgninger ud af din notebook: **4 C's/3 M's**, **schema-laget**, **Dreaming**.
```
