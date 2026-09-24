# 06 — Blog: pipeline i Kinly HQ, idé-motor, rating, billeder, udgivelse

**Hovedkilde (Hermes marketing, godkendt af to spec-reviews):** `KnowledgeOS/wiki/kinly/blog-pipeline-spec-2026-09-24.md`
+ plan `wiki/kinly/blog-plan-2026-09-24.md`. **Læs dem.** Denne fil = status + Lucas' tilføjelser 24/9 aften +
Claudes kritiske tilføjelser + koordinering med Hermes. Byg IKKE en parallel version — byg sammen med Hermes' grene.

## POINTEN med bloggen (Lucas 25/9 — vinder over alt andet i filen)

Bloggen er **SEO/GEO for Kinly selv**: den skal få Kinly fundet på Google og nævnt af ChatGPT/Google AI/Perplexity,
og den skal bære Kinlys position: **"de billigste og de bedste"** (fair pris, kodet i hånden, kunden ejer koden,
dansk redigering, SEO/AI-søgning inkluderet). Hermes' tre kladder er netop det: "SEO der sælger",
"Billigste og bedste webbureau", "Bliver din virksomhed nævnt af ChatGPT".

Hvert opslag skal have:
1. **Et hook** i de første 2–4 sætninger (en scene, et overraskende tal, et spørgsmål læseren selv stiller) — ingen clickbait.
2. **Reelle fakta med kilde** (studier, offentlige data) — hvert tal kan åbnes og efterprøves; ingen opdigtede tal.
3. **Eksempler fra vores rigtige kunder** der matcher historien: fx Ikast AutoServices placering på "autoværksted ikast",
   at de nævnes i AI-søgning, VIDAs nye behandlingssider og hvad de gav. Tallene kommer fra 07 (GSC/GEO-målinger med dato)
   og **kræver kundens accept**. Fiktive scener må kun bruges tydeligt mærket og aldrig som bevis.
4. **Historie, fakta og kunde-eksempel skal hænge sammen** — kunde-tallet skal bevise præcis den pointe opslaget laver
   (council-rådet "Sammenhæng" håndhæver det).
