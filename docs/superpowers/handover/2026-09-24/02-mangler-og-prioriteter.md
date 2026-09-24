# 02 — Hvad mangler, i prioriteret rækkefølge

Rækkefølgen er valgt efter: (1) risiko for skade (dobbelt-send, spam, datatab, sikkerhed), (2) det der
blokerer alt andet (merge), (3) omsætning (konvertering > flere leads), (4) det Lucas har bedt om.
Hvert punkt har en **færdig-betingelse** der kan tjekkes. Ret rækkefølgen hvis du finder noget bedre — men skriv hvorfor.

---

## A. Merge feature → main (BLOKERER ALT)

Feature-branchen `feat/crm-hq-2026-09-22` har 16 commits der ikke er i prod:
- `0ce6ddf` mail: From = kontoen der sender (DMARC), ren tekst-signatur uden billeder, send-besked skjules ikke
- `6659173` godkend: Til-felt + "mangler mail", link-katalog (kinly.dk-cases, branchesider, levende demoer) + top-5-forslag
- `0769a0f` professionel præsentation i kolde mails (Kinly som firma + cases); gamle salgselev-kladder oversættes
- `266c6b0` "Lav mail-kladde" fra virksomhedsprofil (CRM-oprettede virksomheder har negativt row_no og sås aldrig af motoren)
- `4807a2a`/`535d0b2` opgaver: redigér overalt, vigtig, note, ICS-kalenderfeed, /profil (Codex Sol-bygget, **ikke browser-verificeret**)
- `3023780`/`8135991` /kunder-kort, relationer mellem virksomheder, læsbar Viden (Codex Sol, **ikke browser-verificeret**)
- `5038d32`/`bc882aa` SEO-historik (PageSpeed ugentligt, grafer) (Codex Sol, **ikke browser-verificeret**)
- `8592b99` "Send svar direkte" (LIVE_SEND_ARMED) + svar-UI-rettelser, `8678f78` opgave-dato, `3ef9fad`, `97edab3`, `941d4f7` leadgen-mail-backfill

