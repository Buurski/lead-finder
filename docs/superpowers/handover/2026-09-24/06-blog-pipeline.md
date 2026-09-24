# 06 — Blog: pipeline i Kinly HQ, idé-motor, rating, billeder, udgivelse

**Hovedkilde (Hermes marketing, godkendt af to spec-reviews):** `KnowledgeOS/wiki/kinly/blog-pipeline-spec-2026-09-24.md`
+ plan `wiki/kinly/blog-plan-2026-09-24.md`. **Læs dem.** Denne fil = status + Lucas' tilføjelser 24/9 aften +
Claudes kritiske tilføjelser + koordinering med Hermes. Byg IKKE en parallel version — byg sammen med Hermes' grene.

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

## Koordinering med Hermes

Brief sendt 24/9 aften til marketing- og default-profilen (se `raa/hermes-blog-alignment-svar.md` når de har svaret):
aftalt migrations-rækkefølge, pause `agent-blog-cyklus`, tilføjelserne ovenfor ind i spec + kanban, cron-plan
(`blog-arbejder` dagligt, `agent-blog-ideer` ugentligt, `blog-signaler` i lead-system, udgiver hvert 15. min), ingen
merge til lead-system main før Claude-merge, og at de svarer med enighed/indsigelser. Næste session: læs svaret,
før blog-sporet røres.
