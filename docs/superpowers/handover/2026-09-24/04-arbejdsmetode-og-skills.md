# 04 — Arbejdsmetode, skills og modeller

## Skills ved start (i denne rækkefølge)

| Hvornår | Skill | Hvorfor |
|---|---|---|
| Altid, fra første svar | `caveman` (full) + `ponytail:ponytail` (full) | Token-besparelse og mindste rigtige diff. Lucas' norm. |
| Første handling | `superpowers:using-superpowers` → `superpowers:writing-plans` | Handoveren ER specen. Skriv en plan (`docs/superpowers/plans/2026-09-2x-kinly-hq-fase-5.md`) med bølger og hårde gates før du koder. Brainstorming kun hvis noget i 02 er uklart — Lucas har bedt om at du selv beslutter. |
| Merge + alt på send/auth/penge/DB | `claudex-loop` (Claude planlægger → Codex **gpt-6-sol** reviewer planen; efter bygning: Sol inspicerer diffen) | Sol fandt reelle fejl hver gang (dobbelt-send, rowIndex, falsk modtager). Hold diffen kode-only og under ~1.500 linjer. `CODEX_HOME=$HOME/.codex-review`, `--sandbox read-only`, `< /dev/null`. |
| Afgrænsede byggeopgaver parallelt | `codex-build` / `codex exec -m gpt-6-sol --sandbox workspace-write` i eget worktree | Codex skriver kode+tests; **du** kører `npm run verify` og committer (Codex kan ikke). `gpt-6-luna` til mekanik (omdøbninger, tekstskift). |
| Udførsel af planen | `superpowers:subagent-driven-development` eller `superpowers:executing-plans` + `superpowers:using-git-worktrees` | Én agent pr. worktree; aldrig `git commit -a` i delte træer. |
| Fejl/bugs | `superpowers:systematic-debugging` | Reproducér før fix; rod-årsag i den fælles funktion. |
| Før du siger "færdigt" | `superpowers:verification-before-completion` + `superpowers:requesting-code-review` | Bevis: tests-output, screenshot, HTTP-svar. "Burde virke" tæller ikke. |
| UI | `impeccable` (+ `emil-design-eng`, `design-inspiration` før nye skærme) + screenshot-loop i in-app browseren (desktop + 390px) | Designregler i 05. Operate-mode: skanbarhed før pynt. |
| Kundevendt tekst (mails, blog, kladder) | `anti-slop` + `copywriting`/`copy-editing` + `brand-voice:enforce-voice` | Kladder, aldrig afsendt. Frisk checker scorer, max 3 runder. |
| SEO/GEO (kinly.dk + kunder) | hele `claude-seo`-familien via `claude-seo:seo-audit` (local, maps, geo, schema, technical, sxo) + Jev-domme | Aldrig kun ét seo-skill (Lucas' router). |
| Jev/TypeSafe | `typesafe:typesafe-ai` | Billige, hurtige domme (lead-værdi, svar-klassifikation). Nøgle `~/.typesafe/key`. DPA ikke underskrevet → ingen svartekst/personlige data til Jev før da. |
| Vercel/Next | `vercel:nextjs`, `vercel:env-vars`, `vercel:deployments-cicd` | Next 16 særheder, env-regler. |
| Afslutning af stor bølge | `handoff` + memory-opdatering + vault-note `wiki/os/kinly-hq-status-<dato>.md` | Stale memory er fejlkilde #1. |

## Model-fordeling (Lucas' ordre)

- **Du (Opus)** = orkestrator: planlægger, koder det svære selv (send, auth, penge, DB, merge), verificerer til sidst. Din kontekst må kun indeholde beslutninger — rådata bliver i subagenter.
- **Codex gpt-6-sol** = uafhængig reviewer/inspektør på alt svært + afgrænset bygning. **gpt-6-luna** = billig mekanik.
- **Claude Sonnet-subagenter** = linser i councils (2–3 friske, navngivne linser: sikkerhed / data-korrekthed / Charlie-UX), forfattere, mekanisk arbejde. **Haiku** = opslag. Opus-subagent kun som dommer på pengevej. Max ~15 agenter pr. bølge.
- **Hermes** (VPS) = drift, crons, research, udkast-bygning, marketing. Tal med den via Hermes-MCP (`mcp__hermes__messages_send`/`messages_read`) eller `ssh hermes-vps 'hermes -p <profil> -z "…"'` (Sol-profiler kan tage >10 min; giv 30–60 min timeout og bed dem skrive svaret til en fil).

## Councils — hvornår og hvordan

Efter hver bølge der rører send/auth/penge/data: 3 friske linser parallelt (fx Codex Sol på diffen + Sonnet "data-korrekthed" + Sonnet "Charlie klikker igennem med screenshots på rigtige data"). Linserne får reglerne ordret, returnerer rådata (fil:linje, severity), og du retter før deploy. Ingen agent vurderer sit eget arbejde.

## Verifikations-standard

`npm run verify` grøn → lokal `next start` mod PGlite-kopi af Neon → klik igennem i in-app browseren med screenshots (desktop + 390px) → Codex/council → én prod-deploy → live-tjek (401 uden login, `/api/health` 200, de nye ruter). Prod-screenshots bag login kræver Lucas' login — tast aldrig hans password; brug lokal kopi eller bed ham om et screenshot.
