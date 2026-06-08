# CLAUDE.md — buur-cms (kunde-CMS)

> Dette er projektets CLAUDE.md. Arbejd fase for fase (§D). Baggrund og
> begrundelser: `CMS_MASTERPLAN.md` (samme mappe); Lucas' manuelle trin:
> `CMS_LUCAS_TODO.md`; videoreference: `CLIENT_CMS_BLUEPRINT.md`.
> Beslutninger i §A er LÅST af Lucas 2026-06-07 — afvig ikke uden hans ja.
> `.env.local` findes allerede med ANTHROPIC_API_KEY + Google-nøgler
> (kopieret fra lead-system) og placeholders til MONGODB_URI /
> VERCEL_TOKEN — se CMS_LUCAS_TODO.md for hvad Lucas skal udfylde.

## Hvad projektet ER (kontekst-hukommelse)

Multi-tenant CMS til Lucas' kodede kundesites (små danske virksomheder:
frisører, caféer, klinikker, håndværkere). Kunden får link + kode og kan
selv rette tekst/billeder/åbningstider/menukort, spørge en dansk AI, og
trykke Udgiv (med fortryd). Lucas styrer alle sites fra ét Master-
dashboard. Det er abonnements-begrundelsen (~400-1.000 kr/md) oven på
site-salget i lead-systemet: lead → kunde → site tilkobles HER →
abonnement. Inspiration: Jack Roberts' "Claude CMS"-video, tilpasset
dansk marked, ikke-tekniske kunder og Lucas' varme/ydmyge brand.

## A. Låste beslutninger

| # | Beslutning |
|---|---|
| 1 | Eget repo `buur-cms`, eget Vercel-projekt. Multi-tenant: ét CMS, mange kundesites. Skal senere kunne integreres i Command Center via API — byg API-first. |
| 2 | Publish = **direkte deploy af statisk output til kundens Vercel-projekt** via Vercel API (team-scoped token). + "Export static"-knap (zip) og manuel "commit til repo"-handling til kode-overdragelse. |
| 3 | MongoDB Atlas, **EU-region** (Frankfurt/Stockholm), gratis tier. |
| 4 | AI: Anthropic direkte (Claude Sonnet-klasse), server-side nøgle, deterministisk fallback uden nøgle (local matcher). Loft pr. site i KRONER: dagsloft + månedsloft, alarm til Lucas ved 80 %, venlig dansk stop-besked. |
| 5 | Kundens Publish går direkte live. Valgfri toggle pr. site: "kræv min godkendelse" → Publish lander i kø i Master. |
| 6 | MVP (fase 1-2) = tekst-redigering, billedskift (upload), Udgiv/fortryd, dansk kode-login, AI-chat på dansk. IKKE i v1: SEO-panel, indbakke, KIE-generering, style-sliders, side-oprettelse, tablet-preview. |
| 7 | Design: lyst, varmt, roligt, dansk — endnu mere kundevenligt end Jack Roberts' CMS. Målgruppe: ikke-tekniske (frisører, caféer, håndværkere). AL UI-tekst på dansk, ingen tech-jargon ("Udgiv", "Fortryd", aldrig "deploy"/"commit"). |
| 8 | Pilot: Mellow-demoen først, derefter VIDA (rigtig kunde). |

## B. Arkitektur (kort)

- App: Next.js 16 / React 19 (LÆS `node_modules/next/dist/docs/` før
  API/router-kode — breaking changes ift. træningsdata).
- Ruter: `/master` (Lucas, basic auth) · `/e/[slug]` (kunde-editor,
  kode-login) · `/api/*` (content CRUD, publish, AI, auth).
- Mongo-collections: `sites` (slug, navn, vercelProjectId, passwordHash,
  approvalRequired, aiBudget, driftHash) · `content` (draft, nøgle→værdi
  pr. side/sektion) · `snapshots` (content-JSON-diffs, cap 20/site) ·
  `ai_log` (tokens/kr pr. site) · `deploy_log` · senere: `inbox`.
