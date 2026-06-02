# CLAUDE CODE — NAT-BRIEF & KØRSELSPLAN (v4 — FINAL goal, Del 0→4)
**Dato:** 2026-06-02 · **Til:** Claude Code (Opus 4.8) · **Fra:** Cowork-planlægning m. Lucas
**Læs først:** `MASTER_BUILD_BRIEF_2026-06-02.md`, `CLAUDE.md`, `PRODUCT.md`, de tre `*_2026-06-02.md`.

---

## TL;DR
1. **Nattens scope = Del 0→4 = et FÆRDIGT, KØRENDE produkt:** oprydning + kvalificering/voice +
   research/draft-moduler + **godkendelses-UI (med `impeccable`)** + **den daglige motor (bygges nu)**.
2. **Vigtig nuance:** den daglige motor BYGGES i nattens `/goal`, men den **KØRES** dagligt som en
   **scheduled engine (sekventielt loop + Haiku)** — IKKE som et nyt `/goal` hver dag, og IKKE som en
   parallel workflow (for dyrt). Ét `/goal` i nat → bygger alt; derefter kører motoren selv hver morgen.
3. **Concrete done:** alt er mekanisk bevisbart (build/lint grønt, `/approve` kompilerer, motorens
   `--dry-run` producerer udkast uden at sende), så `/goal` kan faktisk afslutte.
4. **Uovervåget = auto-mode + tunge guardrails** (`.claude/settings.json` deny + `block-dangerous.mjs`
   hook — allerede oprettet). Deny vinder over alt. **Ingen mails sendes i nat** (kun dry-run).
5. **Ingen auto-resume ved usage-grænse:** commit pr. fase + `BUILD_STATUS.json` → `claude --resume` i morgen.
6. **Model-routing:** Haiku til billige trin, Opus 4.8 til kode/UI/fejlfind. Build-only (ingen deploy/push til main).

---

## Layer A — BYGGES i nat (ét `/goal`, Del 0→4)
- **Del 0 — Oprydning:** fix `bulk-find-emails/route.ts` → én `POST`; fjern al open/klik-tracking.
  **Arkivér (slet IKKE) gammelt rod** → flyt historiske rapporter/planer/patches (fx `MORNING_*.md`,
  `OVERNIGHT_*.md`, `AUDIT_*.md`, `*.patch`, `CAMPAIGN_*.md`, gamle dry-run-rapporter) til
  `_archive/2026-06-02/`. Slet KUN åbenlyst junk (`.bak`, `OLD_PRICING`, temp-filen `C:UsersBuur...`).
  Rør ALDRIG filer der importeres af kode eller bruges af scheduled tasks (fx `.send_queue/.messenger_digest.mjs`,
  `.sa.json`, aktive state-JSON). I tvivl → arkivér, slet ikke.
- **Del 1 — Kvalificering+voice:** `src/lib/qualify.ts` (regex §6 + `isProfessionalEnough()`); `src/lib/voice-guide.md` (§7).
- **Del 2 — Research+draft:** `src/lib/research.ts` (`research_lead`: Chrome-UA+retry+jina, FB/IG via Apify, Google);
  `src/lib/draft.ts` (`draft_personal_message`: 2 demoer + validering: ingen pris/kr, ingen robot-CTA).
- **Del 3 — Godkendelses-UI (med `impeccable`):** rute `/approve` (`src/app/approve/page.tsx`) — viser udkast+kroge,
  godkend/rediger/send. Læser udkast fra motorens kø (Del 4).
- **Del 4 — Daglig motor (sekventiel, Haiku):** én entry (fx `src/lib/engine.ts` + `.send_queue/daily_engine.mjs`)
  der kører PICK→RESEARCH(Haiku)→QUALIFY→DRAFT(Opus)→COLLECT og lægger 10-15 udkast i en kø `/approve` læser.
  Plus "skriv til X"-indgang (én navngivet lead). Plus en **scheduled-task/SKILL.md til morgenkørsel** — men
  KØR den IKKE i nat. Motoren sender ALDRIG selv; den fylder kun køen → du godkender i `/approve`.

## Layer B — SENERE (ikke i nat)
- **Del 5 — Intelligens/vækst:** svar-assistent, auto-kunde-registrering, email→messenger-bro, ét datalag.

---

