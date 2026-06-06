# PLAN — DEL 3 (2026-06-04 sen-eftermiddag)

## Status før denne plan
Del 2 er bygget og rapporteret (Command Center v3 Fase A + Fase B). Council har leveret 3 dybe arkitekt-reviews. Lucas har godkendt fix-lister med specifikke afvigelser.

## Lucas's afgørende beslutninger (afvigelser fra Council)
- **Lighthouse:** TÆND. Installer `lighthouse` + `chrome-launcher`.
- **GITHUB_TOKEN:** Sat i `.env.local` (lokalt). Skal også sættes i Vercel env-vars.
- **Basic auth:** TÆND. Konfigurer credentials i Vercel.
- **CVR-flag:** UDSAT — bygges ikke nu.
- **Vercel plan:** Pro → maxDuration=300s er fint.
- **Polish:** AI Spend bars (role="progressbar" aria) MÅ fixes. Resten lavest prioritet.
- **Strategiske idéer:** PARKERES — lægges i Obsidian til senere.

## Læs FØR du starter
- `NIGHT_BUILD_REPORT_v2.md` — status efter Del 2
- `OUTREACH_ANALYSIS_2026-06-04.md` — outreach-data
- `DESIGN.md` — design-system
- `PRODUCT.md` — produkt-kontekst
- `KnowledgeOS/claude.md` + `soul.md` + `context/about_business.md`
- `KnowledgeOS/wiki/os/system-vision.md`

# Blocks (12) — kør i denne rækkefølge

Mellem hvert block: `npm run build` grøn, `npm run lint` grøn, `node scripts/test_all.mjs` grøn. Hvis noget brækker → fix før næste block.

## Block 1 — Storage abstraktion (Vercel KV + Blob)
**Mål:** Fix Vercel ephemeral-filsystem-problem. Nuværende `process.cwd()` writes virker ikke i prod.

**Implementation:**
- Ny `src/lib/store.ts` med:
  - `Store` interface: `append`, `readAll`, `get`, `put`, `delete`, `list`, `putAsset`, `getAssetUrl`, `deleteAsset`
  - `FSStore` (lokal dev — wrapper omkring nuværende `.send_queue/` writes)
  - `KVStore` (Vercel KV via `@vercel/kv` — for docs + append-logs)
  - `BlobStore` (Vercel Blob via `@vercel/blob` — for served assets)
  - `ComposedStore` — router efter key-prefix (`demos/*` + `assets/*` → Blob, alt andet → KV)
  - `createStore()` factory — vælger driver baseret på `STORE_DRIVER` env-var eller Vercel-detection

- Refaktorer disse libs til at bruge `store`:
  - `src/lib/spend-log.ts` — `store.append("spend", entry)` / `store.readAll("spend")`
  - `src/lib/settings.ts` — `store.get("settings")` / `store.put("settings", ...)`
  - `src/lib/customer-recon.ts/saveRecon` — `store.put("recon/{slug}", ...)`
  - `src/lib/demo-factory.ts/buildDemo` — `store.putAsset("demos/{slug}/index.html", html, ...)` — returner URL direkte
  - `src/lib/queue.ts` (approval queue) — `store.put/get("queue", ...)`

- Tilføj nye dependencies til `package.json`: `@vercel/kv`, `@vercel/blob`
- Opdater `.env.example` med `STORE_DRIVER`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `BLOB_READ_WRITE_TOKEN`

**Tests:**
- `scripts/test_store.mjs` — fuld Store-interface mod FSStore + InMemoryStore mock
- `scripts/smoke_store_cloud.mjs` — manuel kør mod real KV+Blob (hvis env-vars sat)

**Backwards compat:**
- Behold gammel FS-path som fallback i `FSStore` så test_all stadig grøn lokalt

## Block 2 — Compose-at-draft-time + canSendTo
**Mål:** Fix at tone-mixer er isoleret fra mail-pipelinen. Compose én gang, send som er.