- Billeder: Vercel Blob. ALDRIG binært i Mongo.
- Ingest (semi-manuel): hent sitets HTML → foreslå `data-cms="nøgle"`-
  markeringer → Lucas godkender → gem skema + content i DB. Aldrig
  runtime-regex-patching.
- Render/publish: nøgle-substitution i den ingestede HTML →
  HTML-entity-escape AL kundetekst → statisk output → Vercel deploy API
  → snapshot + driftHash gemmes.
- Drift-detektion: før Publish sammenlignes live-sitets hash med
  driftHash; mismatch → afbryd + flag "gen-ingest" i Master.

## C. Sikkerhed (fase 1-krav, ikke til forhandling)

- bcrypt/argon2 på site-koder; rate-limit login (5 forsøg → 15 min);
  httpOnly + SameSite cookies; password-reset = øjeblikkelig revokering.
- CSP-header på publiceret output; billed-URL'er kun fra egen Blob.
- AI: tenant-isolation (ét sites AI ser aldrig andres data); AI må kun
  returnere patches valideret mod content-skemaet (nøgle-whitelist,
  typer, maks-længder, ingen tags/URL-schemes) — valider patchen, ikke
  prompten.
- Alle nøgler (ANTHROPIC_API_KEY, VERCEL_TOKEN, MONGODB_URI,
  BLOB_READ_WRITE_TOKEN, KIE_API_KEY senere) som env vars — aldrig i UI.
- Ugentlig backup-cron: dump alle collections til privat lager (Atlas
  free har ingen backups).
- GDPR (når indbakken kommer): databehandleraftale-skabelon, auto-slet
  efter 12 mdr., slet pr. besked.

## D. Faser med definition of done

