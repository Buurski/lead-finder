# CMS_MASTERPLAN.md — Kunde-CMS ("vores Claude CMS")

> Erstatter/uddyber `CLIENT_CMS_BLUEPRINT.md` (videoreference bevares dér).
> Grundlag: Jack Roberts-videoen (NotebookLM-dybdeinterview + storyboard-
> screenshots), KnowledgeOS-vault, lead-system-repoet, Gmail-kontekst og
> SEO-research (kilder nederst). Skrevet 2026-06-07.
> **Dette dokument er bygge-specifikationen til Claude Code.** Intet bygges
> uden Lucas' go. Design holdes bevidst løst — kun retning, ikke pixels.

---

## 1. Hvad vi bygger (én sætning)

Ét centralt CMS (én app, én database) hvor hver kunde logger ind med link +
kode og selv kan rette tekst/billeder/sider på deres kodede site, spørge en
AI på dansk, og se en ÆGTE SEO-score — mens vi styrer alle sites fra ét
Master-dashboard.

## 2. Svar på repo-spørgsmålet (vigtigst)

**Begge dele — men med klar rollefordeling:**

- **Kundesites: fortsat ét GitHub-repo pr. site** (som i dag: zaytoon,
  salon-artec, vida …). Det ER produktløftet ("du ejer 100 % af koden")
  og det matcher Vercel-modellen (ét repo = ét Vercel-projekt = eget domæne).
  Det ændrer vi IKKE.
- **CMS'et: ÉT nyt, separat repo** (fx `buur-cms`) med ét Vercel-projekt.
  Det er multi-tenant: Master Command + alle kunde-editorer + API + DB-lag
  bor her. Kunder tilgår `cms.<vores-domæne>.dk/<site-slug>` med kode.
  (Jacks model er identisk: "one master site that manages them all".)
- **Forbindelsen:** CMS'et har en `sites`-collection i databasen med ét
  dokument pr. kundesite: repo-URL, Vercel-projekt-id, domæne, adgangskode-
  hash, content-namespace, adapter-type (se §4). Nyt site kobles på ved at
  registrere det dér — IKKE ved at forke CMS'et.

Dvs.: vi laver ALDRIG en CMS-kopi pr. kunde. Én CMS-app, mange sites.

## 3. Arkitektur

```
┌──────────────────────────── buur-cms (ét repo, én Vercel-app) ───────────┐
│  /master      Master Command (kun os; basic auth som Command Center)     │
│  /e/[slug]    Kunde-editor (kode-login pr. site, dansk UI)               │
│  /api/...     content CRUD · publish/snapshot/rollback · AI · SEO        │
└───────────────┬───────────────────────────────────────────────────────────┘
                │ læs/skriv
        MongoDB Atlas (eller Vercel Postgres — beslutning, se §9)
        collections: sites · content (draft) · snapshots · ai_log · seo_cache
                │ publish
   ┌────────────┴───────────────┐
   │ Adapter A: Next.js-sites   │  runtime-hydration: site læser content
   │ (nye kundesites)           │  fra DB + on-demand revalidate → LIVE straks
   │ Adapter B: statiske HTML-  │  CMS patcher HTML/JSON → commit til kundens
   │ sites (de fleste nuværende)│  GitHub-repo → Vercel auto-deploy (~30-60 s)
   └────────────────────────────┘
```

**Nøgleprincipper (fra videoen, bekræftet fornuftige):**
- Kode i GitHub; redigerbart indhold i DB. Kunden kan ikke "ødelægge
  kongeriget".
- Hvert "Udgiv" = snapshot → rollback altid muligt fra Master.
- DB er single source of truth for indhold; sitet hydrerer derfra.

**Vores afvigelser fra Jack:**
- **AI: Anthropic direkte** (vi har allerede `src/lib/ai.ts`-mønsteret med
  gateway→direct→deterministic). Ingen OpenRouter. Lucas HAR allerede
  Anthropic API-nøgler (købt til Agentech OS) — ingen credits-blokering;
  brug helst separat nøgle/spend-limit til CMS'et.