**Implementation:**
- Ny `src/lib/compose.ts`:
  - `composeColdEmail(lead): ComposedEmail` — bruger `mixForLead` + `pickDemoPair` + `validateDraft`. THROW hvis validate fejler.
  - `composeFollowupEmail(lead, previousOpenerKind): ComposedEmail` — vælger anden opener-kind end forrige.
  - Returnerer `{subject, text, html, comboId, openerKind}`

- Ny `src/lib/canSendTo.ts`:
  - Central send-gate: tjekker hostile-blacklist, isChain, isPublicEntity, no-email, bounced, duplicate
  - Returnerer `{ok: boolean, reason?: "hostile"|"chain"|"public"|...}` 

- Ny `src/lib/qualify.ts` (eller udvid eksisterende):
  - `isPublicEntity(lead)`: tjekker name + branch for `\bkommune\b`, `\bsygehus\b`, `\bministeriet\b`, `\b(offentlig|public) ?sektor\b`

- Sheets-ændringer (via store):
  - Tilføj kolonner `composedSubject`, `composedBody`, `composedHtml`, `composedAt`, `comboId`, `openerKind`, `branchGroupConfirmed`, `websiteHttpStatus`, `achievements` (JSON-stringified array)

- `src/lib/engine.ts`:
  - Efter `draft_personal_message`, kald `composeColdEmail(lead)` og persistér på lead-rækken via ny `persistComposed(rowIndex, composed)`

- `src/lib/email.ts/sendLeadEmail`:
  - Hvis `lead.composedBody` findes → send som-er (subject, text, html fra sheet)
  - Hvis ikke → log warning "[email] LEGACY template path" og brug eksisterende TEMPLATES som fallback
  - **FJERN:** alle hits af "Lille idé til" + "helt uforpligtende" + "ser ud til at have bygget noget særligt op" fra TEMPLATES record (linjer 211, 248, 272, 287, 466, 502, 533 m.fl.)

- `src/app/api/email/bulk-send/route.ts`:
  - Inde i send-loopet: `const block = canSendTo(lead); if (!block.ok) { skipped.push(...); continue; }`
  - Read `composedBody` fra sheet — send som-er

- `src/app/api/email/send-followups/route.ts`:
  - Samme `canSendTo` check
  - Kald `composeFollowupEmail(lead, lead.openerKind)` for at variere opener

- `src/app/api/email/[id]/send-email/route.ts` (hvis findes):
  - Samme `canSendTo` check

**Tests:**
- `scripts/test_compose.mjs` — for 100 syntetiske leads, verifiér at `validateDraft(composeColdEmail(lead).text).ok === true`
- Snapshot test af compose for hver branche
- `scripts/test_can_send.mjs` — snapshot for hver blocking-reason

