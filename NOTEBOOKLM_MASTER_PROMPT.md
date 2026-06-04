# NotebookLM master-prompt — udvind viden om Obsidian + Agentic OS

> Brug: Tilføj alle dine YouTube-videoer som kilder i ÉN NotebookLM-notebook.
> Indsæt så prompten nedenfor i chatten. Den udvinder ren, sammenlignelig viden.
>
> Mål: jeg + én ven bygger et Obsidian + agentic OS-setup sammen, og kobler det
> senere til mit eget produkt (lead-system).
>
> NÆSTE TRIN (ikke nu): Når du har NotebookLM-outputtet, laver Claude en
> separat "oversæt-til-mit-lead-system"-master-prompt der bruger både dette
> output og din systemkontekst.

---

```
Du er min research-analytiker. Disse kilder er YouTube-videoer om (a) at bygge
et personligt "agentic OS" og (b) at bruge Obsidian som videns-/hukommelseslag
for et AI-system. Mit mål: jeg + én ven skal bygge sådan et setup sammen, og
senere koble det til mit eget produkt. Svar KUN ud fra kilderne, og angiv ved
hver pointe hvilken video den kommer fra. Skriv på dansk, kort og konkret.

Giv mig svaret i FEM dele:

DEL 1 — PR. VIDEO (én blok pr. video):
- Kerneidé i max 3 sætninger.
- NAVNGIVEN METODE/FRAMEWORK de følger, hvis nogen (fx PARA, Zettelkasten,
  Kepano/ACE, "second brain", LYT/MOC, eller en de selv har navngivet) — skriv
  navnet og hvad det går ud på ifølge dem.
- Stack/værktøjer de bruger (apps, plugins, modeller, MCP'er, automationer,
  evt. specifikke Claude-skills eller andre AI-skills).
- Hvad bruger de Obsidian til konkret? (mappestruktur, plugins, templates,
  hvordan AI'en læser/skriver i vaulten).
- EKSAKT FREMGANGSMÅDE: hvordan byggede de setup'et, trin for trin, så præcist
  kilden tillader (rækkefølge, hvad de satte op først, indstillinger).
- Hvordan er "agenten/OS'et" wired? (hvad trigger hvad, hvor bor hukommelsen,
  hvad eksekverer).
- Nævner de noget om SAMARBEJDE / flere brugere / deling af vault? Hvad?

DEL 2 — MØNSTRE PÅ TVÆRS:
- Hvilke fremgangsmåder går igen i flere videoer? Rangér efter hvor mange
  kilder der nævner dem, og skriv hvilke videoer.
- Hvilke NAVNGIVNE METODER/FRAMEWORKS går igen? Rangér efter popularitet på
  tværs af kilderne, og hvilke videoer der bruger hver.
- Hvor er kilderne UENIGE eller modsiger hinanden?
- Hvad nævnes kun i én kilde, men virker værdifuldt? (marker som "kun 1 kilde").

DEL 3 — SETUP-BLUEPRINT FOR ET 1-2 PERSONERS TEAM:
- Den mest anbefalede måde at opbygge vault + agentic OS på, samlet til ÉN
  konkret, trin-for-trin opskrift vi to kan følge (hvilken navngiven metode den
  bygger på, og hvorfor).
- Hvordan deler/synkroniserer man vaulten mellem to personer ifølge kilderne?
  (Git, Obsidian Sync, andet — med fordele/ulemper de nævner).
- Hvilke konventioner/spilleregler anbefaler de for at flere kan arbejde i
  samme vault uden kaos?

DEL 4 — VÆRKTØJSLISTE:
- Alle nævnte plugins, MCP'er, udvidelser og tjenester, i en liste, hver med:
  hvad det gør + hvilken video + om det er gratis/betalt (hvis nævnt).

DEL 5 — FALDGRUBER & ÅBNE SPØRGSMÅL:
- Fejl/anti-mønstre kilderne advarer imod.
- De 5 vigtigste beslutninger vi skal tage FØR vi bygger, baseret på hvor
  kilderne er uenige eller tier.

DEL 6 — VÆSENTLIGT, JEG IKKE HAR SPURGT OM:
- Alt andet i kilderne der er virkelig væsentligt eller kan gøre dette projekt
  bedre, men som ikke passer ind i delene ovenfor. Tag det med her — guldkorn,
  smarte tricks, advarsler, idéer, ressourcer eller indsigter jeg ville have
  glæde af. Angiv hvilken video hver ting kommer fra, og hvorfor det er relevant
  for et lille, personligt agentic OS bygget i Obsidian.

Til sidst: én "stjæl-disse-5-idéer"-liste — de mest værdifulde, konkrete ting
at kopiere til et lille, personligt system der senere skal kobles til et
eksisterende produkt.
```

---

## Tips til NotebookLM

- Smid hellere for mange end for få videoer ind — den brænder ingen tokens på at
  indeksere, og DEL 2 (mønstre på tværs) bliver bedre jo flere kilder.
- Hvis svaret bliver for langt/overfladisk: kør delene én ad gangen (bed kun om
  DEL 1, så DEL 2, osv.).
- Gem hele outputtet — det er input til Claude-prompten i næste trin.
