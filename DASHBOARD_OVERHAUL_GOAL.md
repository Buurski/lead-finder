# DASHBOARD OVERHAUL — /goal (Agentic OS · Command Center v3)

**Status:** byg-kontrakt for Claude Code. Bygger lead-systemet om til et roligt, stilrent
**Agentic OS / Command Center** for Lucas + Charlie. Du må ændre alt — også backend —
men genbrug det der virker. Læs også `COMMAND_CENTER_VISION.md`. Denne fil er den autoritative v3.

> Kilder bag designet: vores NotebookLM-research (Ben AI, Nate Herk, Jack Roberts, Brock Mesarich)
> + et eksempel-OS Lucas så (layout-inspiration). Vi tager **layout/struktur** derfra, men
> **farver/følelse = Lucas' brand** (varm, lys, rolig — ikke dark, ikke corporate).

---

## 0. Princip (MVP-først — vigtigt)
Kilderne er enige: **byg interface-/overbliks-laget FØRST (80% af værdien), derefter action-laget, til sidst de dybe integrationer.** Lav ikke alt på én gang.
- **Fase A — Overblik (read-only):** Mission Control + alle kort/widgets der VISER status. ← start her.
- **Fase B — Handlinger:** knapper der kører skills (dry-run → bekræft → toast).
- **Fase C — Dybe integrationer:** Railway remote MCP, Hermes-handshake, voice, AI-spend live.

Behold backend hvor det giver mening (`src/lib/`, `src/app/api/**`, Sheets + `.send_queue`), men du må refaktorere frit. Stack: Next.js 16 · React 19 · Tailwind v4 · lucide-react · Claude SDK / `ai`-pakken (API-nøgle er sat).

## 1. Layout / IA (inspireret af eksempel-OS'et — venstre sidebar)
**Venstre sidebar** (tre grupper) + hovedpanel + **chat-widget**:
- **WORKSPACE:** `Mission Control` (forsiden/overblikket).
- **AGENTS:** `Claude` (hjernen/byggeren), `Hermes` (24/7 — placeholder indtil bygget), + senere persona-switcher (Pantheon: Philosopher/Mercury…).
- **SELF:** `Goals`, `SEO`, `Studio` (demoer/klient-sites), `Journal` (daily/), `Memory` (browse Obsidian-vaulten), `Build Guide`.
- **Øverst i hovedpanelet:** toggle **`Chat` / `Control Room`** — en kontekstuel chat-widget der kan "se" den data der vises lige nu, og kan svare/handle på den.
- Topbar: lokal tid + `⌘K Command palette` (keyboard-først: j/k/a/r/e/Enter).

## 2. Mission Control (forsiden) — faner
Faner: **Today · Pipeline · Goals & Revenue · Agents** (senere: Finances).
**Today** (det vigtigste — vores nuværende "deck"):
1. **Morning Coffee / Kræver dig nu** — top-3 prioriteter samlet fra svar (`reply.ts`: interested/question/becameClient), callbacks i dag, Gmail + Calendar. Hver: lead, én-linje hvorfor, forhåndsskrevet svar.
2. **Godkendelses-kø** — antal + top 3 drafts inline (`/api/approve/queue`).
3. **Dagens pipeline** — engine-status (sidste kørsel, drafts, frasorteret, kilde).
4. **Tal** — nye leads · emails fundet · svar i dag · vundet i ugen (3-5 nøgletal, store, rolige).
5. **Pulse Check** — hvilke kunder er "at risk" / skal følges op (VIDA, Salon Artec, Jernbane, Allan).
6. **Dreaming-log** (Fase C) — AI'ens nat-forslag til forbedringer + advarsler om forældet viden.

**Goals & Revenue:** 90-dages mål med progress-bar · indtjening vs. mål (priser fra vault `context/priser.md`).
**Agents:** status på agenter/skills · (Fase C) **AI Spend & Usage** pr. model · **Health Score** (hvor opdateret/ren vaulten er, baseret på linting).

> **7-buckets-dækning (Nate Herk):** sørg for at Mission Control samlet dækker: Indtjening · Kunder · Kalender · Kommunikation · Opgaver · Møder · Viden. Brug det som tjek på at intet forretningsområde mangler.

