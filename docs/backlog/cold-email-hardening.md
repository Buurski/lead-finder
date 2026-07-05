# Backlog: Cold-email hardening (parkeret 2026-07-02)

Lucas' beslutning 2026-07-02: kold-email fungerer fint nu, ingen problemer.
Disse forbedringsideer gemmes til fremtiden, hvis der opstaar problemer
(faldende svarrate, spam-flag, klager, eller juridisk pres).

## Ideer (ikke prioriteret)

### 1. Segmentering
Del leads i segmenter (branche x by x score-baand) og styr volumen og
rotation per segment i stedet for én samlet pick. Giver jaevnere spredning
og goer det muligt at pause et segment, der performer daarligt, uden at
stoppe hele motoren.

### 2. Personalisering per score
Skaler personaliseringsdybden efter compositeScore: hoej score = fuld
research + Opus-lift + review-citat-opener; mellem = deterministisk varieret
skabelon; lav = kort neutral version eller slet ikke send. Sparer AI-omkostning
og koncentrerer kvaliteten der, hvor chancen er stoerst.

### 3. Synlig opt-out
Tilfoej en tydelig afmeld-linje i bunden af hver mail ("Svar 'nej tak' saa
skriver jeg ikke igen") + automatisk suppression naar nogen svarer negativt.
reply.ts klassificerer allerede inbound - koble klassifikationen direkte til
suppress-listen.

### 4. Per-by cooldown
Cooldown-vindue per by (fx max N mails per by per uge), saa smaa byer ikke
maettes og lokal snak ("alle i Ikast fik samme mail") undgaas. Kraever kun
en by-taeller i pick-loekken.

### 5. Konkurrent-gap-opener
Ny opener-type: "Jeres konkurrent X i [by] dukker op foer jer paa Google" -
baseret paa en hurtig Places/SERP-sammenligning i research-fasen. Hoej
relevans, men kraever omhu saa det ikke foeles som skraemmekampagne.

## Relateret

- Fuld audit 2026-07-02 noterede: kold email uden samtykke er problematisk
  ift. markedsfoeringsloven §10 (B2B e-mail kraever samtykke i DK). Hvis
  systemet skal skaleres, er den juridiske vinkel vigtigere end alle fem
  ideer ovenfor. SEO-tjek-tragten (Bundle C) er netop et samtykke-baseret
  alternativ: lead kommer selv, giver samtykke via formular.
