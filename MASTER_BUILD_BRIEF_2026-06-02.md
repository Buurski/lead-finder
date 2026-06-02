# MASTER BUILD-BRIEF — Lead-system overhaul → personlig outreach-motor
**Dato:** 2026-06-02 · **Til:** en frisk Claude Cowork-samtale der skal bygge det her
**Forfatter:** Cowork (under en scheduled-task-session sammen med Lucas)

---

## 0. Sådan bruger du (næste Claude) denne fil

Lucas giver dig denne fil i en ny samtale. Den indeholder **alt** vi har aftalt: kontekst,
diagnose med rigtige tal, den strategiske retning, Lucas' beslutninger, og en sekventeret
byggeplan. Læs den helt igennem først. Projektmappen er forbundet:
`C:\Users\Buur\Documents\Workflows\lead-system` (i sandbox: `/sessions/<id>/mnt/lead-system/`).
Læs også `CLAUDE.md`, `PRODUCT.md`, `README.md`, og denne mappes andre nye filer
(`OPTIMIZATION_IDEAS_2026-06-02.md`, `OVERHAUL_PROPOSAL_2026-06-02.md`,
`PERSONALIZATION_ENGINE_PLAN_2026-06-02.md`).

**Vigtigt:** Lucas vil **planlægge og bygge i den rækkefølge der giver mening** — spørg ham
før store skridt, men du har frie hænder til oprydning og de moduler der er klart aftalt her.

---

## 1. Hvem er Lucas, og hvad er det her

- Lucas er **salgselev** til daglig og bygger hjemmesider som **hobby ved siden af**. Dansk
  marked. Han sælger websites til lokale virksomheder.
- Framing er ALTID: hobby/under oplæring + gratis demo hvis interesseret. **Aldrig** "pro-bureau".
- Han arbejder ofte i det her **sammen med sin makker**, og vil sætte det op fælles (evt. i
  Obsidian) så de begge kan se og styre det. UI'et betyder noget for ham — han vil **se** at
  det virker, selv hvor det ikke er strengt nødvendigt.
- Primær arbejds-inbox: `buur.aigro@gmail.com`. Dispatch til ad-hoc status.
  `shadowporo123@gmail.com` = Claude-konto/identitet, ikke en arbejds-inbox.

## 2. Det vigtigste skift (kernen i hele overhaulen)

Det der **reelt vinder kunder** er ikke masseudsendte skabelon-mails. Det er når Lucas beder
Cowork/Claude om at skrive til en bestemt kunde, og Claude så **researcher dem** (hjemmeside,
Facebook/Instagram, Google, anmeldelser), finder noget **specifikt og personligt**, og skriver
en **varm, menneskelig** besked. Bevis: hans første beauty-kunde (**VIDA**, se §5) blev vundet
sådan — manuelt, personligt — ikke via den automatiske skabelon-pipeline.

**Vi bygger den arbejdsgang som systemet:** færre, langt bedre, dybt personlige beskeder med
Claude i loopet på hver enkelt lead. Vercel-appen i dag gør det modsatte (blaster skabeloner
via Gmail, der ikke leverer godt) — det vender vi om.

### Loopet
```
PICK → RESEARCH → QUALIFY → DRAFT → APPROVE → SEND → LEARN
```
1. **PICK** — find de bedst egnede, *professionelle* leads (se §6 kvalificering).
2. **RESEARCH** — Claude undersøger hver lead (web + FB/IG + Google + anmeldelser) → 1-2 ægte kroge.
3. **QUALIFY** — Claude vurderer: er det en etableret virksomhed der *har råd*? Hvis nej → drop.
4. **DRAFT** — menneskelig besked der bruger krogen, i Lucas' stemme, **2 demoer**, ingen robot-CTA.
5. **APPROVE** — Lucas (og makker) ser udkastene i et UI / digest og godkender/retter.
6. **SEND** — rigtig kanal (mail eller Messenger), pacet.
7. **LEARN** — svar/kunde registreres automatisk → feeder targeting.

## 3. Nuværende arkitektur (hvad der findes nu)

