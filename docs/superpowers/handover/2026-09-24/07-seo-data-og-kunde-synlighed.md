# 07 — SEO-data på kunderne, kunde-kort på kinly.dk, resultater på forsiden

Lucas 25/9: "SEO-data for kunderne (fx Ikast AutoService) inde på deres profil. Kort for kunderne på
kinly.dk/projekter, visuelt, de steder hvor det hører til. Lidt SEO-data, grafer eller lignende på forsiden om os
og vores kunder. **Kun det der er fedt, brugbart og væsentligt.**"

Grundregel: **kun rigtige, verificerede tal, og kun med kundens accept før noget offentligt.** Et forkert eller
pustet tal på kinly.dk koster mere tillid end det giver. Vis hellere ét stærkt tal end en graf med støj.

## PRÆCISERING fra Lucas 25/9 (vinder over resten af filen hvor de er uenige)

**A. "Kort" = i HQ, ikke på kinly.dk.** `/kunder` skal ligne kinly.dk/projekter: kun vores rigtige kunder som
store visuelle kort (site-screenshot/mockup, navn, branche, by, status-linje), ikke alle 1.400+ virksomheder.
Faner øverst for resten. Forslag (vurdér og skær hvis det er for meget):
`Kunder` (standard) · `Varme` (svaret/interesseret/gratis udkast i gang — dem der kan blive kunder nu) ·
`Leads` (kontaktet/nye) · `Ikke egnet` (fravalgt/arkiv). Tæller pr. fane. Samme kort-komponent i alle faner, men
leads får mindre kort/liste når der er mange. Bygget som første udkast af Codex på feature (`/kunder` +
`CustomerPreview`, faner Kunder | Alle virksomheder) — **uverificeret**; ret det til ovenstående og screenshot-tjek
på rigtige data (desktop + 390 px). Screenshots via thum.io er en ekstern afhængighed → cache dem (Blob, privat)
eller brug egne mockups fra kinly.dk-casesiderne.

**B. "Tal" = grafer.** På kundeprofilen: en rolig graf over Google-visninger/klik (GSC, 90 dage) med markering af
hvornår vi leverede/ændrede noget (fra arbejdsloggen) — det viser effekten af vores arbejde. Plus små sparklines for
anmeldelser og AI-omtale. På HQ: én samlet graf "kunders synlighed i alt" højst. Kritisk: grafer kun hvor der er
nok datapunkter (≥4 målinger); ellers tal + "for lidt data endnu". Brug `dataviz`-skillen.

**C. SEO flyttes til sin egen sektion og gøres dybere med Jev.** Ikke gemt under "Mere". Egen nav-post `SEO`
med faner: `Overblik` (alle kunder + kinly.dk, grafer) · `Pr. kunde` (dybt: søgninger, positioner, sider, AI-omtale,
teknik) · `Opdateringer` · `Værktøjer` (seo-tjek m.m.).
- **"Opdateringer" = et feed pr. uge og pr. kunde:** "Ikast: 'autoværksted ikast' steg fra plads 9 → 4", "VIDA: ny
  side for microneedling indekseret", "KT VVS: PageSpeed faldt 20 point efter billedskift". Genereres af en ugentlig
  cron: GSC-diff + seo-snapshot-diff + GEO-log → **Jev dømmer hvad der er væsentligt** (score, kategori, "kræver handling?")
  → kun de væsentlige bliver til opdateringer; "kræver handling" bliver til en opgave i Opgaver. Samme feed kan
  bruges som råstof til kundeopdaterings-kladder ("Nu har vi lavet det her for dig").
- **Jev-brug (billigt, typed):** rangér muligheder (søgninger på plads 8–20 med visninger = lavthængende frugt),
  match side ↔ søgeintention, klassificér ændringer, vurdér om en blogidé rammer en kundes søgeord. Jev er rådgiver,
  aldrig beslutter (51 %-træfsikkerhed på mailkategorier 24/9 → kalibrér før tallene vises som sandhed).
- Kinly.dk's egne tal hører også her (ikke på forsiden) indtil de er stærke.
- Datakilder: GSC via service-account (ikke Composio), PageSpeed (nøgle findes), GEO fra Hermes marketing via
  `/api/agent/*`. Koordinér med Hermes marketing, som allerede måler GEO ugentligt — ingen dobbeltmålinger.