## Block 3 — Achievement opener + tone-mixer udvidelse
**Mål:** Tilføj "Tillykke + ærlig talt netop derfor"-frame (analysens #1 vinder).

**Implementation:**
- Udvid `MixLead` interface i `tone-mixer.ts`: tilføj `achievements?: string[]`
- Ny `OpenerKind: "achievement"` med højeste prioritet
- Achievement detection i `src/lib/research.ts` (eller ny `src/lib/achievements.ts`):
  - Regex på Google reviews-tekst: `/(danmarksmester|verdensmester|nordisk mester|kåret|prisvinder|vinder af|finalist( i)?|guldmedalje|TV2 ?[\s-]?prisen|BT ?[\s-]?prisen|trustpilot[- ]?guld|excellence award)/i`
  - Regex på website "Om os"-sektion (når status != dead): samme pattern
  - Filtre: kræv length >= 15, må ikke matche `/anmeldelser|reviews/i`, må ikke matche generisk "vi vinder altid"
- Tone-mixer `eligibleOpeners` får ny candidate (prioritet 0, før quote):
  ```
  if (lead.achievements?.length) {
    out.push({ kind: "achievement", text: pick(seed + "a", [
      "først og fremmest — ${a} er altså ret stort. Tillykke. Men det er også ærlig talt netop derfor jeg skriver: når man er på det niveau fagligt, så er hjemmesiden tit det første sted potentielle kunder møder en.",
      "tillykke med ${a} — det er ærlig talt netop derfor jeg skriver. Når man har leveret på det niveau, fortjener hjemmesiden samme finish.",
    ]) });
  }
  ```

**Tests:**
- `scripts/test_achievements.mjs` — verificer match på kendte cases (RR Studio Danmarksmester, Salon X "kåret af BT")
- Tilføj eksempel-output i `scripts/preview-tone-mix.mjs` for achievement-opener

## Block 4 — Lead validation pass (qualifier + HTTP-status + branche)
**Mål:** Fix branche-routing-fejl + tilføj HTTP-status-detektion.

**Implementation:**
- Ny `src/app/api/leads/validate/route.ts`:
  - POST endpoint (kræver `Authorization: Bearer ${CRON_SECRET}` eller intern call)
  - Itererer alle leads med `status="new"` og `validatedAt < 7 dage` eller manglende
  - For hver:
    1. `isChain(name)` → markér chain, status="skip-chain"
    2. `isPublicEntity(lead)` → markér public, status="skip-public"
    3. `isBlacklisted(name)` → markér, status="skip-hostile"
    4. Branche-confidence score: kombiner Places types + name regex + manuel sheet-felt
       - >= 0.7 → `branchGroupConfirmed = "<group>"`
       - 0.4-0.7 → `branchGroupConfirmed = "neutral"`
       - < 0.4 → `status = "needs-review"`
    5. `probeWebsite(url)`:
       - HEAD request med 3s timeout, browser-like UA
       - status = "dead" hvis 4xx/5xx eller timeout
       - status = "slow" hvis >3s response
       - status = "old" hvis last-modified > 12 mdr
       - status = "ok" ellers
       - Kør parallelt for hele batch (`Promise.allSettled`)
       - Cache i 7 dage
    6. Achievement-extraction (Block 3 logik)
  - Skriver til sheet: `branchGroupConfirmed`, `websiteHttpStatus`, `achievements`, `validatedAt`

- Ny `src/lib/probe-website.ts`:
  - `probeWebsite(url, opts): Promise<{status, httpCode?, responseMs?, lastModified?}>`
  - Returnerer struktureret data

- Engine-integration: før draft, kald validation hvis lead ikke er validated within 7 dage

**Bonus:** distinger `dead` (4xx/5xx) fra `bot-blocked` (Cloudflare 403 til Node UA — retry med Chrome UA først)

**Tests:**
- `scripts/test_probe.mjs` — snapshot mod kendte URLs
- `scripts/test_validate.mjs` — full pass på fixture-leads

## Block 5 — Demo-factory placeholder fix + real content rendering
**Mål:** Fjern bogstavelig placeholder-tekst der vises til kunden.

**Implementation:**
- `src/lib/demo-factory.ts:composeHtml`:
  - Linje 137: `<div class="card">Personligt indhold fra recon indsættes her.</div>` SKAL fjernes
  - Erstat med faktisk recon-data hvor muligt:
    - Brug `reconResult.heading` hvis tilgængelig
    - Brug `reconResult.toneSample` (kort uddrag fra deres egen tekst)
    - Brug `reconResult.headings[0]` som hero-overskrift
  - Hvis recon-data er tom → vis en KONKRET branche-relevant placeholder fra branch-template, IKKE generisk "Personligt indhold..."
  - Hvis ingen anbringelig data → SKIP sektionen helt (færre sektioner > tomme sektioner)

- Tilføj recon-validering før render:
  - Hvis < 30% af felter er udfyldt → returnér `null` og log warning. Demo bygges IKKE uden minimum data.

**Tests:**
- `scripts/test_demo_render.mjs` — render demo mod recon med fuld/medium/lav data, verificer ingen "Personligt indhold..."-string i output

## Block 6 — Security: basic auth + safe-fetch + .env.example
**Mål:** Fix de 3 sikkerhedsfund.

**Implementation:**

### 6a. `src/proxy.ts` rewrite (constant-time + HMAC session + rate-limit):
- Constant-time string compare (Edge-safe, ingen Node.timingSafeEqual)
- Web Crypto HMAC-SHA256 til session-cookie
- Korrekt `parseBasic`: split på FØRSTE `:` (ikke alle), korrekt UTF-8 decode
- Rate-limit via Vercel KV: 5 forsøg / 60s window → 1-times block
- Session-cookie `cc_sess` med 12h sliding session
- Log fejlede forsøg uden credentials (kun IP + reason tag)
- Bevarer eksisterende `/welcome` redirect for første-besøg

### 6b. Ny `src/lib/safe-fetch.ts`:
- SSRF-safe wrapper omkring fetch()
- Allowlist protocols: kun http/https
- Blocklist private IP-ranges (10.x, 127.x, 169.254.x, 172.16-31.x, 192.168.x, IPv6 link-local)
- Cloud-metadata block (AWS 169.254.169.254, GCP metadata.google.internal)
- DNS-resolve via Cloudflare DoH (Edge-compatible)
- TOCTOU defense: re-validate redirect targets
- Max response size: 2 MB (read in chunks med abort)
- Max redirects: 3
- Realistic browser UA

### 6c. customer-recon.ts gennemretten:
- Erstat `fetchText` med kald til `safeFetch`
- `r.jina.ai`-fallback gated bag `RECON_ALLOW_JINA=1` (default OFF)
- Cache recon-resultat med 24h TTL via store
- Log blocked requests struktureret

### 6d. `.env.example` komplet (genskrives helt):
Gruppér efter funktionsområde med kommentar pr. variabel:
- Core (Google Sheets, AI)
- Storage (KV, Blob)
- Vault (GitHub raw)
- Outreach (Gmail SMTP)
- Auth (Basic auth)
- External (Apify, Places)
- Cron
- Hermes
Marker hver: [REQUIRED] / [OPTIONAL] / [VERCEL-injected] / [SENSITIVE]

**Tests:**
- `scripts/test_safe_fetch.mjs` — verificer block af private IPs, cloud metadata, oversize body
- `scripts/test_auth.mjs` — verificer constant-time, parseBasic med `:`-pwd, rate-limit, session-cookie

## Block 7 — Lighthouse integration
**Mål:** Tænd Lighthouse (Lucas valgte den).

**Implementation:**
- Installer `lighthouse` + `chrome-launcher` via `npm i -D lighthouse chrome-launcher`
- Opdater `src/lib/seo.ts/runLighthouse`:
  - Dynamic import af lighthouse + chrome-launcher
  - Run mod kunde-URL, return Performance/Accessibility/Best Practices/SEO scores
  - Mobil + desktop modes
  - Timeout 60s per kørsel
  - Cache resultat 24h per URL
- `/seo` viser scores med trends (over tid)

**Tests:**
- `scripts/test_lighthouse.mjs` — mocked test (chrome ikke nødvendigvis installeret i CI)

## Block 8 — GitHub token + vault live
**Mål:** Aktiver vault-læsning fra GitHub raw.

**Implementation:**
- Verificer `.env.local` har `GITHUB_TOKEN` sat (Lucas allerede gjort)
- Update `vault.ts` med fejl-handling for 401 (token udløbet)
- /memory + /goals + /journal trækker live data fra `raw.githubusercontent.com/Buurski/KnowledgeOS/master/...`
- Tilføj UI-indikator "Vault: live" eller "Vault: lokal seed"

**Tests:**
- Tjek at en kendt note (fx `claude.md`) hentes korrekt

## Block 9 — Polish: AI Spend bars + andre væsentlige
**Mål:** AI Spend bars + få andre kritiske UI fixes.

**Implementation:**
- `/spend`: tilføj `role="progressbar"`, `aria-valuenow`, `aria-valuemax` til bar-elementer
- `/seo` from ghost-screen: tilføj "Klientlisten loader fra cache..."-skeleton + "Hvad er det her?"-info-banner
- `/welcome`: venstrejustér h1, drop 5 generiske cards → erstat med "Sidst du var her: [dato]" + 3 konkrete handlinger
- FAB (Spørg Claude): tilføj margin-bottom på content så den ikke overlapper `/spend`-tabel
- Synkronisér mobile breakpoints (820 og 860 → vælg én)

## Block 10 — Test-suite udvidelse
**Mål:** Køre fuld test-suite + tilføj integration-tests.

**Implementation:**
- `scripts/test_integration.mjs`:
  - End-to-end: lead → recon → compose → canSendTo → queue → send-mock → reply-classify
  - Mock-store, mock-mail-transport, mock-AI
- `scripts/test_security.mjs`:
  - SSRF-attempt liste
  - Basic auth brute-force liste
  - Recipient-lock liste

## Block 11 — Update KnowledgeOS
**Mål:** Synk vaulten med dagens læring.

**Implementation:**
- Opdater `KnowledgeOS/wiki/os/system-vision.md` — tilføj at Command Center v3 er bygget
- Opdater `KnowledgeOS/wiki/os/kapabiliteter.md` — flyt ✅-emner fra "Bygger" → "Har"
- Opret `KnowledgeOS/wiki/os/hermes-detaljeret.md`:
  - Arkitektur (Railway + Telegram + Dreaming)
  - Integration-plan (Gmail, Calendar, Sheets, KnowledgeOS GitHub, AI Spend)
  - Sikkerheds-overvejelser
  - Setup-trin
  - Cost-estimat
- Opret `KnowledgeOS/wiki/os/strategiske-ideer-park.md`:
  - Pitch-Diff (Product Critic)
  - Street View demo-bombe
  - Lucas-AM podcast
  - Charlie-Studio iPad
  - Klippekort-pricing
  - KnowledgeOS billed-vault
  - Reverse-demo lookalikes
- Opdater `KnowledgeOS/wiki/kunder/vida-klinik.md` med læring fra outreach-analyse
- Opdater `KnowledgeOS/wiki/proces/outreach-systemet.md` med tone-mixer v2-info

## Block 12 — Dokumentation + rapporter
- `NIGHT_BUILD_REPORT_v3.md` — fuld ærlig rapport af Del 3
- Opdater `PRODUCT.md` + `DESIGN.md` med changelog
- Browser-verifikation af nye skærme + screenshots i `_screenshots/del3/`
- Build grøn + lint grøn + tests grønne

# Guardrails — håndhæves af block-dangerous.mjs
- ✅ Kun commits på `command-center-v3` · ingen push/merge/deploy til main
- ✅ Mail KUN til buur.aigro@gmail.com + 1charlie.nielsen@gmail.com
- ✅ Test-mails må sendes til Lucas (efter Block 2 + Block 9 — send sample-mail)
- ✅ Ingen røring af `.env`, `.send_queue/.sa.json`, `.git/`, PauseSchedule
- ✅ Ingen `rm -rf` eller destruktive sletninger
- ✅ Ingen `npm run dev` eller Vercel-deploy
- ✅ Build grøn efter hvert block — fix før næste

# Hvor må du afvige
- Bedre UI end specificeret? Byg det.
- Bug du opdager undervejs? Fix + separat commit.
- Mindre refaktor der giver klarhed? Tag den.
- Optimering på +30% performance? Implementér.

# Hvor må du IKKE afvige
- Skift stack (Next 16/React 19/Tailwind v4)
- Tilføje database (Sheets + KV er datalaget)
- Branding/farver væk fra sage-grøn
- Sende mail til andre end Lucas + Charlie

# Til-sidst
Når alle 12 blocks er færdige:
1. Tag screenshots af nye/ændrede skærme
2. Skriv `NIGHT_BUILD_REPORT_v3.md`
3. Send test-mail til buur.aigro@gmail.com med sample af nye tone-mixer-outputs (5 sample-mails fra forskellige openerKinds)
4. Synk KnowledgeOS-ændringer via git push på `Buurski/KnowledgeOS` (kun det repo, ikke command-center-v3)
