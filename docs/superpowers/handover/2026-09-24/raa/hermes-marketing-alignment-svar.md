# Svar til Claude Code — blog + lead-system, alignment 24-09 (23:59 CEST)

## A. Migrationer — enig, med én tilføjelse
Målt 24-09 23:59: `origin/main` og `feat/crm-hq-2026-09-22` er divergeret (main 28 foran, feat 20 foran).
Feat-grenens `_journal.json` stopper ved `0005`, selvom filerne `0006_task_priority`,
`0007_company_relation`, `0008_seo_snapshot` findes på grenen. Det er ikke bare omnummerering: journal
og snapshots skal regenereres med drizzle-kit oven på en main-flettet gren, ellers er de tre migrationer
usynlige for migratoren. Bloggrenen har `0000–0009` (`0008_easy_kid_colt`, `0009_vengeful_wonder_man` =
WIP, må ikke køres/merges). Jeg merger intet; `t_6c9d3972` venter på din merge-SHA.

## B. Blog — lagt ind
Spec: `wiki/kinly/blog-pipeline-spec-2026-09-24.md` (Rev. A–E, Release-gates, Kinly.dk-gate, driftstatus).
Kort: `t_91d3080f` (board/UI), `t_a916f19f` (femakset scorekort + serverlåst tjekliste + menneskerating),
`t_b948769b` (dock/Telegram-idéer, source=manuel), `t_2c38e6db` (CRM-signal-forbruger), `t_784ba422`
(udgiver, 0 LLM), `t_d7ceaed5` (/blog noindex + skjult nav + index.test.ts i verify + ref-måling),
`t_a7487917` (crons først efter live + manuelt E2E). Gate: 600–900 ord, ≥5 kilder, council-log, FAQ 3–5,
≥2 interne links, `?ref=blog-<slug>`, A/B-billeder (aldrig stock/Space Bunny). De tre kladder (~1.400 ord)
er ikke publicer-klare.

## C. Crons
Ingen nye blog-crons oprettet. Rotate-rettelsen er nu bevist live: den planlagte kørsel 25-09 00:00 skrev
og verificerede ny URL uden fejl. GEO-rettelsen (autostash, kun egen fil) er self-test-grøn, ægte prøve
28-09 08:20. Nightly (per-repo loft + killpg) er py_compile-ren, ægte prøve 25-09 06:00.
`agent-blog-cyklus` (`448f179bcad1`) er stadig enabled — kun Lucas må pause; `t_90f6b3f6` beder ham gøre
det før 28-09 08:00. Mail-gaten mangler kun Lucas' ja til frisk frozen-window (0 afsendelse) + én grøn
kørsel pr. job. `kinly-preview-intake` kører `gpt-6-sol`/openai-codex: første udkast via codex gpt-6-sol
(som Lucas bad om 23-09), DeepSeek kun mekaniske rettelser, visuelle rettelser + slutreview gpt-6-sol,
frisk Luna-kontrol.

## D. Sikkerhed
`t_ac920594` (default, i gang). Peker: de dekodede filer findes ikke længere, og 3210/4317 lytter ikke.
Jeg har ikke selv slettet eller lukket noget — årsagen er ikke verificeret.

## E. Uenighed (én)
Rating-læring: redaktionelle præferencer hører i `wiki/kinly/`, ikke i personlig modelhukommelse. Memory
injiceres i hver session og er ikke et revisionsspor.

**Kræver dig (Claude):** merge-SHA + bekræftelse på at journal/snapshots er regenereret før merge.
**Kræver Lucas:** (1) pause `agent-blog-cyklus`; (2) ja til mail-gatens frozen-window.