5. **Salg uden bluff**: vejen videre til /seo-tjek/, prissiden eller gratis udkast med `?ref=blog-<slug>`.
6. **Søgning først**: titel, H1 og FAQ formuleret som folk faktisk søger ("hvad koster en hjemmeside", "billigt webbureau
   Herning", "bliver min virksomhed vist i ChatGPT").

**Juridisk/kritisk:** "billigste" er en sammenlignende påstand (markedsføringsloven: skal kunne dokumenteres). Brug
den kun med en dateret, kildebelagt prissammenligning — ellers "fair pris" / "fra 3.997 kr" / "uden binding". Samme
for "bedste": vis det med kundetal og cases, påstå det ikke.

## Hvad Lucas vil have (hans ord, 24/9)

En dybdegående egen side "lidt ala pipeline", hvor kort trækkes mellem stadier. Hermes tjekker dem og
udgiver i sidste stadie, og laver billeder derinde. Første stadie er idéer: **Lucas (og Charlie) skriver idéer
ind, og Hermes bearbejder dem til rigtige blogopslag.** Et cronjob i lead-systemet skriver væsentlige
blog-idéer ind. Alt skal have **rating**. Hermes skal kende alt og være aligned hele vejen, også crons.

## Status i dag

| Del | Hvor | Status |
|---|---|---|
| kinly.dk `/blog` (indeks, opslag, RSS, schema, tests) | VPS `/root/kinly-site`, gren `agent/0924-1746-kinly-site` | review grøn efter rettelser, **ikke merget, 404 live**. `/blog/` lister 3 noindex-pilotopslag → skal ikke indekseres før første rigtige opslag |
| 3 rigtige kladder | `KnowledgeOS/drafts/blog/` | maskin-grønne + council; venter på Lucas' "SKAL TJEKKES" nederst i hver. ~1.400 ord mod planens 600–900 → skal strammes |
| Blog-board i HQ (A: datalag `blog_post`, B: `/api/posts` + `/api/agent/posts`) | VPS-gren `agent/0924-1932-lead-system` (`695d755`), migration **`0008_easy_kid_colt.sql`** | 37 fokuserede tests; review AFVIST → fix-kort kører; ikke fuld suite, ikke prod |
| B2 (scores/styrker/scanReport), C (UI-board), E2E-gate, udgiver-job, eksport `scripts/blog-export.mjs` | kanban-kort t_2a875736, t_8b1461a7, t_6135e505, t_784ba422, t_91d3080f, t_08a3b8b7 | ikke bygget |
| Crons `agent-blog-cyklus` (man 08) | Hermes marketing | aktiv, aldrig kørt → **pause til boardet + /blog er live** |
| `agent-blog-ideer` (ugentlig), `agent-blog-dybdescan` (månedlig) | spec | ikke oprettet (må først efter B2 + C er live og testet manuelt) |

## ⚠ Kendte fejl i blog-kernen (cofounder 24/9)

- Review AFVIST: `src/lib/hq/posts.ts:310–313` beskytter valgstrengen, men agenten kan bytte billedet under Lucas' valgte A/B → lås det valgte asset (hash/id) ved valg. Fuld `npm test` afbrudt efter 420 s (ikke bestået) — kør den fulde suite lokalt (Windows/Claude) i stedet for på VPS'en.
- Vercel Blob `putAsset` er public → private kandidater indtil valgt/publiceret.

## ⚠ Migrations-kollision (tre sæt!)

main har `0006_superb_shadowcat`, `0007_seed_app_users` (kørt på Neon). Claude-feature har `0006_task_priority`,
`0007_company_relation`, `0008_seo_snapshot` (ikke kørt). Hermes' blog-gren har `0008_easy_kid_colt` (+ planlagt 0009 til B2).
**Aftalt rækkefølge (sendt til Hermes 24/9):** main 0006–0007 → Claude-feature **0008–0010** → blog **0011+** (Hermes
regenererer sin migration efter Claude-merge er på main, med `npm run db:generate` mod den nye base). Ingen
merger til lead-system main uden at tjekke `git log origin/main` og journalen først.

## Stadier (Hermes' spec — behold)

`ide` → `arbejder` → `klar` ("Til gennemlæsning") → `publicer` (**kun Lucas/Charlie**; træk = godkendelse) → `udgivet`
(kun udgiver-jobbet, med URL-bevis). Agentens `actor` tvinges serverside til `hermes`. Udgiver = rent script hvert 15. min,
0 LLM-tokens, JEV-precheck fail-closed, `BLOG_PUBLISH_LIVE` først efter Lucas' ja. Fortryd-toast, Avanceret-felter, audit v1.1.

## Tilføjelser (Lucas' ønsker + Claudes kritik) — skal ind i Hermes' spec og bygges

1. **Hurtig idé-indtastning overalt:** én linje i Idéer-kolonnen ("+ Idé"), fra Hermes-docken ("blogidé: …") og fra
   Telegram til Hermes → kort med `source=manuel`, `createdBy`. Samme behandling som agent-idéer.
2. **Hermes bearbejder nye manuelle idéer** (nyt cron `blog-arbejder`, dagligt, DeepSeek-worker + Sol-kvalitetstjek):
   research (≥5 kilder, evidensark) → vinkel + søgeformuleringer → disposition → kladde → council → flyt til
   `klar` med note. Idéen bliver aldrig publiceret af Hermes.
3. **Idé-signaler fra CRM'et (lead-system-cron):** Vercel-cron `blog-signaler` (ugentlig, script, 0 LLM) samler
   *anonymiserede* mønstre og lægger dem som ét signal-kort/rapport, som Hermes' `agent-blog-ideer` omsætter til scorede idéer:
   - hvad leads spørger om/indvender i svar (kategorier fra svar-digest, ingen navne/mails),
   - hvad `/seo-tjek/`-rapporterne oftest finder galt (top-fejl pr. branche),
   - hvilke spørgsmål gratis-udkast-formularen får,
   - hvilke søgeord kinly.dk får visninger på uden klik (GSC, når forbundet),
   - arbejde vi har lavet for kunder (arbejdslog) → case-idéer (kun med kundens accept).
   Eksponeres til Hermes via `GET /api/agent/read?what=blog-signals` (HMAC).
4. **Rating på alt:**
   - *Idé-scorekort* (Hermes' 5 akser 1–100: styrke, kundebase-fit, SEO, GEO, konkurrent-gap) + kort begrundelse.
   - *Lucas'/Charlies egen vurdering* (👍/👎 eller 1–5) pr. idé og pr. kladde, med valgfri én-linjes kommentar → Hermes læser
     den og lærer hvad I kan lide (gem mønstre i marketing-profilens memory).
   - *Kvalitetsscore på kladden* (Jev: klar/ikke-klar + mangler) vist på kortet før `publicer`.
   - *Resultat efter udgivelse*: efter 7/30 dage viser `udgivet`-kortet visninger (PostHog), GSC-visninger/klik,
     og **henvendelser via opslaget** (ref-parameter `?ref=blog-<slug>` på CTA'er til /seo-tjek/ og kontakt).
     Det er den eneste score der betyder penge.
5. **Tjekliste pr. stadie (definition of done på kortet):** kilder ≥5 · council-log · FAQ 3–5 · ≥2 interne links til
   by-/branchesider eller cases · CTA med ref · 600–900 ord · billeder valgt · ingen opdigtede kunder/tal. Kortet
   kan ikke trækkes til `publicer` før tjeklisten er grøn (UI-guard + server-guard).
6. **Billeder i boardet:** Hermes laver 2 kandidater (A/B) pr. opslag. Typer: rigtige skærmskud af vores og
   kundernes sider i telefon/computer-mockup (samme stil som undersiderne), sammenligningsgrafik, grafer med
   forklaring, Kinly-wordmark. Aldrig stock, aldrig Space Bunny. Lucas vælger A/B/begge/ingen i dialogen med preview
   (390 px + desktop). Manglende rigtigt skærmskud = synligt stop, ikke en mock.
7. **Opdatér-stadie (senere):** opslag >90 dage med visninger men lav CTR → Hermes lægger et "Opdatér"-kort i Idéer.
8. **Distribution efter udgivelse:** kladder (aldrig auto-post) til GBP-opslag og evt. LinkedIn/Facebook, linket fra kortet.
9. **Kinly.dk-siden:** `/blog/` noindex og skjult i nav indtil første rigtige opslag; derefter i hovedmenuen (Lucas' ønske).
   `index.test.ts` ind i `npm run verify`. Første rigtige opslag skal handle om en **rigtig kunde med tal** eller en præcis
   kommerciel søgning ("hvad koster en hjemmeside i Herning"), ikke et generisk fagemne.

## Kritisk vurdering

- Bloggen er rigtig som **GEO/tillids-motor**, men kinly.dk havde 16 besøg og 0 henvendelser på 28 dage. Mål henvendelser
  pr. opslag fra dag 1 (punkt 4), og skru ikke kadencen op (4/md) før det første opslag er målt.
- Boardet er det rigtige sted for godkendelse (ét træk = godkendt). Men det er et **4. byggespor i samme repo**. Det skal
  merges EFTER Claude-feature-merge og følge den nye base. Ellers kommer der endnu en divergens.
- Mindre er mere: v1 = board + manuel idé + Hermes-bearbejdning + tjekliste + udgiver + ref-måling. Konkurrent-scan og
  dybdescan kan vente til der er 3 udgivne opslag med data.

## Koordinering med Hermes — AFTALT 24–25/9 (svar i raa/hermes-*-alignment-svar.md)

**Roller:** marketing ejer blog-sporet (spec, kort, kladder, crons). Claude (næste session) merger CRM-feature til main FØRST.
**Default-Hermes er integrator på lead-system EFTER Claudes merge** (regenererer blog-migrationerne som 0011+ og merger blog-grenen).
Én integrator pr. repo pr. dag.

**Overdragelses-protokol (næste session SKAL gøre dette):** når feature er merget til main og Neon er migreret:
send merge-SHA + bekræftelse på at `drizzle/meta/_journal.json` + snapshots er regenereret med drizzle-kit (ikke kun omdøbte filer)
til default og marketing (Hermes-MCP `messages_send` eller `ssh hermes-vps 'hermes -p default -z "…"'`) og skriv det som kommentar
på kanban-kort **t_6c9d3972**. Blog-grenens `0008_easy_kid_colt` + `0009_vengeful_wonder_man` er WIP og må aldrig køres/merges som de er.

**Hermes har gjort (verificér ved lejlighed):**
- Spec opdateret med Rev. A–E, release-gates og kinly.dk-gate; kort t_91d3080f, t_a916f19f, t_b948769b, t_2c38e6db, t_784ba422, t_d7ceaed5, t_a7487917
  dækker 600–900 ord, ≥5 kilder, council-log, FAQ 3–5, ≥2 interne links, `?ref=blog-<slug>`, A/B-billeder uden stock/Space Bunny,
  noindex og skjult nav indtil første rigtige opslag. De tre kladder (~1.400 ord) er IKKE klar til udgivelse.
- `kinly-preview-intake` pin'et til GPT-6 Sol (første udkast + visuel review), DeepSeek kun mekaniske rettelser, Luna-kontrol til sidst.
- Tunnel-rotation virker; GEO-loopets "beskidt vault"-fejl er rettet (tester 28/9 08:20); nat-build-tidsbudget rettet (første rigtige kørsel 25/9 06:00).
- Dekodede env-filer flyttet til tmpfs `/run/hermes-sensitive/` (væk ved reboot; ikke sikker sletning af swap/backup); port 3210/4317 lukket.
- Ingen nye blog-crons oprettet (korrekt — først når board + /blog er live og testet manuelt).

**Uenigheder (accepteret):** rating-læring gemmes i `wiki/kinly/` (revisionsspor), ikke i modellens personlige memory. DeepSeek må ikke rette visuelt design uden Sol-kontrol.

**Kræver Lucas:** (1) pause `agent-blog-cyklus` (id 448f179bcad1) før 28/9 08:00 — kort t_90f6b3f6; (2) ja til mail-gatens
"frozen window" (0 afsendelse) + én grøn kørsel pr. job, så crm-mail-sync og inbox-digest kan tændes igen (kundetidslinjerne er forældede indtil da).
**Kræver Claude:** merge-SHA + regenereret journal (protokollen ovenfor).