- **Next.js 16 / React 19** app i `src/` (App Router). Deployet på Vercel.
- **Google Sheets = database.** Sheet ID `1it8BeujksJjZuMAFaFaA0j11UDAA_afFP1BqgViVFJ8`.
  - `Leads!A2:U` (kolonner: A navn, B branche, C tlf, D by, E score, F kilde, G website,
    H wsStatus, I status, J noter, K opdateret, L kvalitetstier, M enrichedInfo, N email,
    O emailSentAt, P emailOpenedAt, Q emailClickedAt, R emailStatus, S followupSentAt,
    T reviewsCount, U callbackDate). Række = id; rowIndex = id − 2.
  - `Clients!A:I` (navn, branche, tlf, briefFilled, projectFolder, websiteStatus, monthlyFee, setupFee).
  - `PauseSchedule!A2` = halt-flag for cold-send (pt. armeret til **2026-07-01** → cold-path er PÅ pause).
- **Kerne-libs:** `src/lib/email.ts` (skabeloner, demo-URLs, voice), `apify.ts` (BRANCHES, CITIES,
  scoreLead), `sheets.ts` (alle reads/writes, websiteQualityBonus), `chains.ts` (kæde-detektion),
  `folders.ts` (Drive-mapper).
- **API-ruter:** scrape, verify-all, email/bulk-find-emails, email/bulk-send, email/send-followups,
  email/sync-replies, email/sync-bounces, email/track/{open,click}, leads/* (cleanup, status, enrich…).
- **Den reelle daglige drift** sker i **~40 engangs-scripts i `.send_queue/`** + scheduled tasks +
  Cowork-kørsler. Logikken (kandidatfiltre v4/v5, voice-regler, `KNOWN_HANDLES`) lever i scripts,
  ikke i appen → **drift mellem de to systemer**.
- **Scheduled tasks:** `lead-batch-morning` (07:02, 50 email-udkast til godkendelse),
  `lead-messenger-morning` (07:06, messenger-digest), `lead-batch-autosend` (DISABLED).
  SKILL.md-filer i `C:\Users\Buur\Documents\Claude\Scheduled\<task>\`.
- **Kanaler:** (a) cold email via nodemailer/Gmail SMTP, (b) Messenger-digest (Lucas paster
  selv fra mobilen), (c) manuel/agent-personlig outreach (det der virker).

## 4. Diagnose — hvad vi fandt (rigtige tal, 2026-06-02)

**Funnel (8.469 leads):** 5.063 med email · ~809 mails sendt · **84 svar (~10 %)** ·
31 bounces (3,8 %) · **9 åbninger · 0 klik.**

**Svarrate pr. segment:**
| Segment | Sendt | Svar | Rate |
|---|---|---|---|
| photo | 26 | 5 | **19,2 %** |
| food | 290 | 37 | **12,8 %** |
| craftUtility (VVS/el) | 74 | 9 | **12,2 %** |
| beauty | 218 | 18 | 8,3 % |
| other | 118 | 8 | 6,8 % |
| craft | 59 | 4 | 6,8 % |
| professional | 64 | 3 | 4,7 % |

**Kunder (Clients-fanen):** Vestfjends VVS, Zaytoon, Restaurant Under Klippen, **Vida** (tilføjet i dag).

**Kritiske fund:**
1. **Klik-tracking er død kode.** `buildTrackedClickUrl()` i `email.ts` bruges ALDRIG — demo-links
   er rå URL'er → 0 klik. Åbnings-pixel er upålidelig pga. Gmails image-proxy (kun 9 åbninger).
   → **Drop al tracking. Mål på SVAR** (eneste pålidelige signal, trækkes direkte fra arket).
2. **`bulk-find-emails/route.ts` er i stykker** — to `export async function POST()` (ca. linje 220
   og 262) + et afhugget fragment linje 258. Kompilerer ikke som den står. Skal ryddes op.
3. **E-mail-finderen er forældet** og missede VIDA: bruger `LeadBot/1.0`-UA (bot-blokeres),
   kigger kun på hjemmeside + CVR (ikke FB/IG/booking), og **kasserer gmail/hotmail** med mindre
   domænet matcher. Beauty rammes hårdest.
4. **To kilder til sandhed:** pipeline-status i arket vs. messenger/queue-state i `.send_queue/`
   JSON-filer. Kan komme ud af sync (som da VIDA blev vundet men aldrig registreret).
5. **84 svar, men kun ~3 blev til kunde/interested.** Reply-håndtering kan give flere kunder.

**Beauty-opportunity (1.234 beauty-leads):**
- **602 uden brugbar email** (VIDA var én af dem) — heraf **164 med score ≥60, ikke håndteret**
  → kræver bedre email-finding (eller messenger-bro).
- **419 med email, aldrig kontaktet** → kan mailes når cold-path åbnes (pt. pauset til 2026-07-01).

## 5. VIDA — den vundne kunde (lær af den)

- Række **6942**: "Vida", **Skønhedssalon, Aalborg**, vida-klinik.dk, score 77, 104 anmeldelser.
- Vundet **via e-mail**, men leadet stod i arket med **email = "none", status = "new"** → systemet
  havde aldrig registreret den. Email blev fundet **manuelt** (systemet kunne ikke).
- **Lektien:** dine bedste kunder gemmer sig i den bunke leads systemet smider væk som "ingen email"
  + den personlige tilgang vinder. I dag opdaterede vi række 6942 → `client` og tilføjede Vida til
  Clients-fanen. (monthlyFee/setupFee/brief mangler — Lucas udfylder.)

## 6. ★ Professionel lead-kvalificering (Lucas' vigtigste krav)

**Problem:** når Cowork finder leads (især til messenger) rammer den ofte **billige
lav-pris-shops** (typisk personligt-fornavn barbershops/saloner) der **ikke har budget** til en
hjemmeside. Det skal være **mere professionelt**. (NB: vores Sharwan-eksempel var præcis denne
forkerte profil — godt eksempel på hvad der IKKE skal targetes.)

**HARD DROP (target ikke):**
- Personligt-fornavn-shops: "Frisør Adnan", "Hos Jonas", "Sharwan Barbershop", "Walids Frisør" osv.
  (efter at have strippet Frisør/Salon/Barber-præfiks → er residuen et fornavn? → drop).
- Billig-keywords: billig, quick, express, discount, hurtig, low-cost, "10 min klip", "herreklip XX kr".
- Generisk "barbershop + mandenavn" uden brand.

**FAVORISÉR (target):**
- **Brand-navne:** Studio, Lounge, Koncept, House, Huset, Atelier, Salonen, "Salon + bynavn".
- **Premium-ydelser:** balayage, extensions, keratin, bryllupsstyling, makeup-artist, hudpleje/
  kosmetolog med behandlinger (ikke bare klip) → højere ticket = har råd.
- **Etableringssignaler:** højt anmeldelsesantal **og** høj rating (fx ≥4,5 og ≥80 anmeldelser),
  eget domæne (selv hvis gammelt), professionel Instagram, online booking med priser i den højere ende.
- **Geografi:** mere velstående områder / bycentre.
- **Budget-signal via website-tier:** "eget domæne + mediocre/old + brand-navn + mange anmeldelser"
  = ideel (har omsætning, trænger til opgradering). "ingen side + personligt navn + billigt" = undgå.

**Bedste mekanisme (anbefalet):** byg kvalificeringen ind i **RESEARCH/QUALIFY-trinnet** som en
**LLM-gate** — Claude vurderer under research: *"Er det her en etableret, mere professionel
virksomhed der realistisk har råd til en hjemmeside til 5-15k? Ja/Nej + begrundelse."* Hvis nej →
drop før draft. Det fanger det som regex-filtre ikke kan. Kombinér med de hårde regex-drops ovenfor
som et hurtigt forfilter.

## 7. Voice-guide — menneskelige beskeder (Lucas' krav)

**Drop disse (robot-fraser):** "skriv hvis du vil se mere :)", "helt uforpligtende", "lille idé
til …", den generiske komplimentsætning, og alt der lyder som en skabelon.

**Regler:**
- Hver besked **åbner med noget kun denne lead har** (fundet i research) — ægte, specifikt.
- Lyder som et menneske der faktisk har set på dem. Variabel længde/formulering.
- **2 demoer i hver mail** (Lucas-krav) — vis variation, da hver demo er forskellig. Vælg de 2
  mest relevante for branchen.
- Stemme: ydmyg hobby/salgselev, varm, ikke sælgende.
- **HARD RULES (aldrig brydes):** ingen pris/kr-beløb ("5k", "5.000 kr", "prisvenligt", "fra X kr");
  ingen hard-sell CTA ("skriv ja", "send mockup"); ingen kunde-volumen-pral.
- Slut typisk "Mvh, Lucas". Lav-friktions-afslutning ("sig endelig til hvis I vil se hvordan jeres
  kunne se ud").
- Codificér stemmen **én gang** som en voice-guide (brug evt. brand-voice-skillen) så hver bespoke
  besked enforces mod den.

**Før (nuværende skabelon):** "Hej X, X ser ud til at have bygget noget særligt op i [by]. Jeg
kiggede forbi jeres hjemmeside — den fungerer fint… Jeg har lavet et par demoer → A → B. Skriv
hvis du vil høre mere."
**Efter (researchet, personlig):** åbner med en ægte, specifik detalje om netop dem, rammer en
krog, 2 relevante demoer, varm soft-close. (Se det fulde Sharwan-eksempel i samtalen — *teknikken*
var rigtig, *targetet* var forkert pr. §6.)

## 8. Research-toolkit (trin RESEARCH)

- **Web:** hent hjemmeside med **rigtig Chrome-UA** (ikke LeadBot) + retry + `r.jina.ai`-fallback.
- **Facebook/Instagram:** via **Apify-aktørerne** (allerede forbundet, `actors-mcp-server`) —
  bio, seneste opslag, anmeldelser, "for nylig"-events. Her bor beauty-krogene.
- **Google:** anmeldelsestekster (hvad roses de for?) + Google Business-profil.
- **Chrome-agent** (`mcp__Claude_in_Chrome__*`): JS-tunge sider Apify/fetch ikke får (fx Timma).
- Output pr. lead: `{ hooks: [...], professionalismVerdict: ja/nej, branch, demoPair: [d1,d2] }`.

## 9. Demo-bibliotek & routing (2 pr. mail)

| Branche | Demoer (vælg 2) |
|---|---|
| Frisør/skønhed/hud/negle | salon-artec.vercel.app · (byg flere niche-beauty-demoer) |
| Barber/herrefrisør | streetcut.vercel.app · salon-artec |
| Café/dansk/bager | under-klippen.vercel.app · zaytoon-six |
| Pizza/sushi/kebab/inter | zaytoon-six.vercel.app · under-klippen |
| Fotograf | buurfoto.vercel.app |
| Maler/tømrer/mur/tag | denlillemaler.vercel.app |
| VVS/el/blik | ktvvs.vercel.app |
| Default/service | vestfjends.vercel.app |

**TODO (idé D):** byg flere niche-beauty-demoer (frisør / negle-vipper / hudpleje-kosmetolog /
barber) så beauty får 2 *forskellige* relevante demoer i stedet for altid de samme to. Når
VIDA-siden er live → brug den som beauty-demo + bed om anbefaling/udtalelse (flywheel).

## 10. Byggeplan — sekventeret (tiltag)

**Del 0 — oprydning (lav risiko, gør først):**
- Fix `bulk-find-emails/route.ts` (fjern dublet-POST + fragment).
- Fjern al open/klik-tracking (pixel, redirect, endpoints, UI-paneler) — det er kun risiko nu.
- Slet gamle backup/`.bak`/`OLD_PRICING`-filer i `.send_queue/` og `src/lib/`.

**Del 1 — kvalificering + voice (fundament):**
- Implementér §6 (regex-forfilter + LLM-professionalism-gate).
- Codificér §7 voice-guide som en genbrugelig fil/skill.

**Del 2 — research- + draft-moduler:**
- `research_lead(lead)` → kroge + professionalism-verdict (web+FB+Google, §8).
- `draft_personal_message(lead, hooks, voiceGuide)` → bespoke besked, 2 demoer, validering
  (ingen pris, ingen robot-CTA).

**Del 3 — godkendelse + UI (Lucas vil SE det):**
- **10-15 personlige udkast om dagen** (Lucas opjusterede fra 5-8) → daglig godkendelses-digest.
- **Vercel-UI:** en side hvor Lucas (+ makker) ser udkastene, krogene, og kan godkende/redigere/sende.
  Det er her UI'et skal leve — gør pipeline-status og udkast synlige.

**Del 4 — motoren (MCP) + triggere:**
- Pak Del 1-3 som **MCP-server-værktøjer**: `get_best_leads`, `research_lead`,
  `draft_personal_message`, `queue_for_approval`, `register_client`, `reply_triage`.
- To triggere ovenpå: (a) daglig digest (scheduled), (b) "**skriv til X**"-kommando (manuel).

**Del 5 — intelligens & vækst:**
- Svar-assistent (klassificér + udkast svar i Lucas' stemme).
- Auto-registrér kunde ved bekræftet svar (så ingen VIDA forsvinder igen).
- E-mail→Messenger-bro for beauty uden email. Kanal-test (mail vs messenger for beauty).
- Ét datalag (flyt `.send_queue` JSON-state ind i arket/DB).

## 11. Tekniske referencer (for den næste Claude)

- **Sheet ID:** `1it8BeujksJjZuMAFaFaA0j11UDAA_afFP1BqgViVFJ8` · `Leads!A2:U` · `Clients!A:I` ·
  halt-flag `PauseSchedule!A2`.
- **Sheets-auth der virker i scripts:** `new google.auth.GoogleAuth({credentials: sa, scopes})`
  med `.send_queue/.sa.json` (IKKE `new google.auth.JWT(...)` — den fejler "unregistered callers").
- **Scoring:** `scoreLead()` i `apify.ts` (rating×log(reviews)→40p + 30p ingen-site + 15p ≥20 rev).
  `websiteQualityBonus()` i `sheets.ts` (+25 dead / +20 old / +8 mediocre / 0 modern→blokeret).
  Pro-brancher kræver score ≥70 for email-egnethed.
- **Messenger-digest** (allerede forbedret i dag): `.send_queue/.messenger_digest.mjs` kører nu
  **to-faset** — `prepare` (vælg+draft+resolve handles, intet send) og `send` (send ÉN mail +
  skriv ark/state). Auto-udtræk af FB-handle fra website-kolonne + `KNOWN_HANDLES`-cache.
  Dette fixede et tidligere problem hvor Lucas fik TO mails (linkløs + "KORRIGERET").
- **Env:** `GOOGLE_SHEET_ID, GOOGLE_KEY_FILE, GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_PLACES_API_KEY,
  GMAIL_USER, GMAIL_APP_PASSWORD, APP_URL`. Gmail-creds i `.env.local`.
- **Build:** `npm run build` (type-check + prod). Ingen test-suite. **Kør ALDRIG `npm run dev`**
  mens en agent er aktiv (port-konflikt). Next.js 16 har breaking changes — læs
  `node_modules/next/dist/docs/` før App Router-kode.
- **Sandbox-build-advarsel:** mounted `.next` er et FUSE-volume der blokerer `unlink` → Turbopack
  kan fejle i sandbox. Lucas bør køre `npm run build` lokalt før deploy.

## 12. Lucas' beslutninger (locked)

- Retning: **thin motor + MCP** med personlig research+draft som kerneopgave. IKKE fuld DB-rebuild.
- **Professionel targeting** (§6) — drop billige lav-pris/personligt-navn-shops.
- **2 demoer i hver mail.**
- **Menneskelige beskeder** — drop robot-CTA'er (§7).
- **10-15 personlige udkast om dagen.**
- **Vercel-UI** til at se/godkende udkast betyder noget (selv hvor ikke strengt nødvendigt).
- Arbejder **sammen med makker**, evt. opsætning i Obsidian — byg med to brugere/delt overblik i tankerne.
- Mål på **svar**, ikke tracking.

## 13. Åbne spørgsmål til Lucas (afklar tidligt)
- Pris-niveau/segment-grænse: hvad er "har råd"-tærsklen konkret (anmeldelser? rating? område?)?
- Skal cold-email-pausen (PauseSchedule til 2026-07-01) løftes, eller kører vi personlig
  outreach i lav volumen udenom?
- VIDA: monthlyFee/setupFee + hvilken mail/besked vandt dem (så vi kan lære af præcis den)?
- Obsidian-opsætning: hvad skal deles dér vs. i Vercel-UI'et?
- Hvor mange byer/segmenter skal den daglige PICK dække?

---

*Denne fil er det fulde udgangspunkt. Start med at læse den + de tre andre 2026-06-02-filer,
bekræft planen med Lucas, og begynd på Del 0 (oprydning) → Del 1 (kvalificering + voice).*
