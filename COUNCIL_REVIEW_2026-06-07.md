# Council Review — 3-task split + hele systemet (2026-06-07)

5-rolle internt council, sekventielt. Fokus: de 3 separate Cowork-tasks
(lead-gen 06:00 → `data/leadgen.json`, messenger 06:30 → `data/messenger.json`,
inbox 07:00 → `data/inbox.json`) + systemets sundhed.

**Headline:** Ingen P0. De 3 tasks sender ALDRIG mail (kun append/skriv). Suppression,
halt-flag og allowlist er intakte. Hovedhullerne er **synlighed/orchestrering**, ikke
sikkerhed.

---

## 1. ARCHITECT

**A1 (P1) — Cowork-task-race på Sheets, ikke på vault.**
Appen læser hver task's EGEN fil (messenger læser `messenger.json`, IKKE `leadgen.json`)
— så intet app-niveau kryds-race. MEN messenger-task'en (06:30) sourcer fra Sheets +
sin egen json mens lead-gen-task'en (06:00) måske stadig appender til Sheets hvis den
tager >30 min. Messenger ser så et halvt-fyldt Sheet.
*Fix:* udvid gabet (messenger 07:00, inbox 07:30) ELLER lad lead-gen skrive et
`done`-flag i `data/ops-status.json` som messenger venter på.