- **Billeder: KIE API** (Lucas har allerede nøgle — find den i jeres
  nøgle-opbevaring; den er IKKE i lead-system/.env.example endnu, skal
  tilføjes som `KIE_API_KEY` i CMS'ets env).
- **Alt kundevendt UI og AI-output på dansk.**
- **Design:** ikke Jacks generiske look. Master Command i vores rolige,
  "room-like" stil (matcher Command Center v3); kunde-editoren neutral,
  varm og ekstremt simpel — målgruppen er ikke-tekniske (frisører, caféer,
  håndværkere).

## 3b. Hvad screenshots afslører (præcis UI/flow — vigtigt, ret detaljeret)

Lucas' screenshots fra videoen viser systemet langt mere præcist end
transkriptet. Nøglefund:

**Den store arkitektur-overraskelse: INGEN Git i hans flow.**
"Add a website" i Agency Console: *paste URL'en på et allerede deployet
site → CMS'et FETCHER HTML'en og "ingester" den → bliver redigerbar kopi
i dashboardet*. Publish deployer derefter den statiske HTML **direkte til
et Vercel-projekt via Vercel-token — "no Git, no rebuilds"**. Der er også
en "Export static"-knap. Kilden til sandhed flytter altså IND i CMS'et
(Mongo), og kundens repo bruges slet ikke i hans model. Se §4 for hvordan
vi forener det med vores "kunden ejer koden"-løfte.

**Agency Console (master, `/admin/?key=<owner-key>`):**
- Tre setup-kort med statuschips (AI · Vercel · DB, grønne dots når
  forbundet):
  1. *AI editing* — providervalg **Anthropic (Claude — direct)** eller
     OpenRouter; felt til API-nøgle + modelnavn (viser
     `anthropic/claude-sonnet-4.5`). Vigtigt: **"Click-to-edit works
     without it"** — uden nøgle falder chatten tilbage til en "local
     matcher" (deterministisk). Præcis vores ai.ts-filosofi.
  2. *Vercel hosting* — token + valgfrit Team ID, forbindes ÉN gang;
     derefter auto-deployer hvert kunde-Publish.
  3. *Database* — "connected · MongoDB". Uden DB lever alt på lokal disk
     (fint til test, men Vercel/Railway wiper ved redeploy). Sæt
     `MONGODB_URI` (gratis Atlas-cluster) og genstart — **første connect
     migrerer lokal data automatisk ind**. Gemmer: sites, versionshistorik,
     kunde-passwords og **formular-indsendelser**.
- "Public address clients log in at: https://….vercel.app" — CMS'et selv
  deployes til én offentlig URL.
- Pr. site-kort: preview-karrusel, "1 page · 1 version in history",
  "NOT HANDED OFF"-badge, knapper *View live site / Open editor / Export
  static*. **Client access**: sæt password → send kunden det rene
  editor-link; "Re-set the password any time to instantly revoke" ;
  checkbox **"Require my approval before their changes go live"** (!);
  alternativ: "generate a one-click private link". **Vercel project**:
  felt + *Save & deploy*.
- Tip i UI'et: "you can also just tell the Claude Code session a URL and
  it'll add the site for you" — onboarding er også en Claude Code-kommando.

**Kunde-login:** `…/editor/?site=<slug>` → varm lille boks: "Adam 👋
Enter the password to edit leverage" → *Unlock editor*. (Vores version:
dansk, fx "Hej Niels 👋 — indtast koden for at rette Jernbanecafeen".)

**Editoren (kundens view):**
- Topbar: site-vælger, side-vælger, device-preview (desktop/tablet/mobil/
  fuldskærm), knapper *Sections · SEO · Inbox*, undo/redo, status-dot
  (Unsaved/Published), **Save** (draft) og **Publish**.
- Badge øverst til venstre: "EDIT MODE · click any text".
- Klik på element → blå outline + chip ("Heading"/H1) + mini-toolbar
  *Edit | Style*; navigationslinks får "Link"-badge.
