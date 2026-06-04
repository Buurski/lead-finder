# NIGHT_BUILD_REPORT_v2.md — Command Center v3, Del 2

*Skrevet 4. juni 2026. Rolig og ærlig, som vi plejer. Alle 12 blocks fra
`PLAN_DAGENS.md` er kørt. Branch: `command-center-v3`. Intet pushet, merged eller
deployet. Ingen mail sendt. Build + lint grøn efter hvert block, 204 offline-checks
grønne.*

---

## Kort version

Jeg byggede hele Del 2 — de 12 blocks — oven på Fase A fra i nat. Det meste er
**ægte og virker nu**, ikke kulisse: demo-factoryen bygger faktisk en hel
hjemmeside-demo på sekunder, vaulten læses ind i Goals/Memory/Journal, SEO-værktøjet
scanner rigtige sider, tone-mixeren er skrevet om efter din egen outreach-analyse,
og der er en AI-spend-måler, en motor-kadence-kontakt, adgangskode-beskyttelse til
Charlie og et Hermes-skelet klar til Railway.

Jeg verificerede skærmene i en rigtig browser undervejs (screenshots i
`_screenshots/`).

**Sådan ser du det:**
```bash
git checkout command-center-v3
npm install
npm run build      # grøn
npx next start -p 3000
# åbn http://localhost:3000  (første gang sender den dig til /welcome)
node scripts/test_all.mjs   # 11 suites, 204 checks, grøn
```

---

## Block for block — hvad virker, og hvor ærligt det står

### Block 1 — Outreach-loopet færdigt ✅ virker
- `/approve`: tastatur-triage (`j/k` flyt, `a` godkend, `r` skip, `e` redigér),
  fokus-ring, og **Godkend alle (N)** med bekræft.
- `/replies`: **Send QA-kopi til mig**-knap → `POST /api/replies/[id]/send-reply`.
  Den sender KUN til `buur.aigro` (hårdt låst), aldrig til kunden, og rører ikke
  Sheets. "Live" til kunden er bevidst spærret (412) — det gør du selv.
- Mission Control: **Find emails**-knap kører email-finder på de næste leads og
  viser fund — uden at skrive til Sheets.
- *Ærligt:* QA-send er ikke testet med rigtige creds her (jeg sender ikke mail
  uovervåget), men logikken og recipient-låsen er på plads og testet.

### Block 2 — Demo-factory ✅ virker (det her er den sjove)
- 7 branche-design-templates (`src/lib/design-templates.ts`) + `customer-recon.ts`
  (henter titel, og-image, favicon, farver, tone fra en eksisterende side, med
  jina-fallback) + `demo-factory.ts` der blander dem til en **selvstændig HTML-demo**
  i `dist/demo-{slug}/`.
- `/studio/new`: skriv navn + branche + URL → recon-preview (med farve-swatches) →
  **Byg demo** → live iframe-preview. Jeg byggede "Salon Lumière" i browseren og
  det virkede (se `_screenshots/studio-demo-built.png`).
- Templates spejles til `KnowledgeOS/wiki/design/` så de kan browses i Memory.
- *Ærligt:* recon er fetch+regex, ikke headless browser — den fanger det meste,
  men en tung JS-side giver tyndere resultat (så falder den tilbage på template).
  Ingen auto-deploy til Vercel; det er dit skridt.

### Block 3 — SEO-værktøj ✅ virker (Lighthouse er valgfri)
- `src/lib/seo.ts`: schema.org-scan (rigtig, testet), Google-index-tjek
  (Googlebot-UA, fejler pænt når Google blokerer), AI-synlighed (via `ai.ts`),
  tiers (VIDA = fuld). `seo-report.ts` laver en månedsrapport i markdown.
- `/seo`: per-klient kort med domæne-felt + **Kør tjek** + foldbar rapport.
- *Ærligt:* **Lighthouse er IKKE installeret** (det trækker et 300MB Chrome-bundt).
  Jeg lavede den som en valgfri dynamic-import: kører du `npm i -D lighthouse
  chrome-launcher`, tænder den; ellers viser den en pæn "ikke installeret"-linje.
  Schema-scan og index/AI-tjek virker uden noget ekstra.

### Block 4 — Vault-kobling ✅ virker (lokal nu, GitHub når token sættes)
- `src/lib/vault.ts`: **local-first** (læser `KnowledgeOS/` i repoet) → falder
  tilbage til `raw.githubusercontent.com/Buurski/KnowledgeOS`. 5-min cache,
  frontmatter-parse, path-traversal-guard.