Plan (Codex Sol, se `raa/codex-sol-strategi.md`):
1. Tag `pre-merge-2026-09-2x`. Merge **main ind i feature** (ikke omvendt) i et rent worktree med rigtig `npm ci`.
2. Konflikter: `proxy.ts` (saml main's undtagelser + `api/kalender/`), `Sidebar.tsx` (main's bruger/avatar + `/kunder`), `RepliesClient.tsx` (**main vinder**: Scan nu via VPS, tråd, Svaret-knap; feature's direkte send lægges oven på KUN efter punkt B1).
3. Auth: **main's personlige adgangskode-login vinder.** Fjern magic-link som normal vej (CC_MAGIC) hvis det dublerer; behold Basic kun som nødvej (spec).
4. `/profil` (feature) vs `/settings` (main) → én side: kalenderlink + egne indstillinger i main's `/settings`, slet `/profil`.
5. Migrationer: omdøb feature's `0006_task_priority`, `0007_company_relation`, `0008_seo_snapshot` → `0008`, `0009`, `0010`; registrér i `drizzle/meta/_journal.json` (+ snapshots hvis drizzle-kit kræver dem); kør mod en PGlite-kopi først, så `scripts/db-migrate.mjs` mod Neon (`DATABASE_URL_UNPOOLED`) **før** deploy.
6. `npm run verify` grøn + browser-gennemklik af de 3 Codex-spor med screenshots (desktop + 390px) på lokal kopi af data.
7. Codex Sol-review af den samlede merge-diff (send-/auth-/proxy-filer) → ret → én prod-deploy → live-tjek (login-side, 401 uden login, /api/health, cron-ruter).
**Færdig når:** main indeholder begge sæt, Neon har 11 migrationer, prod svarer, begge personlige logins virker.

## B. Sikkerhed og send-vej (før eller i samme deploy som A)

1. **"Send svar direkte" (`src/app/api/replies/[leadId]/send-reply/route.ts`)**: bind modtager til det indlæste svar/lead (ikke `toEmail` fra request), sæt `In-Reply-To`/`References` så svaret lander i tråden, atomisk reservation (DB-lås/unik nøgle, ikke KV get→put), og hvis CRM-bogføring fejler efter SMTP: opret en synlig opgave "afstem manuelt". Indtil da: hold knappen skjult (`LIVE_SEND_ARMED` fjernes) — main's "Åbn i Gmail" dækker behovet.
2. **Approve-send**: "sendt men ikke registreret" hvis kø-update fejler efter SMTP (`src/app/api/approve/send/route.ts` ~465) → skriv en varig "sender"-status før SMTP og afstem.
3. **Charlie**: skal have et kinly.dk-login + app-password (charlie@kinly.dk som rigtig Workspace-bruger) → sæt `CHARLIE_GMAIL_USER/APP_PASSWORD`. Indtil da sender han fra sin gmail (feature-fix). Sæt den nuværende Charlie-env til *sensitive* (står i klartekst i Vercel).
4. `/api/approve/regenerate` har hardcoded Basic-legitimation på feature (main har fjernet den) — sørg for at main's version vinder; rotér Basic-koden.
5. ICS-feed-token er afledt af `AUTH_SESSION_SECRET` og kan ikke tilbagekaldes enkeltvis → gem et tilfældigt token pr. bruger i DB (roterbart fra /settings).
6. `/api/agent/*` er undtaget fra proxy (main): hver rute skal selv verificere HMAC; HMAC viser VPS'en, ikke personen → acceptér kun `actor` fra en allowlist pr. Hermes-profil.
7. VPS: `/root/.hermes/state/prod-env-decoded.env/.json` ligger dekodet på disk (marketing så det) → slet/flyt (bed Hermes default om det). To åbne next-servere på 0.0.0.0:3210/:4317 → luk.
8. Lucas' gamle app-password står i chat-transcriptet → nyt app-password når alt kører.
9. **KT VVS-case** (gren `agent/0924-kt-vvs-case`) viser telefon/personnavn i tekst, metadata og screenshots → sanér før merge; brug ikke KT VVS som case-link i mails før det (i dag linker `demos.ts` kun ktvvs.vercel.app-demoen, ikke en case — tjek).
11. GitHub melder 17 sårbarheder på lead-finder main (11 high, 25/9) → `npm audit` efter merge; nodemailer 8→10 kræver rigtig send-test til buur.aigro først.
10. Vercel Blob `putAsset` er public → ingen upload af upublicerede blog-billeder før privat adgang.

## C. Godkendelse + kolde mails (penge, kort sigt)

0. **Menneskelige penge-handlinger først** (cofounder): faktura 010/aftale med Jernbanecaféen, varme svar der venter, Ikast-pris. Tjek aktuel status i HQ/Gmail — det er mere værd end ny kode.

1. **Test hele send-kæden ende-til-ende** efter merge: én kladde med modtager `buur.aigro@gmail.com` (kun test-adressen!) → godkend → Send godkendte → verificér i modtagerens "Vis original": SPF/DKIM/DMARC = PASS, ren tekst-signatur, From lucas@kinly.dk. Færdig når headers viser pass.
2. Rigtig opvarmning: nyt domæne-send → maks ~20/dag i starten, 22–45 s pause (findes), ingen billeder/tracking-pixels, og list-unsubscribe-header (mangler — tjek).
3. 55 åbne kladder (24/9): tjek hvor mange der stadig mangler modtager efter `941d4f7`-backfill; kladder uden mail skal aldrig nå Afventer (filtrér ved ingest, eller autofind mail).
4. "Lav mail-kladde" bruger generisk `composeColdEmail` — mærk den tydeligt som standard-kladde i UI, og brug Hermes' research hvis den findes.
5. **Lead-motor 2.0** (påbegyndt: hilsen-fix + dublet-spærre på tværs af motor/VPS er i feature). Mangler: lavpris-/oplevelsesbrancher ud (Lucas: "perkerfrisører er ikke interessante"; data: bad_fit = storcentre, museer, 5.000+-anmeldelses-steder, kæder), rangering efter ICP v2 (`KnowledgeOS/wiki/os/ideal-kunde-icp-v2-2026-09-24.md` — cofounder), færre og bedre kladder pr. dag, Jev-kundeværdi. Kilde-strategi: **CVR som opdagelse** (gratis; Lucas skal skrive til cvrselvbetjening@erst.dk om system-til-system-adgang), Places kun til berigelse af shortlisten. Research: `KnowledgeOS/wiki/os/lead-system-analyse-2026-09-24.md`. Skills Lucas nævnte (agent-reach, scrapling, scrapegraphai) er **ikke evalueret** — kun til lokal research, aldrig i Vercel/VPS-kode uden vurdering.

## D. Lucas' ønsker fra 23/9, status

| Ønske | Status |
|---|---|
| Opgaver i Google Kalender (Lucas + Charlie) | ICS-feed bygget (feature, uverificeret). Google opdaterer abonnementer kun hver ~8–24 t. Ægte sync kræver OAuth pr. person (main-spec: separat forbindelse pr. konto, `sendUpdates=none`). Composio må ikke bruges i prod. |
| Charlie ser sine opgaver ved login | Bygget (feature: Min dag/HQ filtrerer på `currentUser()`) — verificér med main's nye sessioner |
| Vigtigste opgaver synlige på HQ | Bygget (feature: `important`) — uverificeret |
| Rette opgaver overalt | Bygget (TaskEditDialog) — uverificeret. Opgaven "Bestil Google-anmeldelseskort … afventer verificering fra Allan" er rettet i DB |
| Egen profil med indstillinger | main har `/settings` (konto, skift kode); feature har `/profil` → slå sammen (A4) |
| Send fra lucas@kinly.dk + Charlie, undgå spam | Lucas: env skiftet ✓, DMARC aligned. Charlie: se B3. Ren tekst-signatur: feature |
| Svar direkte fra CRM | feature — **blokeret af B1**; main har "Åbn i Gmail"-tråd |
| Se hvad vi har skrevet til folk / mail-tidslinje pr. kunde | **Ikke bygget.** Kunde-tidslinjen viser mail-resuméer fra Hermes' crm-mail-sync (som marketing siger er slået fra!). Byg: læs Sendt-mappe (IMAP lucas@kinly.dk) → aktivitet pr. virksomhed (match på modtager-domæne). Interaktiv tidslinje (filtrér type, fold ud) — ikke pynt |
| Kundeopdateringer (Lucas forstod ikke hvad det er) | Omdøb/forklar i UI ("Fortæl kunden hvad vi har lavet" + eksempel), eller skjul indtil brugt |
| SEO som egen fane + graf for kinly.dk og kunder | Bygget (feature, uverificeret). Måler PageSpeed/on-page, **ikke** søgeord/positioner/GEO → navngiv ærligt; kobl marketings geo-log + GSC ind senere |
| Hermes i docken: "log arbejde", "ny aftale", "flyt i pipeline", forslag-knapper | main har `/api/agent/tasks` + `/api/agent/read` + streamende chat. Mangler: agent-handlinger for aktivitet/aftale/pipeline-fase med bekræftelse i docken + forslag-chips ("Få Hermes til at …") |
| Kunder som kinly.dk/projekter (kort), alle virksomheder sekundært | Bygget (/kunder, feature, uverificeret). **Lej en Kok findes ikke i CRM'et** → opret og relatér til Jernbanecaféen |
| Relationer mellem virksomheder, selv kunne tilføje | Bygget (feature, uverificeret) |
| Viden læsbar | Bygget (md-renderer, feature, uverificeret) |
| Manuelt tilføjet virksomhed → kladde i godkendelse | Bygget ("Lav mail-kladde", feature) |
| Demo-vælger med kinly.dk-cases + top 5 | Bygget (feature) |
| "Kontaktet før" i godkendelse | Findes (history-badge) + dublet-spærre på tværs af kilder (motor/VPS, navn+by, ApS-varianter) + hilsen-fix — merget ind i feature 24/9 (`dd329d2`) |
| Scraping-skills | Ikke evalueret |

## E. Gratis udkast (Hermes bygger)

Flowet: formular/"ja tak"-svar → preview-kø (KV) → Hermes `kinly-preview-intake` bygger demo → CRM "Gratis udkast"-side → I sender med ét klik (højst én gang). Hermes-brief v2 (Sol til første udkast, Luna/DeepSeek til rettelser, referencer ud fra Jev-profil, kun kundens egne data, uafhængigt tjek) er sendt 23/9. Space Bunny må ikke lave design (Lucas 24/9). **Verificér:** er der kommet et rigtigt udkast igennem hele kæden siden? Se 03-hermes for status.

## F. Marketing / kinly.dk / blog (Hermes marketing ejer — se 03, **06-blog-pipeline.md** og raa/)

0. **Blog-boardet i HQ** er et hovedspor (Lucas 24/9): pipeline med træk mellem stadier, manuelle idéer som Hermes bearbejder, idé-signaler fra CRM-cron, rating på alt, billeder A/B, udgiver-cron. Plan og status: 06.

1. /blog: den gren der skal merges er `agent/0924-blog-kinly-site` @ `85f598f` (godkendt, noindex når tom, kun udgivne opslag, tomt sitemap). **Én rettelse før merge (Claude-tjek 25/9):** "Blog" står i topmenu (`content/site.ts:78`) og footer (`:105`) selvom der er 0 rigtige opslag → vis kun linket når `publishedPosts.length > 0`. Status/gates: `KnowledgeOS/wiki/kinly/blog-handoff-2026-09-25-b4-fix.md`. Tidligere note:, men `/blog/` skal ikke indekseres før ≥1 rigtigt opslag er publiceret. Lucas skal svare på "SKAL TJEKKES" i bunden af `KnowledgeOS/drafts/blog/*.md` + sætte `BLOG_PUBLISH_LIVE=1`.
2. Stop `agent-blog-cyklus` (mandag 08:00) indtil /blog er live — ellers kladde #4 oven på 3 uudgivne (bed Hermes marketing om det).
3. Forsidens pris-forenkling (live) fjernede upsell-linjen og "ikke inkluderet"-listen → Lucas bekræfter bevidst, ellers genindsæt upsell-linjen.
4. Mål konvertering, ikke positioner: 16 besøg / 0 kontaktklik / 0 formularer på 28 dage. Hver kanal (blog-opslag, seo-tjek, kold mail) skal have sin egen indgangs-sti (UTM/ref) så HQ kan vise henvendelser pr. kilde.

## H. Kunde-synlighed (Lucas 25/9 — se 07)

0. /kunder som kinly.dk/projekter-kort med faner Kunder · Varme · Leads · Ikke egnet; SEO som egen sektion med Jev-drevne "Opdateringer" og grafer (se 07, PRÆCISERING).
1. HQ: "Bliver fundet"-kort pr. kunde med GSC (visninger/klik/top-søgninger) + GEO fra Hermes. Start med Ikast.
2. kinly.dk/projekter: ens kunde-kort med mockups + ét verificeret resultat (efter audit; KT VVS først efter sanering).
3. Forsiden: "Resultater"-stribe KUN med stærke, verificerede kunde-tal og kundens accept.

## G. Ud af boksen (ingen har bedt om det — vurdér, byg kun det der giver penge)

1. **"Lovet kunden"-liste** (hvem, hvad, deadline) — Codex. De fleste kunde-irritationer er glemte løfter.
2. **Ugentlig afstemning Sendt-mappe ↔ CRM/kø** (fanger "sendt men ikke registreret" og mails sendt udenom systemet).
3. **Kundekort for drift:** domæne-fornyelse, DNS/adgang, backup-ansvar, CMS-login, GBP-ejer — én gang pr. kunde.
4. **Tilbud → accept → første faktura** som ét flow (accept-link, pakkepris fra kinly.dk, start-betaling). Uden CVR: kun tilbud/accept nu.
5. **Anmeldelses-/henvisningsloop** 14 dage efter levering (kladde til kunden: Google-anmeldelse + "kender du én der …").
6. **Nav-diæt:** Charlies 5 (HQ, Kunder, Opgaver, Indbakke, Økonomi) i railen; resten under "Mere"/Lucas.
7. **Alarmer til Charlie/Lucas** når en cron fejler 2 gange i træk (i dag ser kun Lucas det, hvis han kigger).