- Højre panel ved valg: ELEMENT-type, tekstfelt ("Edit here if it's hard
  to click, e.g. a button"), **SPACING**-sliders (space above/below,
  padding top/bottom, alle med "auto"-toggle), **TYPE & ALIGNMENT**
  (text size, line spacing, letter spacing, alignment) — med teksten
  **"Bounded so it can't break the layout."** Det er guardian'en
  materialiseret som UI: bundne sliders i stedet for fri CSS.
- Nederst til højre: chat "Ask AI to change anything…" med kontekst-chip
  "Editing: <valgt element> ×" — AI-chatten ved hvad der er markeret.
- *Pages*-panel (venstre): sideliste med slugs + slet-ikon; "ADD A NEW
  PAGE" med to skabeloner (*Blank — title + subheading* / *Article —
  blog-style post*), titel-felt, "+ Add page".
- *Inbox*-knap = **indbakke for formular-indsendelser fra sitet** (gemmes
  i DB). Dvs. kontaktformular-leads lander i CMS'et — stor værdi for vores
  kunder (frisører får bookingforespørgsler ét sted).

**SEO-panelet ("Search appearance"):** Google-SERP-preview (favicon,
domæne, titel, beskrivelse), felter: *Page title* (tæller /60),
*Description* (/160), *Focus keyphrase* → **"SEO score: Needs work —
3/10 checks passing"** med tre grupper: Problems (rød: "Add a meta
description", "Focus keyphrase is not in the SEO title"), Improvements
(orange: keyphrase ikke i meta/URL-slug/underoverskrift/første afsnit,
density 0,0 %), Good results (grøn: titellængde ok, 347 ord, 6 links).
Plus Social sharing, Advanced, hele-site-favicon. Footer: "SEO changes
stage as a draft — Save here, then Publish to go live."
→ Det er altså en **Yoast-agtig lokal tjekliste** (deterministisk,
keyphrase-baseret) — IKKE rigtige Google-data. Vores §7-plan beholder
denne UX som "Indhold-tjek"-fane og lægger PSI + Search Console ovenpå
som det ægte lag. (10/60-scoren i ét screenshot er keyphrase-feltets
tegn-tæller, ikke en score.)

**Hans prissætning (fra demo-sitets pricing-side, nyttig benchmark):**
Studio £4.800 engangs (op til 12 sider, custom design system, self-edit
CMS inkluderet, analytics + SEO, 30 dages support) · Care plan **£149/md**
(hosting + backups, self-serve CMS editor, versionshistorik, priority
support). Validerer vores model: CMS'et bærer abonnementet.

**Teknisk smådetalje:** dev-URL'en er `localhost:4321` (Astro-default-
port) — CMS-app'en er formentlig Astro eller node-server; uvæsentligt
for os, vi bygger på vores egen stack.

## 4. De to site-adaptere (afgørende detalje videoen springer let over)

Vores nuværende sites er mest **ren HTML** (zaytoon, salon-artec, street
cut …) og enkelte Next.js. Indholdet er hårdkodet. Derfor:

**Adapter B — statisk HTML (brug til ALLE eksisterende sites):**
1. Ved tilkobling "ingester" CMS'et sitet som hos Jack: hent den deployede
   HTML (eller læs repoet), markér redigerbar tekst/billeder med
   `data-cms="<nøgle>"` og spejl til `content`-dokument i DB.