- `/memory` + `/journal` browser med søgning; `/goals` parser roadmap-checkboxe til
  en fremdriftsbar + viser priser. Jeg seedede `roadmap-naeste-skridt.md`,
  `priser.md`, en daily-note og kunde-note-skabelon, så skærmene er ægte med det
  samme (se `_screenshots/goals.png`, `memory.png`).
- *Ærligt:* `Buurski/KnowledgeOS` svarede 404 (privat repo), så remote-stien er
  uafprøvet live — men koden er der og degraderer pænt. Sæt `GITHUB_TOKEN` så
  virker GitHub-stien.

### Block 5 — Klient-leverancer ✅ virker
- `/clients/[id]`: aftale, **CMS-admin-link** (fra vault-frontmatter), projektmappe,
  næste vedligehold, on-demand **SEO-status**-widget, og den renderede vault-note.
- Når et lead bliver til klient, oprettes `KnowledgeOS/wiki/kunder/{slug}.md`
  automatisk fra skabelon (best-effort; no-op på read-only filsystem).
- *Ærligt:* siden kræver en rigtig klient fra Sheets for at vise data — den er
  testet på struktur, ikke på live-klient (Sheets-creds er knækket lokalt).

### Block 6 — Tone-mixer ✅ virker (bygget på DIN analyse)
- `src/lib/tone-mixer.ts` efter `OUTREACH_ANALYSIS_2026-06-04.md`:
  - **Droppede** "ser ud til at have bygget noget særligt op" helt.
  - Data-bevidste åbnere: anmeldelses-citat, **konkret teknisk problem**,
    **anmeldelses-tal med deres eget rigtige tal**, detalje, demo-krog, og en
    **neutral brand-åbner** som sikker fallback (ingen "projekter"/"menu" på
    forkert branche).
  - Beholdt **salgselev-hobby-linjen** (differentiatoren).
  - Follow-up sat til **7 dage** (delt konstant; var 5, nu én kilde).
  - **Hostile-blacklist** (Thellufsenfoto, Caroline Bjerring) — springes over i
    motoren, også ved "skriv til X".
- `scripts/preview-tone-mix.mjs` viser variationen; `draft.ts` bruger den nu.
- *Ærligt:* den "neutrale brand"-åbner rammer lidt oftere end de andre, fordi den
  altid er gyldig. Det er bevidst (lav risiko), men kan finjusteres med vægtning.

### Block 7 — Hybrid motor-kadence ✅ virker
- `/settings`: rolig kontakt **Auto-kør motor hver morgen** (default **SLUKKET**)
  + antal + time. `/api/cron/engine` kører kun hvis kontakten er tændt og fylder
  kun køen. `vercel.json` har cron kl 05:00 UTC (~07:00). Mission Control viser
  "Næste auto-kørsel".
- *Ærligt:* jeg tændte den i browseren for at teste og **slukkede den igen** — den
  står OFF. Cron'en gør intet før du selv tænder.

### Block 8 — Charlie ind ✅ virker
- `src/proxy.ts` (Next 16 har omdøbt "middleware" til "proxy" — jeg fulgte den nye
  konvention): delt-kodeord via `VERCEL_BASIC_AUTH_USER/PASS`. **Opt-in** — uden
  env'erne er der fri adgang (så build/preview virker). `/api/health` er fri.
- Første besøg sender til **`/welcome`** (rolig intro) indtil en cookie er sat.
- *Ærligt:* sæt `VERCEL_BASIC_AUTH_USER` + `VERCEL_BASIC_AUTH_PASS` i Vercel for at
  tænde adgangskoden. Charlie-onboarding-mailen er din/Coworks opgave, ikke min.

### Block 9 — AI Spend ✅ virker (estimat)
- Hvert `ai.generate()`-kald logges til `.send_queue/spend.jsonl`. `/spend` viser
  forbrug pr. dag + pr. model (bar-charts) + dyreste kald, og en amber-advarsel
  hvis dagsforbrug > 50 kr (også på Mission Control).
- *Ærligt:* tokens er **estimeret fra tekstlængde** (≈4 tegn/token), ikke fra
  API'ets usage-felt — en måler, ikke en faktura. Skærmen siger det selv. Kan
  opgraderes til eksakte tal ved at fange `usage` i `ai.ts`.