## Guardrails (allerede oprettet)
- `.claude/settings.json` — allow (npm build/lint, edits i `src/`, git add/commit/branch) + deny (force/main-push,
  reset/rebase, `npm run dev`, `vercel*`, `rm -rf /`~, edits af `.env*`/`.git`/`.sa.json`, alle gmail/email-MCP'er).
- `.claude/hooks/block-dangerous.mjs` — PreToolUse-hook: hård-blokerer mail, force/main-push, hard reset/rebase,
  destruktiv `rm -rf`, dev/deploy, secret-edits, og alt der rører **PauseSchedule**.

## Pre-flight (FØR du sover)
```bash
gh auth status            # GitHub CLI logget ind
node -v && npm -v
git checkout -b night-build
claude --permission-mode plan   # gennemse planen, indsæt /goal'et nedenfor, godkend
```

---

## ★ FINAL `/goal` — copy-paste (Del 0→4)
```
/goal Dette er en REVAMP/overhaul af det EKSISTERENDE lead-system (et igangværende Next.js 16 / React 19-repo med Google Sheets som database) — IKKE et nyt projekt. Byg videre på og omdan den nuværende kode: genbrug og udvid de eksisterende libs (src/lib/sheets.ts, apify.ts, email.ts, chains.ts, folders.ts) og App Router-strukturen; scaffold IKKE et nyt projekt fra bunden, og dupliker ikke eksisterende logik. Mål: et færdigt, kørende produkt — Del 0-4 fra CLAUDE_CODE_NIGHT_BRIEF_2026-06-02.md + MASTER_BUILD_BRIEF_2026-06-02.md. Arbejd autonomt hele natten; spørg ikke. Brug skill "impeccable" til UI-design. Haiku-subagenter til billige trin (research, scoring, formattering), Opus 4.8 til kode/UI/fejlfind. FÆRDIG-KRITERIER — alle SANDE og mekanisk bevist: (1) src/app/api/email/bulk-find-emails/route.ts har præcis én "export async function POST" og intet afhugget fragment; (2) ingen reference til buildTrackedClickUrl / track/open / track/click i src/, OG gammelt rod er ARKIVERET i _archive/2026-06-02/ (ikke slettet) — kun åbenlyst junk (.bak, OLD_PRICING, temp-junk) slettet, og intet der importeres af kode eller bruges af scheduled tasks er rørt; (3) src/lib/qualify.ts (regex-forfilter + isProfessionalEnough) og src/lib/voice-guide.md findes; (4) src/lib/research.ts (research_lead m. Chrome-UA+retry+jina, FB/IG via Apify, Google) og src/lib/draft.ts (draft_personal_message m. 2 demoer + validering der afviser pris/kr og robot-CTA) findes; (5) godkendelses-UI på ruten /approve (src/app/approve/page.tsx) der viser udkast+kroge med godkend/rediger/send, designet med impeccable, og som læser udkast fra motorens kø; (6) en daglig motor (sekventielt loop, IKKE parallel workflow, IKKE dagligt /goal): src/lib/engine.ts + .send_queue/daily_engine.mjs der kører PICK->RESEARCH(Haiku)->QUALIFY->DRAFT(Opus)->COLLECT og skriver 10-15 udkast til en kø som /approve læser, plus en "skriv til X"-indgang for én navngiven lead, plus en scheduled-task/SKILL.md til morgenkørsel (men kør den IKKE i nat); (7) "npm run build" exit 0 OG "npm run lint" exit 0, og /approve er med i build-outputtet uden fejl; (8) bevis at motoren virker: "node .send_queue/daily_engine.mjs --dry-run --limit=3" exit 0 og skriver 3 udkast til køen UDEN at sende noget; (9) BUILD_STATUS.json opdateret efter hver fase {phase,status,lastError,ts}; (10) NIGHT_BUILD_REPORT_2026-06-02.md skrevet (bygget/testet/mangler/blockers). GRÆNSER: commit efter hver fase til grenen "night-build" (commit only, ALDRIG push eller main); rør IKKE PauseSchedule; send INGEN mails (kun dry-run); kør ALDRIG npm run dev; deploy IKKE; opnå grønt ved KORREKT implementering — slet/skip/kommentér ALDRIG kode, tests eller lint-regler for at snyde. STOP: kun når alle 10 kriterier er SANDE; hvis du nærmer dig usage-grænsen, commit + opdatér BUILD_STATUS og stop rent, så jeg kan "claude --resume" i morgen og fortsætte.
```
**Start uovervåget efter plan-godkendelse:** `claude --permission-mode auto` (deny-liste + hook = sikkerhedsnet).

## Morgen
1. `NIGHT_BUILD_REPORT_2026-06-02.md` · 2. `BUILD_STATUS.json` · 3. `git log` (night-build) ·
4. `npm run build`/`lint` grønne · 5. Kør `/approve` + motorens `--dry-run` lokalt, deploy manuelt hvis godt,
6. Slå morgen-scheduled-task til når du er tryg ved motoren.