2. Editoren redigerer DB-indholdet (live preview i editorens iframe).
3. "Udgiv" → CMS renderer ny statisk HTML og deployer. **To mekanismer,
   Lucas vælger (§9):**
   - **B1 — Jacks model:** deploy direkte til kundens Vercel-projekt via
     Vercel API ("no Git, no rebuilds", live på sekunder). Hurtigst at
     bygge og køre. MEN: kundens GitHub-repo bliver forældet — kilden til
     sandhed flytter ind i CMS'et. "Du ejer koden"-løftet kræver så en
     **"Export static"-knap** (som Jack har) + periodisk sync-commit til
     repoet.
   - **B2 — Git-modellen:** Publish committer den renderede HTML til
     kundens repo via GitHub API → Vercel auto-deploy (~30-60 s).
     Lidt langsommere, men repoet forbliver sandheden, git-historik =
     ekstra versionslog, og ejerskabsløftet holder af sig selv.
   - **Anbefaling: B2 som standard** (det er vores brand), B1 som
     mulighed for demoer/hastesager. Begge gemmer snapshot i DB først.
4. Rollback = re-publish af tidligere snapshot (begge mekanismer).

**Adapter A — Next.js (standard for NYE kundesites):**
1. Nye sites scaffoldes med et lille content-lag: server components læser
   `content`-JSON fra DB (med stabile nøgler pr. sektion) + fallback til
   committet `content.default.json`.
2. "Udgiv" → DB-write + on-demand revalidation (route handler med secret)
   → live med det samme, ingen redeploy.
3. "Boot logic" som hos Jack: ved kold start verificeres DB-forbindelse;
   ved DB-nedbrud serveres fallback-JSON (graceful, som jernbanecafeens
   Notion-integration allerede gør det).

**Ny side / nye sektioner:** kun via skabeloner vi har defineret pr. site
(fx "artikel", "behandling", "menu-punkt"). Kunden kan aldrig lave frit
layout — det beskytter designet. (Match til VIDA-planen: behandlings-
undersider med pris/beskrivelse/varighed er præcis sådan en skabelon.)

## 5. Kunde-editoren (dansk, ikke-teknisk målgruppe)

Fra videoens UI (storyboards bekræfter): live-sitet vises i editoren,
klik-markér en sektion → panel i højre side; inline tekstredigering direkte
i headlinen; venstre panel til sider; intet er live før "Udgiv".

Vores version, prioriteret:
1. **Ret tekst:** klik på tekst → ret den direkte (inline) eller i panelet.
2. **Skift billede:** klik på billede → upload (Vercel Blob, vi har token-
   mønsteret) ELLER "lav et nyt med AI" (KIE) med dansk beskrivelse.
3. **Spørg AI'en (dansk chat):** "Gør teksten om åbningstider venligere" →
   Claude returnerer et FORSLAG som diff (før/efter) → kunden godkender →
   draft opdateres. AI'en må KUN returnere content-patches valideret mod
   JSON-skemaet (= guardian, se §6).
4. **Sider:** tilføj/skjul side ud fra skabelon; omdøb i navigation.
5. **SEO-fanen:** se §7.
6. **Udgiv-knap** med venlig dansk bekræftelse + "Fortryd seneste
   udgivelse" (rollback til forrige snapshot — kunden kan selv).
7. **Indbakke (fra screenshots):** formular-indsendelser fra kundens site
   gemmes i DB og vises i en Indbakke-fane i editoren — kundens
   bookingforespørgsler/henvendelser samlet ét sted. (Senere: kobl til
   vores reply-assistent.)
8. **Afgrænsede style-justeringer (fra screenshots):** sliders for
   afstand/tekststørrelse/justering med "auto"-toggle — "bounded so it
   can't break the layout". Ingen fri CSS nogensinde.
9. **Device-preview:** desktop/tablet/mobil-knapper i topbaren.