## 3. SELF-sektioner
- **Goals** — mål + 90-dages progress (læs/skriv `KnowledgeOS/wiki/os/`).
- **SEO** — SEO/AI-søgnings-status pr. klient (vi tilbyder det gratis, fx VIDA).
- **Studio** — **modular grid (4-5 kolonner)** af demoer/klient-sites (Artifacts): visuel preview, filtrér efter branche, live Vercel-link, åbn/rediger. (Jack Roberts' artifact-grid.)
- **Journal** — daglige briefs/logs (`KnowledgeOS/daily/`).
- **Memory** — browse second brain (`KnowledgeOS/`): kunder, proces, priser, brand.
- **Build Guide** — denne plan + systemets egen dokumentation.

## 4. Action-laget (Fase B) — skill-knapper (dry-run → bekræft → toast)
- **Morning Coffee** (saml top-3) · **Kør engine (12)** · **Find emails (næste 100)** · **Sync replies → triage** · **Draft Team Response** (svar i Lucas' "soul"/tone på en kundemail) · **Godkend "safe" drafts** · **Promovér svar → klient** · **Lint vaulten** (Health Score) · **Lav ny demo** (fra design-system).
- **INGEN auto-send.** Cold-mail-send = separat, eksplicit "armed" knap. Test-send kun `buur.aigro@gmail.com`. Mennesket i loop på alt der sender/sletter/koster.

## 5. ⭐ HUKOMMELSE — skriv ALTID tilbage til Obsidian (gennemgående)
Det her er kernen i et "second brain". Indbyg overalt:
- Hver væsentlig handling/beslutning **skrives tilbage til `KnowledgeOS`-vaulten** (kunde-noter ved status-skift, daglige briefs til `daily/`, beslutninger, nye leads-resuméer).
- Agenter **læser `context/` + `claude.md` + `soul.md` FØR de handler**, og skriver ny viden bagefter — så systemet "compounder".
- **hot.md hot-cache:** vedligehold en lille fil med de ~500 vigtigste tegn af dagens kontekst for lynhurtig, billig adgang.
- **Token-effektivitet (Code Graph):** indlæs ikke hele vaulten/kodebasen hver gang — kun det nødvendige (sparer massivt på tokens).
- **Handshake:** appen læser fra samme GitHub-repo (`Buurski/KnowledgeOS`) som Hermes senere skriver til — så mobil-noter dukker op i dashboardet.

## 6. Datakilder & integrationer
- **Nu:** Google Sheets (`sheets.ts`, leads/klienter) · `.send_queue` · vault via GitHub (brand/tone/priser/kunder) · `ANTHROPIC_API_KEY` (live-AI).
- **Fase C:** Gmail + Calendar (connectors/CLI) · Railway **remote MCP** (eksponér vaulten 24/7 til appen) · Firecrawl/Zapier (live web-data) · Hermes (Telegram) · voice-to-task (Glideo/Aqua).

## 7. Auth / Charlie (rollebaseret)
- `/login` med to brugere. **Rollebaseret visning:** Lucas (owner) ser teknisk status + alt; Charlie (member) ser de relevante prioriteter + "safe" handlinger. Lås destruktive/send + kerne-filer (`soul.md`/`claude.md`) til owner.

## 8. Design (stilrent — afgørende)
- Layout fra eksemplet (sidebar + Mission Control + chat) MEN **Lucas' farver/følelse:** varm, lys, rolig, personlig, rum-agtig. IKKE dark, ikke corporate/SaaS-lilla.
- Progressive disclosure · 3-5 nøgletal · prioriterede kort · store tal · minimal støj · rigelig whitespace · bløde borders, ingen tunge skygger. Forbilleder: Linear/Vercel/Stripe/Notion.
- Fraunces (display) + Plus Jakarta Sans (body) · oklch creme/ink + ÉN accent (rolig grøn ELLER amber). lucide-ikoner sparsomt.

## 9. Vagtskel
Aldrig auto-send/slet uden bekræft · mennesket i loop · ingen API-nøgler i kode (kun env) · token-disciplin · hold builds grønne · commit på feature-branch, ALDRIG push/merge/deploy til main uden Lucas siger det.

## 10. Nat-drift (autonom) + rapport
- **Kør hele natten:** arbejd autonomt gennem alle faser uden at vente på bekræftelse mellem faser; commit pr. delopgave; hold `npm run build` grøn; fortsæt med polish/tests/tilgængelighed hvis du bliver "færdig". Gå ikke i stå.
- **Brug impeccable design-standard/skill** til UI'et (alle tilstande, tilgængelighed, responsivt).
- **Rapport i stedet for auto-mail:** den ubevogtede nat-kørsel må IKKE sende mail (guardrail — håndhæves af hooken). Skriv i stedet en grundig **`NIGHT_BUILD_REPORT.md`** i repo-roden: alt opnået fase for fase, branch-navn + hvordan Lucas ser det, fil-liste, skærm-beskrivelser, mangler/næste skridt, beslutninger Lucas skal tage. I Lucas' tone. Mailen til buur.aigro sendes ad en sikker, overvåget vej om morgenen (Cowork morgen-brief eller manuelt), ikke af auto-agenten.

## 11. GUARDRAILS (auto-nat) — 10 ting den ALDRIG må
Håndhæves af `.claude/settings.json` (deny-liste) + `.claude/hooks/block-dangerous.mjs` (PreToolUse, hard-block). Start kørslen med `claude --permission-mode auto`.
1. **Aldrig** push/merge/deploy til main/master, ingen force-push, intet `vercel`/deploy. Kun commits på feature-branch. *(enforced)*
2. **Aldrig** sende mail under nat-kørslen (hverken leads eller andre) — skriv `NIGHT_BUILD_REPORT.md` i stedet. *(enforced: gmail/mailer blokeret)*
3. **Aldrig** `rm -rf`/destruktive sletninger; rør ikke `.git`, `.env*`, service-account-JSON. *(enforced)*
4. **Aldrig** skrive hemmeligheder (API-nøgler, GMAIL_APP_PASSWORD, tokens) i kode/commits/logs/filer — kun via env-vars.
5. **Aldrig** `npm run dev`/`next dev` (port-konflikt) — kun `npm run build`/`lint`; deploy er et manuelt morgen-skridt. *(enforced)*
6. **Rør ikke** produktions-data: skriv/slet ikke i Google Sheets-leads eller kø-data; cold-email forbliver PAUSET (rør ikke PauseSchedule); engine kun dry-run/fyld-kø. *(enforced)*
7. **Skift ikke** stak/framework, tilføj ikke database, ingen store dependency-upgrades. Bliv på Next 16/React 19.
8. **Hold builds grønne** — commit aldrig kode der ikke bygger; brækker noget, ret det eller rul commit'en tilbage.
9. **Rør ikke** filer uden for lead-system-repoet — undtagen aftalt write-back til KnowledgeOS-vaulten (kun tilføj/opdatér noter, slet aldrig).
10. **Ved tvivl** om noget irreversibelt/risikabelt: lad være, notér det i rapporten som "kræver Lucas' beslutning", og fortsæt med resten.

---

## ⭐ PROMPT TIL CLAUDE CODE (kopiér hele denne)

```
Vi bygger dette lead-system-repo om til et roligt, stilrent AGENTIC OS / COMMAND CENTER for mig (Lucas) og min partner Charlie. Læs DASHBOARD_OVERHAUL_GOAL.md og COMMAND_CENTER_VISION.md i repo-roden FØR du begynder — de er kontrakten. Følg dem.

ARBEJDSMÅDE — MVP-FØRST (gør i denne rækkefølge, commit pr. fase på en feature-branch, kør `npm run build` efter hver, nul fejl):
FASE A — OVERBLIK (read-only, byg dette først, det er 80% af værdien):
1. Ny IA med venstre sidebar i tre grupper: WORKSPACE (Mission Control), AGENTS (Claude, Hermes-placeholder), SELF (Goals, SEO, Studio, Journal, Memory, Build Guide). Topbar med lokal tid + Command palette. En Chat/Control Room-toggle i hovedpanelet (kontekstuel chat-widget der kan se data på skærmen).
2. Mission Control-forside med faner: Today · Pipeline · Goals & Revenue · Agents.
   - Today: (a) "Kræver dig nu / Morning Coffee" (svar klassificeret interested/question/becameClient via reply.ts + callbacks i dag, hver med forhåndsskrevet svar), (b) Godkendelses-kø (antal + top 3 inline), (c) Dagens pipeline (engine-status), (d) Tal (nye leads, emails fundet, svar i dag, vundet i ugen), (e) Pulse Check (hvilke kunder skal følges op).
   - Goals & Revenue: 90-dages mål med progress-bar + indtjening vs. mål (priser fra vaulten).
   - Agents: status på agenter/skills (AI-spend + Health Score kommer i Fase C).
   - Sørg for at Mission Control samlet dækker de 7 buckets: Indtjening, Kunder, Kalender, Kommunikation, Opgaver, Møder, Viden.
3. SELF-sektioner: Studio = modular grid (4-5 kolonner) af demoer/klient-sites med preview, branche-filter og live Vercel-link. Journal = daglige briefs. Memory = browse vaulten. Goals/SEO/Build Guide = enkle visninger.
   Tynde read-routes efter behov: GET /api/deck/summary (Sheets+kø+reply-klassifikation), GET /api/replies (sync-replies+reply.ts).

FASE B — HANDLINGER (skill-knapper, hver med dry-run-preview → eksplicit bekræft → toast):
4. POST /api/engine/run (engine.ts, writes queue only) + knapper: Morning Coffee, Kør engine, Find emails, Sync replies→triage, Draft Team Response (svar i min tone fra soul.md), Godkend "safe" drafts, Promovér svar→klient, Lint vaulten, Lav ny demo. INGEN auto-send — cold-mail-send er en separat "armed" knap; test-send kun buur.aigro@gmail.com.
5. Keyboard-triage (j/k/a/r/e/Enter) + reskin af /approve, /clients, /clients/[id], /followup-review ind i den nye sidebar.
6. Rollebaseret /login: Lucas (owner, alt) vs Charlie (member, læse + safe handlinger; lås send/slet + soul.md/claude.md til owner).

FASE C — DYBE INTEGRATIONER (sidst): Railway remote MCP (eksponér Obsidian-vaulten til appen 24/7), Gmail+Calendar live-feeds, AI Spend & Usage-tracker pr. model, Dreaming-log, Health Score, voice-to-task. Hermes-handshake (læs samme GitHub-repo).

HUKOMMELSE — INDBYG OVERALT (kernen i et second brain):
- Læs KnowledgeOS-vaulten (context/, claude.md, soul.md) FØR du handler, og SKRIV ny viden TILBAGE til vaulten: kunde-noter ved status-skift, daglige briefs til daily/, beslutninger. Vaulten ligger i GitHub-repoet Buurski/KnowledgeOS.
- Vedligehold en hot.md hot-cache (de ~500 vigtigste tegn dagskontekst). Brug token-disciplin (Code Graph-tankegang): indlæs kun nødvendige noter/filer, aldrig hele vaulten på én gang.

DETTE ER IKKE KUN DESIGN: byg hele systemet — backend-routes, datalag, handlinger OG design. Du må ændre/refaktorere alt, også backend.

DESIGN (stilrent): **brug din bedste design-skill ("impeccable" design-standard) hvis den findes — ellers anvend impeccable design-standard manuelt** (knivskarp typografi, spacing, hierarki, alle tilstande: hover/active/empty/loading/fejl, tilgængelighed WCAG AA, responsivt). Layoutet fra eksempel-OS'et (sidebar + Mission Control + chat) MEN i MIN brand: varm, lys, rolig, personlig, rum-agtig — IKKE dark, ikke corporate. Progressive disclosure, 3-5 nøgletal, prioriterede kort, store tal, minimal støj, rigelig whitespace, bløde borders, ingen tunge skygger. Fraunces + Plus Jakarta Sans, oklch creme/ink + én accent (rolig grøn eller amber), lucide-ikoner sparsomt, keyboard-først. Forbilleder: Linear, Vercel, Stripe, Notion.

AUTONOM NAT-DRIFT (dette skal køre HELE natten): Arbejd dig autonomt gennem FASE A → B → C uden at vente på min bekræftelse mellem faser. Commit pr. delopgave på feature-branchen, kør `npm run build` løbende og hold den grøn (debug selv hvis noget fejler, og fortsæt). Når du har været igennem alle faser, så BLIV ved med at forbedre: tests, tomme/loading/fejl-tilstande, tilgængelighed, responsivt design, flere skill-knapper, og polish af hver skærm. Gå ikke i stå — der skal være arbejde nok til hele natten.

VAGTSKEL: aldrig auto-send/slet uden bekræft; ingen API-nøgler i kode (kun env); hold builds grønne; commit på feature-branch — push/merge/deploy ALDRIG til main.

NÅR DU ER FÆRDIG (eller om morgenen): du må IKKE sende mail (det er blokeret af guardrails). Skriv i stedet en grundig NIGHT_BUILD_REPORT.md i repo-roden, i min tone (rolig, ærlig, dansk): alt du har opnået fase for fase · branch-navn + præcis hvordan jeg ser resultatet (fx `git checkout <branch>` derefter `npm run build` + en kort `next start`, ELLER en Vercel-preview hvis sat op) · liste over nye/ændrede filer · en kort beskrivelse af hvert nyt skærmbillede · hvad der mangler / næste skridt · og beslutninger jeg skal tage. (Mailen til buur.aigro sendes ad en sikker, overvåget vej om morgenen — ikke af dig.)

GUARDRAILS (håndhæves af .claude/settings.json + .claude/hooks/block-dangerous.mjs — kør med `claude --permission-mode auto`): aldrig push/merge/deploy til main eller force-push · aldrig sende mail (skriv rapport-fil) · aldrig rm -rf eller rør .git/.env/secrets · aldrig npm run dev/vercel · rør ikke produktions-data (Sheets/kø), cold-email forbliver pauset (rør ikke PauseSchedule) · skift ikke stack/DB · hold builds grønne · skriv ingen hemmeligheder i kode · ved tvivl: spring over og notér i rapporten.

Start med FASE A og byg derfra — autonomt hele vejen igennem.
```