### Block 10 — Hermes-forberedelse ✅ klar (ikke deployet)
- `SETUP_HERMES.md` med eksakte trin + `hermes/` skelet (`index.js` Telegram-loop
  der kun adlyder din chat og aldrig sender mail, `dreaming.js` nat-sweep,
  `package.json`, `Dockerfile`).
- *Ærligt:* bevidst **ikke deployet** og ikke koblet på Telegram endnu — det er et
  skelet du tager til Railway. Den fylder ikke køen automatisk i v1.

### Block 11 — Oprydning ✅ gjort
- Arkiverede døde planlægnings-docs til `_archive/2026-06-04/`.
- `/claude` er nu en ægte **AI-assistent-status** (forbindelser, modeller, dagens
  spend). `/hermes` viser setup-status. `/build-guide` → **Plan-historik** (viser
  planerne + begge nat-rapporter).

### Block 12 — Tests, UI-tjek, docs ✅ gjort
- Nye suites: `test_seo`, `test_tone_mixer`, `test_spend`, `test_vault`,
  `test_recon`. I alt **11 suites / 204 checks, grøn**. Fandt og fixede en
  rigtig slugify-bug undervejs (NFD strippede å'ets ring → "Ål" blev "al").
- Browser-tjek + screenshots i `_screenshots/` (11 skærme).
- `PRODUCT.md` + `DESIGN.md` opdateret.

---

## Nye/ændrede filer (overblik)
- **Libs:** `design-templates`, `customer-recon`, `demo-factory`, `seo`,
  `seo-report`, `vault`, `client-notes`, `tone-mixer`, `settings`, `spend-log`.
- **Ruter:** `studio/recon`, `studio/build-demo`, `seo/check`, `vault/note`,
  `replies/[id]/send-reply`, `email/find-preview`, `engine/run` (fra Fase A),
  `settings`, `cron/engine`, `spend`, `health`.
- **Sider:** `/studio/new`, real `/seo` `/goals` `/memory` `/journal`
  `/clients/[id]` `/claude` `/hermes`, `/settings`, `/spend`, `/welcome`,
  Plan-historik.
- **Andet:** `src/proxy.ts`, `vercel.json`, `hermes/`, `KnowledgeOS/` (vault-frø),
  5 nye test-scripts, `_screenshots/`.

## Beslutninger jeg har brug for fra dig
1. **Lighthouse:** vil du have rigtige scores? Så installerer vi `lighthouse` +
   `chrome-launcher` (tungt). Ellers står schema/index/AI-tjekket alene.
2. **Vault-token:** giv mig en `GITHUB_TOKEN` (read) til `Buurski/KnowledgeOS`, så
   bliver Memory/Journal/Goals ægte fra GitHub i stedet for kun den lokale frø.
3. **Adgangskode:** vil du tænde basic-auth nu (sæt `VERCEL_BASIC_AUTH_*` i Vercel)?
4. **Motor-auto-kørsel:** den er SLUKKET. Sig til når du er tryg, så tænder du
   kontakten på `/settings`.
5. **Tone-mixer-vægtning:** skal den neutrale brand-åbner bruges sjældnere?

## Hvad der IKKE er gjort / mangler (ærligt)
- Live-send af kundesvar (med vilje spærret).
- Eksakte AI-token-tal (estimat nu).
- Lighthouse-kørsel (valgfri, ikke installeret).
- Remote vault testet live (repo er privat → 404 her).
- Hermes deployet (skelet, dit Railway-skridt).
- De gamle sider (`/leads`, `/approve`, `/clients`, `/followup-review`) virker og
  er på samme palette, men er ikke fuldt skåret ind i den nye PageHeader-stil.

## Guardrails — overholdt
✅ Kun commits på `command-center-v3` · intet push/merge/deploy/force-push
✅ Ingen mail sendt · QA-send hårdt låst til buur.aigro · live-send spærret
✅ Sheets-leads + kø + PauseSchedule urørt · motor kun preview (skrev 0)
✅ Samme stack (Next 16/React 19/Tailwind v4) · ingen database · sage-grøn intakt
✅ Build + lint grøn efter hvert block · 204 checks grønne · ingen røde commits

God morgen. Start på `/` (welcome første gang), prøv så **Studio → Lav demo** —
det er den der gør mest indtryk.
