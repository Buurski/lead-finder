# Council 24/9 — to friske Sonnet-linser (rå fund, lettere forkortet)

## Linse A: blog-grenen + forsidens prisændring (kinly.dk, read-only)

Kontekst: linsen læste gren `agent/0924-1746-kinly-site` i `/root/kinly-site`. Den så de **3 pilot-/eksempel-opslag i koden** (`content/blog/*.ts`: fra-usynlig-til-booket, hvorfor-vi-koder-i-haanden, mobilen-bestemmer). Den så IKKE marketings **3 rigtige kladder** i vaulten (`KnowledgeOS/drafts/blog/`: "SEO der sælger", "Billigste og bedste webbureau", "Bliver din virksomhed nævnt af ChatGPT").

- BLOKER: alle 3 kodeopslag har `example: true` → noindex og ude af sitemap/RSS. Bloggen shipper uden indekserbart indhold.
- VIGTIG: `/blog/` selv er i sitemap og lister de 3 noindex-opslag (`src/app/blog/page.tsx` bruger `blogPosts`, ikke `publishedPosts`). Modstridende signal.
- VIGTIG: ingen af pilot-opslagene rammer kommercielt/lokalt søgeord; CTA'en peger kun på /seo-tjek/ og /ydelser/hjemmeside/ — **ingen interne links til by-/branchesider** (den største SEO-gevinst ved en blog).
- NICE: KT VVS-screenshot bruges på en opdigtet tømrer-historie. `content/blog/index.test.ts` køres ikke af `npm run verify`.
- Teknik er solid: `isIndexable`/`publishedPosts` ét sted med test, kontrakt-check, schema Blog/BlogPosting/Breadcrumb/FAQ koblet til Organization/Person via @id.
- Tekst: menneskelig, konkret, kilder dateret ærligt, ingen opdigtede kundetal.
- **Forsiden (6342fb6, live):** fjernede ÷-liste over hvad billigste pakke IKKE indeholder, fjernede mellem-pakkens upsell-linje "Kun 1.000 kr. ekstra for undersider med SEO", og fjernede accordion/"inkluderet"-liste. Priserne (3.997/4.997/8.449 · 479/599/999) er konsistente overalt. → **Bekræft med Lucas at tabet er bevidst; overvej at genindsætte upsell-linjen.**
- Anbefaling: blog-grenen kan merges som **teknisk fundament**, men `/blog/` skal være noindex/tom indtil ≥1 rigtigt opslag er publiceret; pilot-opslagene må ikke blive de første rigtige. Næste: ét opslag om en RIGTIG kunde med tal; emner valgt ud fra faktiske søgeord ("hvad koster en hjemmeside i Herning"); ≥2 interne links pr. opslag til by-/branchesider.

## Linse B: forretningsværdi (skeptisk rådgiver, read-only)

- **Dom: for meget system til 4–5 kunder.** Spec'en fra 22/9 foreslog selv at skære navigationen til ~7 punkter; nav-config har stadig ~20 destinationer.
- **Flaskehalsen er konvertering, ikke leads** (UVERIFICERET — ingen konverteringstal): stor lead-motor, 4 betalende kunder. Marketing bekræfter: kinly.dk havde 16 målte besøg, 0 kontaktklik, 0 formularer på 28 dage.
- Charlies reelle 5 sider: HQ, Kunder, Opgaver, Indbakke (godkend/svar), Økonomi. Skjul for ham: Agenter, Drift, Leadgen, Studio, SEO-værktøjer, Virksomheder (dublet af Kunder), Messenger, Indsigter, Fakturaer/Udgifter (fold ind i Økonomi).
- Mangler for 5→20 kunder: tilbud/kontrakt-flow (accept/e-signatur), betaling ved opstart, fast pakke-katalog, anmeldelses-/henvisningsloop efter levering, genbrugelig leverance-skabelon, CVR + bogføring (Dinero).
- Ud af boksen: onboarding-formular → automatisk projektopsætning; én supportkanal/SLA så kunder ikke DM'er Lucas; churn-/"hvorfor stoppede vi"-log.
- Risici: (1) juridisk — kold B2B-mail under markedsføringslovens §10 + fakturering uden CVR; (2) operationelt — 17+18 crons og agenter, ingen alarmering til Charlie; (3) økonomi — tid på intern CRM frem for salg/levering.
