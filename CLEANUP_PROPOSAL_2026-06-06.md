# Cleanup Proposal — 2026-06-06

**Intet slettes uden Lucas's "ja".** Dette er forslag. Branch `command-center-v3`.

## SLET — død Deep Research-UI (erstattet af lead-gen + daily-ops)
Bekræftet ikke længere importeret nogen steder (panel fjernet fra /leads):
- `src/components/DeepResearchPanel.tsx`
- `src/app/api/leads/queue-deep-research/route.ts`
- `src/app/api/leads/cowork-batch/route.ts`
- `src/lib/cowork-prompt.ts`

**Behold (stadig wired):** `src/app/api/leads/deep-research-result/route.ts` +
`src/lib/deep-research-queue.ts` — motoren bruger `enrichedInfo.deepResearch` via
composite-score. (Kan også fjernes hvis vi dropper den vej helt — dit valg.)

## SLET / ARKIVÉR — gamle rapport-/plan-filer i root
Historik, ikke kode. Foreslå flyt til `docs/archive/` (eller slet):
- `NIGHT_BUILD_REPORT.md`, `_v2`, `_v3`, `_v4`
- `PLAN_DAGENS.md`, `PLAN_DEL3.md`
- `DASHBOARD_OVERHAUL_GOAL.md`, `HARDENING_REPORT.md`, `VERIFY_REPORT.md`
- `OUTREACH_ANALYSIS_2026-06-04.md`, `SETUP_HERMES.md`

**Behold i root:** `AGENTS.md`, `CLAUDE.md`, `README.md`, `DEPLOY.md`, `DESIGN.md`,
`PRODUCT.md`, `COMMAND_CENTER_VISION.md` (+ disse to nye audit-filer).

## MERGE — konsolidér duplikering (kode, lav risiko)
- Demo-URLs: lad `src/lib/demos.ts` eje; `email.ts` + `messenger/compose.ts` importerer
  derfra (fjern dublet-konstanter).
- Branch→demo: `messenger/compose.ts demoUrlFor` → genbrug `demos.ts pickDemoPair`-logik.
- Review-floor: flyt fra `apify.ts:28-35` ind i `qualify.ts` (ét sted ejer "kvalificeret").

## BEHOLD — ikke slet (stadig brugt)
- `/api/leads/[id]/analyze` + `/enrich` — bruges af `LeadTable.tsx` side-panel.
  (pending-todo foreslog delete, men de er live. Refaktorér senere, slet ikke nu.)
- Alle test-scripts (37 suiter) — god dækning.

## FLYT — mappestruktur (pending-todo P2.2, større, senere)
`src/lib/leads/` → undermapper (qualification/ scoring/ enrichment/ pipeline/).
Stor refactor, ~4t. Parkér til efter prod er stabil.

## LOKALT (gitignored, ikke shippet) — ryd når du vil
- `.send_queue/_*.mjs` scratch-scripts (mange). Ikke i repo, men clutter på disk.

---
**Anbefalet rækkefølge:** (1) slet Deep Research-UI-cluster, (2) arkivér root-rapporter,
(3) merge demo-URLs. Resten parkeres. Sig "ja" til hvilke, så udfører jeg.
