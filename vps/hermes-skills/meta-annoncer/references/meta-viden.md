# Meta-viden for Kinly (trin 1)

Kilde: KnowledgeOS/wiki/vaekst/ads-system-2026-10/ (09-BUDGET, 10-PLANER, 11-ANNONCE-STUDIE-PLAN). HQ's tal vinder ved uenighed.

## Budget (besluttet af Lucas 16/10)
- 150 kr/dag i 4 uger, ca. 4.200 kr. Kontoloft (spending limit) i Meta: 4.500 kr. Intet månedsloft.
- Mål: 300 kr pr. henvendelse (CPL). Højst 1.500 kr i annoncepenge pr. ny kunde.

## Hvad budgettet kan bære
- Forventet: ca. 10-15 henvendelser på 4 uger. Meta "lærer" først ved ca. 50 konverteringer om ugen, så det sker ikke her.
- Derfor: test kun 2-3 MEGET forskellige annoncer ad gangen, i 14-21 dage. Mange næsten ens udgaver kan ikke skelnes.
- Opsætning: ABO (budget pr. annoncegruppe), én annoncegruppe pr. annonce, samme budget, bred målgruppe, hele Danmark.

## Stopregler (samme i HQ, i annonce_tests.py og her)
- Pause en annonce, der har brugt 600 kr uden en eneste henvendelse.
- Pause en annonce, der har brugt 1.200 kr med højst én henvendelse.
- Ingen dom, før hver annonce har brugt 600 kr.
- "Sikker vinder" kræver mindst 6 henvendelser i alt og p under 0,1 (HQ regner det). Ellers er forskellen måske held.
- Ret ikke i budgettet de første 7 dage (nulstiller Metas læring). Pause er ok.

## Efter 4 uger
- 3+ kunder: fortsæt og voks.
- 1-2 kunder: én runde mere med bedste annonce (nyt loft = forbrug + 4.500 kr).
- Over 600 kr pr. henvendelse og under 30 % rigtige emner, eller 0 kunder efter to runder: stop Meta for Kinly.

## Opsætning Lucas selv skal lave (før første krone)
- Meta Business-konto + annoncekonto med kontoloft 4.500 kr og betalingskort.
- Kinlys Facebook-side og Instagram uden privatadresse.
- Instant Form: navn, telefon, firmanavn, nuværende hjemmeside. Link til privatlivspolitik på kinly.dk.
- Placering: kun Facebook og Instagram. Audience Network og "creative enhancements" slået fra.
- Ring henvendelser op inden for 1-2 timer. Over 4 ubesvarede: sæt kampagnen på pause.

## Annoncerne
- Laves i HQ's Annonce-studie (GPT Image-skabelon + rigtige kinly.dk-skærme). Godkendelse er bundet til billede + tekst + knap: ændres én ting, skal den godkendes igen.
- Meta sætter muligvis et "AI-info"-mærke på billederne. Det er ok.
- Tekster: ingen tal uden kilde, priser altid "ekskl. moms", aldrig "garanti", "bedst", "billigst", "binding", "1-2 uger".
- Første test (forslag, Lucas afgør): hånd med telefon (priser) mod pris i mørk stil mod gratis udkast.