## 1. SEO-data på kundeprofilen i HQ (internt — højeste værdi)

I dag (feature, uverificeret): `/seo` + et Overblik-kort med PageSpeed/on-page-score (ugentlig cron `seo-snapshot`).
Det måler teknik, ikke om kunden bliver fundet. Det Lucas og Charlie har brug for pr. kunde er:

| Tal | Kilde | Hvorfor |
|---|---|---|
| Google-visninger + klik (28 d) med trend | **Google Search Console API** | Bevis for at siden bliver fundet; bruges i kundeopdateringer og fornyelse |
| Top-5 søgninger med gennemsnitsposition (fx "autoværksted ikast") | GSC | Konkret og forståeligt for kunden |
| AI-/GEO-omtale (nævnt i ChatGPT/Perplexity/Google AI: ja/nej pr. testspørgsmål) | Hermes marketings `wiki/kinly/geo-log.md` (Ikast 2/2, VIDA 1/2 den 24/9) | Kinlys differentiering |
| Google-profil: anmeldelser (antal/snit) + ændring | Places (billige felter) eller GBP | Driver lokale opkald |
| Teknisk sundhed (PageSpeed, SSL, oppe) | findes (site-health + seo-snapshot) | Kun som advarsel, ikke hovedtal |

**Plan:** GSC via service-account (ikke Composio — prod-regel): `GOOGLE_SERVICE_ACCOUNT_JSON` findes allerede i
Vercel; Lucas tilføjer service-accountens mail som *begrænset bruger* på hver kundes GSC-ejendom (Ikast har
GSC-baseline, kort t_b441fbc2). Ugentlig cron `gsc-snapshot` → tabel (ny migration EFTER 0010/blog-rækkefølgen,
aftal nummer med Hermes) → Overblik-kortet "Bliver fundet": 3 tal + sparkline + top-søgninger + "sidst målt".
GEO-tal: Hermes skriver dem via `/api/agent/*` (ny `seo`-handling) i stedet for at HQ scraper AI-svar.
**Færdig når:** Ikast-profilen viser rigtige GSC-tal for de seneste 28 dage, med dato, og tallene matcher GSC-UI'et.

## 2. Kunde-kort på kinly.dk/projekter (offentligt — social proof)

`/projekter/` findes (footer "Arbejde"), og case-sider findes for VIDA, Ikast, Jernbanecaféen og Lej en Kok (KT VVS kun
på gren `agent/0924-kt-vvs-case` — **skal privatlivs-saneres først**, cofounder). Audit først: hvordan ser siden ud
i dag på 390 px og desktop, og er alle kunder med? Kortene: ens mockup-skud (telefon + computer, samme stil som
undersiderne), navn, branche, by, "Sider vi byggede", og **ét verificeret resultat pr. kunde** når det findes (fx
"nævnt af ChatGPT for 'autoværksted Ikast'" eller et GSC-tal) — med kundens OK.
Ejerskab: kinly-site er Hermes marketings område på grene; Lucas merger. Hero, priser og cookie-tekst er
Lucas' alene. Brug `impeccable` + `design-inspiration` + screenshot-loop. Maks én deploy.

## 3. Resultater på kinly.dk-forsiden (offentligt — kun hvis tallene er stærke)

Ærlig status: kinly.dk selv havde 16 besøg og 0 henvendelser på 28 dage → **vis ikke tal om os selv endnu.**
Kundernes tal kan være stærke (Ikast står 2/2 i AI-søgning). Forslag: en rolig "Resultater"-stribe med 2–3
kunde-tal fra punkt 1 (hver med kilde og dato, fx "Ikast AutoService · nævnt i ChatGPT, Google AI og Perplexity ·
målt sept. 2026") og link til casen. Statisk og opdateret månedligt (ikke live fra HQ → ingen ekstra builds,
ingen afhængighed). Kun efter kundens accept og kun hvis tallet overlever et council ("ville en skeptisk
håndværker tro på det?"). Hellere ingen stribe end en svag.

## Rækkefølge

1 (HQ, internt) først — det giver Lucas data til kundeopdateringer og til 2 og 3. Derefter 2. 3 til sidst og kun med
stærke tal. Alt offentligt: anti-slop + brand-og-tone, kundens accept, Lucas merger.