Tone i al microcopy: jf. `KnowledgeOS/context/brand-og-tone.md` — varm,
jordnær, ingen tech-jargon ("Udgiv ændringer", "Fortryd", "Sådan ser det
ud nu"). Aldrig "deploy", "commit", "hydrate".

## 6. Guardian-laget (sikkerhed)

- AI og kunde kan KUN ændre værdier i content-skemaet (tekst, billed-URL,
  rækkefølge, synlighed). Aldrig kode, aldrig CSS, aldrig frie HTML-blokke.
- Server-side validering af hver patch: nøgle findes i skemaet, typen
  passer, længdegrænser (fx headline ≤ 80 tegn), ingen scripts/URL-schemes.
- AI-kald sker server-side med vores nøgle (aldrig i browseren), med
  per-site rate limit + månedligt token-budget (logges i `ai_log`).
- Adgang: kode pr. site (hashet, à la `hello6`-modellen men stærkere),
  session-cookie, brute-force-lås. "Re-set password = øjeblikkelig
  revokering" (fra screenshots) + alternativ "ét-kliks privat link".
  Master bag vores eksisterende basic auth-mønster
  (`VERCEL_BASIC_AUTH_*`). Senere: magic-link pr. mail.
- **Godkendelses-toggle pr. site** (fra screenshots): "Kræv min
  godkendelse før kundens ændringer går live" — kundens Publish lander
  da i en kø i Master Command i stedet for at gå direkte live. Perfekt
  til nye/usikre kunder; matcher vores approval-queue-mønster fra
  lead-systemet.
- AI-chat uden nøgle → deterministisk "local matcher"-fallback (find
  tekst → erstat) som hos Jack; systemet må aldrig være dødt uden API-
  credits (= ai.ts-mønsteret).
- MongoDB Atlas: IP-allowlist kan ikke være smal på Vercel (serverless) —
  brug stærk connection string + dedikeret DB-bruger med mindst mulige
  rettigheder (Jacks 0.0.0.0/0 + Drivers er reelt også sådan).

## 7. SEO-modulet — ÆGTE score (ikke teater)

Forskellen på os og "AI-slop"-CMS'er: vores score bygger på rigtige
datakilder. Researchens hovedkonklusioner (kilder nederst):

**Datakilder (gratis først):**
- **PageSpeed Insights API** — gratis, 25.000 kald/dag: Lighthouse
  performance + SEO-audits + CrUX felt-data. Rygraden.
- **Egne crawls** — vi renderer selv siderne, så vi kan validere alt
  deterministisk: title/H1 med ydelse+by, meta description, alt-tekster,
  OG-tags, sitemap/robots, canonical, intern linking, JSON-LD.
- **Google Search Console API** — gratis, kræver ejerskab: vi hoster
  sitet, så vi verificerer via Site Verification API/DNS én gang pr.
  kunde → RIGTIGE danske klik/visninger/positioner ind i panelet.
  Dette er "beviset" — vis det som separat "Ægte tal fra Google"-sektion.
- **Google Places/reviews** — har vi allerede i lead-systemet (rating,
  antal, recency) → genbrug til anmeldelses-delscore.
- Senere, hvis keyword-data ønskes: DataForSEO (min. $50 depositum,
  pay-as-you-go, danske bydata). Google Keyword Planner API er urealistisk
  for solo-dev (kræver spend + godkendelser).

**Scoringsmodel (auto pr. side):**

| Faktor | Vægt | Kilde | AI auto-fix? |
|---|---|---|---|
| Lokal on-page (ydelse+by i title/H1, meta, unik tekst) | 25 | egen crawl | Ja (forslag på dansk) |
| Struktureret data (LocalBusiness JSON-LD: NAP, åbningstider, geo) | 15 | egen validering | Ja (fuldautomatisk) |
| Google Business Profile-sundhed (tjekliste) | 15 | manuel/Places | Delvist |
| Anmeldelser (antal, recency, svar-rate) | 15 | Places API | Nej (AI-udkast til svar) |
| Teknik (sitemap, robots, canonical, OG, indekserbar) | 10 | crawl+Lighthouse | Ja |
| Core Web Vitals | 10 | PSI API | Delvist |
| Ægte søgetal (GSC: klik/visninger/position) | 10 | GSC API | Nej — det er resultatet |

**AI-søgning (GEO/AEO) — det nye Google:**
- Dokumenteret: god klassisk SEO er god GEO (AI Overviews citerer mest
  sider der allerede ranker). Konkrete løft: faktatæthed, direkte svar i
  første 40-60 ord, citerbare fakta (priser/åbningstider som TEKST, ikke
  billeder), entydig NAP, FAQ-indhold på siden, komplet JSON-LD.
- Hype vi IKKE sælger: `llms.txt` (Google bruger det ikke; ~0,1 % af
  AI-bot-trafik rører den). Kan tilbydes gratis som "skader ikke".
- Salgsclaim skal være ærlig: "best practice-efterlevelse + rigtige
  Google-måledata" — aldrig "garanteret placering".

GBP-delen er i øvrigt et naturligt mersalg: "vi sætter jeres Google-profil
ordentligt op" er ofte mere værd end hele sitet for lokal synlighed.

## 8. Master Command (vores side)

- Liste over alle sites: status, sidste udgivelse, "Åbn site"/"Åbn editor",
  snapshot-historik med ét-kliks rollback.
- Pr. site: adapter-type, repo, Vercel-projekt, AI-forbrug (tokens/kr),
  SEO-score-trend, kundens seneste aktivitet.
- Nøgler (Anthropic, KIE, GitHub-app-token, Vercel-token med scope) ligger
  som env vars i CMS-projektet — IKKE i UI'et som hos Jack (hans "indsæt
  token i dashboardet" er unødigt usikkert).
- Langsigtet: dette bliver et modul/faneblad i Command Center — men CMS'et
  bygges som selvstændig app først (jf. arbejdsaftalen: OS-UI'et venter).
- "Tilkobl nyt site" = en Claude Code-skill/playbook (vores pendant til
  Jacks prompts): given repo + Vercel-URL → content-extraction → skema →
  site-dokument i DB → editor-link + kode genereret → dansk velkomstmail-
  kladde til kunden (aldrig autosend, jf. vault-reglerne).

## 9. Beslutninger — LÅST af Lucas 2026-06-07

0. **Publish: B1 — direkte Vercel-deploy** (Jacks model). "Ejer koden"
   betyder for Lucas: han kan altid give kunden en opdateret eksport →
   "Export static"-knap + commit-til-repo når HAN vil er nok.
1. **Placering: eget repo `buur-cms`** + eget Vercel-projekt; bygges så
   Command Center senere kan integrere det (API/embed) — men ingen
   OS-UI-afhængighed nu.
2. **Database: MongoDB Atlas** (gratis tier, EU-region, jf. council/GDPR).
3. **Pilot: demo først (fx Mellow), derefter VIDA.**
4. **AI: alle kunder har AI-chat** via Lucas' Anthropic-nøgle (Claude
   Sonnet-klasse), fair-use loft pr. kunde (i KRONER, dags- + månedsloft,
   alarm ved 80 %); AI i dyrere pakker kan komme senere.
5. **Publish går direkte live** (som i videoen: guardian + snapshot +
   password er sikkerheden) + valgfri "kræv min godkendelse"-toggle pr.
   kunde.
6. **MVP = lille kerne + AI-chat:** ret tekst, skift billeder (upload),
   Udgiv/fortryd, dansk login, AI-chat på dansk. SEO-panel, indbakke,
   KIE-generering, style-sliders og side-oprettelse kommer SENERE.
7. **Design: lyst, varmt, dansk ro — og endnu mere kundevenligt end
   Jacks** (målgruppen er ikke-teknisk; se council-stemme 2).

Udestår (afgøres hen ad vejen): præcise pakkepriser (input i §11/§12),
CMS-domæne, virksomhedsnavn [TBD].

### Tidligere beslutningsgrundlag (bevaret til reference)

1. **Database:** MongoDB Atlas (1:1 med videoen, gratis tier, dokument-JSON
   passer perfekt til content+snapshots) **eller** Vercel Postgres/KV (alt
   hos én leverandør, vi har allerede KV-mønsteret). Anbefaling: **Mongo
   Atlas** — snapshot/dokumentmodellen er pasformen, og gratis-tier rækker
   langt.
2. **Pilot-site:** anbefaling: **én demo først** (fx Mellow — risikofrit),
   derefter **VIDA** som første rigtige kunde (aktiv, positiv, abonnement
   på 545 kr/md hvor "ret selv + SEO" giver abonnementet indhold) eller
   Jernbanecafeen (har allerede Notion-flowet — CMS'et kan erstatte/omfavne
   det).
3. **AI-budget:** nøgler er allerede købt (Agentech OS) — opret evt.
   separat CMS-nøgle med spend-limit.
4. **CMS-domæne:** fx `cms.buurski.dk` (eller hvad virksomhedsnavnet ender
   med — [TBD i vaulten]).
5. **Notion-integrationen** (jernbanecafeen): behold som adapter-variant
   eller migrér ind i CMS'et?

## 10. Byggefaser (til Claude Code, feature-branch, aldrig main)

- **Fase 0 — skema & skelet:** content-JSON-skema (sektioner/nøgler/typer),
  `buur-cms`-repo scaffoldes (Next.js 16/React 19 — læs
  `node_modules/next/dist/docs/` først, breaking changes!), Mongo-
  forbindelse, `sites`-collection, kode-login, basic auth på /master.
- **Fase 1 — editor-MVP (Adapter B):** ingest af pilot-demoen (fetch
  HTML → `data-cms`-nøgler → DB), iframe-preview, inline tekst-redigering
  (klik → outline → panel med afgrænsede style-sliders), billede-upload
  (Blob), draft → Udgiv (valgt mekanisme fra §9.0) → snapshot → rollback.
  Dansk UI inkl. login-skærmen ("Hej <navn> 👋").
- **Fase 2 — AI-redigering:** dansk chat-panel, patch-forslag som diff,
  guardian-validering, KIE-billedgenerering, ai_log + budgetter.
- **Fase 3 — SEO-panel v1:** Yoast-agtig "Indhold-tjek"-fane som i
  screenshots (SERP-preview, title/meta-felter med tællere, fokus-
  søgeord, rød/orange/grøn-tjekliste — alt deterministisk) + egne
  crawl-checks + PSI API + JSON-LD-generator + score efter §7-modellen;
  AI-auto-fix af title/meta/alt/FAQ. SEO-ændringer staged som draft.
- **Fase 3b — Indbakke:** formular-endpoint på kundesites → DB →
  Indbakke-fane i editor + Master Command.
- **Fase 4 — GSC-kobling:** Site Verification-flow, "Ægte tal fra Google"-
  panel. (Kræver service account-opsætning — genbrug Google-cred-mønstret
  fra lead-systemet.)
- **Fase 5 — Master Command:** site-liste, historik, rollback, forbrug,
  "tilkobl nyt site"-playbook. Adapter A (Next.js runtime-hydration) til
  første NYE kundesite.
- **Fase 6 — polish & onboarding:** dansk microcopy-gennemgang mod
  brand-og-tone, kunde-onboarding-mailkladde, dokumentation i vaulten
  (`wiki/os/` + én note pr. kunde i `wiki/kunder/`).

Hver fase: tests + browser-verifikation (kort `next start`, aldrig
`npm run dev`), commit på feature branch, statusmail til buur.aigro KUN
ved færdig fase (artefakt, ikke løbende snak — Dispatch til resten).

## 11. Forretningen (kort)

- CMS'et er abonnements-begrundelsen: "ret selv-adgang + ægte SEO-tal +
  vi passer på det hele" → 545-1.500 kr/md-pakkerne får synligt indhold.
- Salgsvinkel (på dansk, i Lucas' stemme): "Du ejer stadig det hele — nu
  kan du også selv rette det, uden at kunne komme til at ødelægge noget.
  Og du kan se med egne øjne i panelet, hvad Google viser."
- Skalerer: ét CMS, mange sites, næsten nul marginal-drift pr. kunde.

## 12. Council-resultat (2026-06-07) — indarbejdes i bygget

Fem-stemmers review (produkt, ikke-teknisk kunde, drift, forretning,
sikkerhed). Top 10, prioriteret — disse er nu KRAV til Claude Code:

1. **Én "Udgiv"-knap** med auto-gemt kladde — intet Save/Publish-split
   for kunden ("min hjemmeside er ikke ændret!"-fælden).
2. **Drift-detektion:** gem hash af sidst publicerede output; ændres
   sitet udenom CMS'et → stop Publish og vis "kør gen-ingest" i Master.
3. **GDPR:** databehandleraftale (Datatilsynets skabelon), Atlas i
   EU-region, auto-sletning af indbakke-beskeder (12 mdr.), slet pr.
   besked. Lucas er databehandler for formular-persondata.
4. **Åbningstider + menukort/prisliste som strukturerede felter** —
   den hyppigste rettelse for målgruppen; driver også JSON-LD. Plus
   "midlertidig besked"-banner ("ferie uge 29").
5. **Vercel-token scoped til dedikeret team** + deploy-log i DB +
   kvartalsvis rotation. Ét uskopet token = katastrofepunkt.
6. **Backup-cron:** Atlas free-tier har INGEN backups — ugentlig dump
   af alle collections til privat repo/Blob.
7. **Mobil-redigering fra fase 1** som formular-view (liste af felter →
   ret → Udgiv), ikke iframe-klik — Niels' computer er telefonen.
8. **Semi-manuel ingest:** Claude Code foreslår `data-cms`-nøgler,
   Lucas godkender én gang pr. site — aldrig runtime-regex-patching.
9. **Måneds-mail "din side i tal"** (besøg, GSC-klik, anmeldelser) —
   churn-værnet der gør abonnementet synligt. Fase 4-leverance.
10. **Skær v1:** drop style-sliders, side-oprettelse, KIE-generering,
    tablet-preview. (Allerede låst i §9.6.)

Eksplicitte fase 1-krav fra sikkerhedsstemmen: HTML-entity-escaping af
AL kundetekst ved render, CSP-header på kundesites, billed-URL'er kun
fra egen Blob, bcrypt/argon2 + login-rate-limit, tenant-isolation i
AI-laget (en kundes AI ser ALDRIG andre sites' indhold), snapshots som
content-JSON-diffs (ikke fuld HTML — Mongo 512 MB).

Forretning (input, ikke låst): pakkeforslag Basis 395 / Plus 595 (AI+
SEO+indbakke) / Pro 995 (GBP+rapport); Jacks benchmark er ~1.300 kr/md,
så Lucas' 545 er billig. 7 danske salgsformuleringer i Lucas' tone
ligger i council-rapporten (gem dem til outreach/brand-og-tone).

## Kilder

- Video: youtube.com/watch?v=Q_K3k_ge8NA (Jack Roberts) via NotebookLM-
  notebook 37434451-6c44-4acb-b436-be63519180e0 + storyboard-frames.
- Vault/repo: KnowledgeOS (brand-og-tone, design-viden, kunde-noter),
  lead-system (CLAUDE.md, .env.example, demos.ts, COMMAND_CENTER_VISION).
- SEO: Whitespark Local Ranking Factors 2026 · Princeton GEO-paper (KDD
  2024, arxiv 2311.09735) · Search Engine Land (GEO) · SERoundtable
  (llms.txt afkræftet) · PSI API-docs/kvoter · Google Site Verification +
  GSC API docs · DataForSEO pricing · DebugBear (CWV-vægt).

---

## Opdatering 2026-06-10 — Nordic Minimal redesign + device preview

Se `CMS_DEV_LOG.md` i `Workflows/buur-cms/` for komplet oversigt.

**Hovedændringer:**
- Nordic Minimal farvepalette (varm lysegrå + kobber, OKLCH)
- Sidebar 380px → 300px (bredere preview)
- Grå/glass baggrunde → solid `--surface` overalt
- AI input formindsket til smal sidebar
- Preview device toggle: viewport=1440/768/375, display:flex tvang fjernet
- Drag-resize split pane forsøgt → afvist (for mange fejl)
- Commit `bc877b7` (latest)