**A2 (P1) — Ingen fallback hvis lead-gen fejler.**
Messenger + inbox kører uanset. Hvis `leadgen.json` aldrig opdateres, serverer
`/api/leads/ingest` GET stille den gamle KV/vault-run uden advarsel
([ingest/route.ts:50](src/app/api/leads/ingest/route.ts#L50)).
*Fix:* alders-banner på feeden (> 6 t = amber) + Mission Control health-strip (se U1).

**A3 (P2) — Ingen master-orchestrator.**
3 uafhængige tasks, intet delt run-id eller rækkefølge-garanti. Du valgte split for
fokus/token — det er en fair tradeoff, men race (A1) + synlighed (S1/U1) er prisen. Et
alternativ: 1 daily-ops-task med 3 SEKVENTIELLE faser fjerner race + giver én status.

**A4 (P2) — Idempotency kun på Vercel-fallback-crons, ikke Cowork-tasks.**
`lastAutoRunDate`/`lastInboxFallbackDate` beskytter crons
([settings.ts:16](src/lib/settings.ts#L16)). Kører en Cowork-task to gange samme dag:
lead-gen → name-dedupe redder det; inbox → digest overskrives (harmløst).

**A5 (P2) — "Fresher-of" stoler på `at`-timestamp.**
GET vælger vault kun hvis `vault.at >= kv.at` ([ingest/route.ts:50](src/app/api/leads/ingest/route.ts#L50)).
Skriver Cowork en placeholder/gammel `at` (fx den 22:58 du så), vises KV i stedet.
*Fix:* allerede korrekt — bare bekræft Cowork skriver ægte ISO `at` ved hver kørsel.

---

## 2. PESSIMIST / SRE

**S1 (P1) — Stille fejl er usynlig.** Største risiko. En fejlet Cowork-task efterlader
en forældet feed; intet alerter dig. Du opdager det først når du undrer dig over at
feeden er tom/gammel.
*Fix:* `data/ops-status.json` heartbeat (hver task skriver `{task, at, ok, counts}`) →
Mission Control rød/grøn + evt. linje i morgen-mailen.

**S2 (P1) — Google Places omkostning/quota uden loft.**
`/api/scrape` auto-sweep = op til 20 chunks × dusinvis af queries pr. kørsel
([scrape/route.ts:15-18](src/app/api/scrape/route.ts#L15)). Gentagne "Kør nu"-klik
eller daglig Places-sourcing kan koste $$ / ramme quota uden ceiling.
*Fix:* KV daglig-kald-tæller + deaktivér knap når dagsbudget nået.

**S3 (P2) — Cowork-app skal være ÅBEN kl 06:00.** Lukket laptop → task springer over
(Cowork-begrænsning). Vercel-fallback dækker inbox ([cron/inbox-triage](src/app/api/cron/inbox-triage/route.ts))
+ engine, men der er INGEN leadgen-fallback-cron.
*Fix:* tilføj `/api/cron/leadgen` fallback (Places-sweep) ELLER accepter manuel "Kør nu".

**S4 (P2) — Hængende task.** Cowork-side er ubundet (app-ruter har maxDuration 300/120/60,
men Cowork ikke). Kun monitorering hjælper.

**S5 (P2) — KV nede → engine kører ikke, stille.** `readSettings` fanger fejl →
DEFAULT (autoEngine=OFF) ([settings.ts:62](src/lib/settings.ts#L62)). Fail-safe men
usynligt. Heartbeat (S1) fanger det.

**S6 (P2) — 3 Vercel-crons** (sync-replies 04:30, engine + inbox-triage hourly). Verificér
Vercel-plan tillader hourly (Pro ja, Hobby nej).

---

## 3. UX (Lucas's morgen)

**U1 (P1) — Ingen samlet morgenstatus.** Hver side viser sin egen alder ("401 min siden");
intet ét-blik "kørte alle 3 + hvad kom ud".
*Fix:* Mission Control "Morgen-vitals"-strip:
`lead-gen ✓ 06:04 · 32 nye   messenger ✓ 06:31 · 5   inbox ✓ 07:02 · 12 kræver svar`
— læser de 3 feeds' timestamp + count (+ rød hvis > X t gammel). Lav-omkostning, høj-værdi.

**U2 (P2) — Staleness ikke farvet.** Alderen vises men advarer ikke. Amber/rød > 6 t.

**U3 (P2) — Ingen historik.** Kan ikke se "kørte den i går". `ops-status.json`-log løser begge.

---

## 4. GROWTH STRATEGIST

**G1 (P1) — Composite-score udnytter ~7 af mulige signaler.**
Bruger: base 40% + review-velocity 15% + email 10% + mobil 10% + sleeping-beauty +15 +
branch-relevance ×0.5-1.2 + bureau −20. Mangler billige, stærke signaler: **website-tech-alder**
(WordPress/Wix vs custom), **social-recency** (sidste FB-post), **foto-antal**, **competitor-gap**.
*Fix:* tilføj 2-3 i deep-research (Cowork samler dem allerede) → vægt ind i `enrichedComposite`.

**G2 (P2) — Pitch-Diff (#1 park) IKKE bygget.** Per-lead "din side mangler X, Y, Z vs en god
[branche]-side". Deep-research samler allerede gap'et — render 3 bullets i draft + approve.
Højeste konvertering pr. byggetime.

**G3 (P2) — Generisk pitch-vinkel.** Drafts er branche-matchede på DEMO-url, men vinklen er
generisk ("idé til hjemmeside"). Beauty→online-booking, restaurant→menu/bordbestilling,
håndværk→tilbuds-formular. Wire vinkel pr. branchegruppe ind i `draft.ts`.

**G4 (P2) — Ingen auto-arkivering af no-response.** Leads emailet >30d, intet svar → status
"dormant", ud af aktiv pipeline (+ evt. 2. anderledes touch). Genvinder ~10-15% tavse.

**G5 (P2) — Ingen win/loss-analytics.** Hvilken branche/demo/pattern konverterer? Tilføj
funnel-view (sendt → åbnet→ svar → kunde) pr. segment → styr fremtidige batches.

---

## 5. DEVIL'S ADVOCATE / SECURITY

**D1 (✓ SAFE) — Sender de 3 tasks mail? NEJ.** lead-gen → `appendLeads`; messenger → read-only
feed; inbox → `saveDigest`. Ingen `sendMail` i nogen path. Bekræftet via grep (kun email.ts +
send-reply har transport, ingen af de 3 tasks rører dem).

**D2 (✓ INTAKT) — Allowlist.** Håndhæves i `.send_queue/*` lokale send-worker +
`.claude/hooks/block-dangerous.mjs`; web QA-svar hardcoder `buur.aigro`
([send-reply/route.ts:15](src/app/api/replies/[id]/send-reply/route.ts#L15)). Cleanup rørte
ingen af dem.

**D3 (✓ INTAKT) — Halt-flag A2 fail-CLOSED master**, honoreret på alle send-scopes
([sheets.ts:702](src/lib/sheets.ts#L702)). De 3 tasks sender ikke → ikke gated, korrekt.

**D4 (P2) — Engine-cron tjekker IKKE `getPauseStatus`.** Et halted system DRAFTER stadig til
køen (ingen mail) ([cron/engine/route.ts:30](src/app/api/cron/engine/route.ts#L30)). Hvis du
"halt all" i forventning om NUL aktivitet, kører engine stadig. Lav risiko (intet sendes).
*Fix:* tidlig-return i engine-cron hvis master paused.

**D5 (✓) — canSendTo dækker ingestede leads.** Append-paths sender ikke; canSendTo kører ved
REEL send over Sheets-data inkl. ingestede leads → de er gated ved send-tid
([canSendTo.ts:37](src/lib/canSendTo.ts#L37)).

**D6 (✓ FIXET 9cad8c8) — Kontaktet-tjek dækker leadgen.json.** `suppressedNameSet` filtrerer
ingest GET + messenger vault-path mod Sheets contacted-state.

**D7 (P2) — ingest POST checkAuth returnerer true hvis ingen secret sat** (local dev)
([ingest/route.ts:27](src/app/api/leads/ingest/route.ts#L27)). Prod har secret + basic-auth.
Acceptabelt; overvej deny-by-default i prod.

---

## Severity-oversigt

| P0 | (ingen) |
|----|---------|
| **P1** | A1 task-race · A2 lead-gen-fallback · S1 stille-fejl-synlighed · S2 Places-budget · U1 morgen-vitals · G1 composite-signaler |
| **P2** | A3 A4 A5 · S3 S4 S5 S6 · U2 U3 · G2 G3 G4 G5 · D4 D7 |

De fleste P1'er løses af ÉN ting: **`ops-status.json` heartbeat + Mission Control
morgen-vitals-strip** (dækker S1 + U1 + A2-synlighed på én gang).

---

## 10 nye ideer (ud af boksen)

1. **Ops-heartbeat + morgen-vitals.** Hver task skriver `{task, at, ok, counts}` til
   `data/ops-status.json`; Mission Control viser ét-blik rød/grøn + counts. (Løser S1/U1/A2.)
2. **Pitch-Diff-kort.** Auto "din side mangler X, Y, Z vs en god [branche]-side" fra
   deep-research-gap, vist i draft + approve. Højeste konvertering pr. byggetime.
3. **Reply-velocity læringsloop.** Track hvilken pattern/demo/branche der får svar →
   feed tilbage i composite-score + pattern-valg. Selv-tunende outreach.
4. **Warm-lead radar.** Overvåg eksisterende leads' Google-review-antal over tid; en lead der
   springer +10 reviews/måned = momentum → auto-bump prioritet (sleeping-beauty der vågner).
5. **Competitor-gap-vinkel.** Find en same-branche same-by konkurrent MED god side; pitch
   "dine naboer [X] har allerede en — her er hvad du mangler".
6. **2-touch dormant-sekvens.** No-reply >30d → ét anderledes-vinkel-followup (ikke samme
   skabelon), så arkivér. Genvinder tavse leads.
7. **Voice morgen-brief.** TTS af morgenstatus + top-3 handlinger til en lydklip du kan høre.
   Rolig, room-like vibe.
8. **"Book demo"-link i drafts.** I stedet for "skriv hvis interesseret" → Cal.com-link →
   målbar booked-calls-funnel.
9. **Branche-mætnings-guard.** Track hvor mange leads pr. branche/by allerede kontaktet;
   auto-diversificér næste batch væk fra mættede segmenter (håndhæver din MIX-præference automatisk).
10. **Live demo-personalisering.** Når en lead åbner demo-linket, indsæt deres navn/by
    (vi har dem allerede) → "Salon X" forudfyldt demo = langt højere konvertering.

*(Bonus 11): chat-styret task-kontrol — "kør lead-gen nu" / "skip messenger i dag" fra in-app
chat → skriver task-intent Cowork læser. Udvider eksisterende chat-actions.*