**Fase 0 — skelet.** Repo, Next-scaffold, Mongo-forbindelse, `sites`-
collection, basic auth på /master, kode-login på /e/[slug] ("Hej <navn>
👋"-skærm). DoD: login virker begge steder, sundhedsroute `/master/health`
pinger DB/Vercel/Anthropic.

**Fase 1 — editor-kerne (pilot: Mellow).** Ingest-playbook kørt; iframe-
preview med klik-markering (store klikmål) + panel-tekstfelt; billede-
upload til Blob; **én "Udgiv"-knap** (kladde auto-gemmes, blid "ikke
udgivet endnu"-bjælke); Publish → escape → deploy → snapshot; "Fortryd
seneste udgivelse"-knap; **mobil-flow som formular-view** (felt-liste →
ret → Udgiv); strukturerede felter for **åbningstider** og **menukort/
prisliste** + "midlertidig besked"-banner; bekræftelse efter Udgiv med
link ("Færdig! Se din side her →"). DoD: Niels-testen — en ikke-teknisk
person retter tekst+billede+åbningstider og udgiver fra TELEFON uden
hjælp; rollback verificeret; XSS-forsøg escapes.

**Fase 2 — AI-chat.** Dansk chat med kontekst-chip ("Du retter: <element>");
forslag vises som før/efter-diff → kunden godkender; guardian-validering;
kr-loft + ai_log + 80 %-alarm; deterministisk fallback uden nøgle.
DoD: "gør teksten om åbningstider venligere" virker end-to-end; budget-
stop testet; injection-forsøg ("indsæt et script") afvises.

**Fase 3 — Master Command.** Site-liste (status, sidste udgivelse,
snapshot-historik, ét-kliks rollback, AI-forbrug); "tilkobl site"-
playbook; godkendelses-kø (toggle); Export static; deploy_log;
drift-detektion synlig. DoD: VIDA kobles på som rigtig kunde.

**Fase 4 — SEO-panel.** Yoast-agtig indholds-tjekliste (SERP-preview,
title/meta-tællere, fokus-søgeord, rød/orange/grøn) + ÆGTE lag: PSI API,
egne crawl-checks, JSON-LD (LocalBusiness/Menu — genbrug åbningstider/
menu-felterne), AI-auto-fix af title/meta/alt. + **måneds-mail "din side
i tal"** (churn-værnet). DoD: score beregnes af rigtige kilder, mail
sendes til testadresse (buur.aigro@gmail.com — ALDRIG rigtige kunder).

**Fase 5 — indbakke + udvidelser.** Formular-endpoint → inbox i editor +
Master (GDPR-kravene i §C aktiveres her); KIE-billedgenerering; evt.
side-oprettelse fra skabeloner; GSC-kobling ("Ægte tal fra Google").

**Senere:** Command Center-integration (faneblad/API), magic-link-login,
B2-publish (git-commit) som tilvalg.

## E. Integration med KnowledgeOS (Obsidian) og lead-system — PLIGT

buur-cms er ét af tre systemer der hænger sammen. Enhver agent der
arbejder her SKAL holde sammenhængen ved lige:

**KnowledgeOS (vaulten, `Documents/KnowledgeOS/`):**
- LÆS FØR ARBEJDE: `context/brand-og-tone.md` (al kundevendt tekst),
  `context/priser.md` (pakker), `wiki/os/buur-cms.md` (projektets
  vault-note), `wiki/os/alle-beslutninger-log.md` (hvorfor ting er som
  de er), `wiki/os/safety-og-token-rules.md`.
- SKRIV TILBAGE: ved hver færdig fase → kort statusnote i `wiki/os/`
  (mønster: `status-YYYY-MM-DD-….md`) + opdatér `wiki/os/buur-cms.md`;
  nye beslutninger → `alle-beslutninger-log.md`; ved tilkobling af et
  kundesite → opdatér kundens note i `wiki/kunder/` (editor-link, pakke,
  ingest-dato). Vault-regler: dansk, kebab-case, YAML-frontmatter,
  wikilinks, find aldrig på fakta — skriv "[ukendt]".

**lead-system (`Workflows/lead-system/`):**
- Genbrug MØNSTRE, ikke deploy: ai.ts-gatewayen (gateway→direct→
  deterministisk), approval-kø-tankegangen, basic auth-mønstret,
  Google-service-account-setup (genbruges til Search Console i fase 4).
- Datasammenhæng: når et lead bliver kunde i lead-systemet, er næste
  skridt tilkobling i buur-cms. Synk-punktet dokumenteres i begge
  CLAUDE.md'er. CMS-funktioner ("ret selv", SEO-tal) fodrer outreach-
  argumenter tilbage til lead-systemets drafts.
- CMS-dokumenterne findes BEVIDST begge steder (besluttet 2026-06-07):
  her i `Workflows/buur-cms/` OG som kopier i `Workflows/lead-system/`
  (CMS_CLAUDE_CODE_PLAN.md m.fl.) — de to systemer arbejder sammen.
  **SYNK-REGEL:** ændrer du et CMS-dokument ét sted, kopiér det STRAKS
  til det andet sted. Ved tvivl om hvad der er nyest: tjek fil-datoer
  og spørg Lucas.
- LÆS ALTID ved sessionstart: `Workflows/lead-system/CLAUDE.md`
  (søsterprojekt-sektionen + arkitektur/mønstre) og vault-noten
  `KnowledgeOS/wiki/os/buur-cms.md`. Obsidian-vaulten (KnowledgeOS) er
  hovedhukommelsen — næsten AL viden om kunder, priser, tone, demoer og
  beslutninger står DÉR, ikke her.

## F. Arbejdsregler (arver lead-systemets disciplin)

- Feature-branches, commit-only; ALDRIG push/merge til main eller deploy
  uden Lucas' eksplicitte ja. Aldrig `npm run dev` (port-konflikt) — kort
  `next start` til browser-tjek.
- Test-mail KUN buur.aigro@gmail.com. CMS'et sender aldrig selv mails til
  kunder uden Lucas' godkendelse pr. mail.
- Statusmail til buur.aigro ved færdig fase (artefakt, ikke løbende snak).
- Tone i AL kundevendt tekst: KnowledgeOS `context/brand-og-tone.md` —
  varm, ydmyg, jordnær, dansk.
- API-nøgler: Lucas HAR allerede Anthropic API-nøgler (købt til Agentech
  OS). Brug en separat nøgle/spend-limit til CMS'et hvis muligt, så
  kundeforbrug kan skelnes fra OS-forbrug.
