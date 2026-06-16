---
title: Studio prompt-gen — council log
date: 2026-06-16
type: proces
---

# Studio `/studio/prompt-gen` — council-log (3 runder)

Feature: agenticos genererer en komplet **Claude Code build-prompt** (recon +
branche-template + skills + scoping) for en kunde-demo, og **dispatcher** den til
en Claude Code-session (gratis på subscription) der bygger demoen. Orchestration
billig (API), build gratis (subscription).

**Hård kendsgerning:** `mcp__dispatch__start_code_task` findes IKKE i dette miljø,
ingen dispatch-tunnel i repo. Ægte programmatisk dispatch fra Vercel-route →
Claude Code er umulig. Realistisk dispatch: route persisterer prompt (KV+disk) +
returnerer den; build køres af en Claude Code-session (subagent eller menneske).
I E2E dispatcher orchestrator-sessionen (mig) build via Agent-tool = ægte dispatch.

---

## Runde 1 — arkitektur-kritik (2× Sonnet, parallelt)

**Konvergerede fund (begge agenter):**

| # | Sev | Fund | Beslutning |
|---|-----|------|-----------|
| 1 | HIGH | SHA-pinned GitHub raw-URLs til template = netværksafh. + staleness | **Inline template-JSON** i prompt (altid frisk). Behold pinned raw-URLs KUN til dybe kontekst-docs (CLAUDE.md, design-MD) som er for store at inline |
| 2 | HIGH | Token-størrelse (recon+template+skills 8-12k) | Strip `images[]` fra inline-recon, cap `headings[]`→10, trunkér `toneSample`→300 |
| 3 | HIGH | **Prompt-injection via scraped HTML** ind i `/bypass-permissions`-session | **Fence** recon som UNTRUSTED DATA + strip injection-mønstre. Non-negotiable |
| 4 | HIGH | Blast-radius af poisoned prompt (slet filer, læk .env, push main) | **Scope** build-session til `demo-sites/{slug}/` + forbyd `.env`/andre dirs |
| 5 | MED | Empty recon → generisk build i stilhed | Validér: hvis palette+headings tomme → afbryd m. fejl til UI |
| 6 | MED | Branch-mismatch → forkert template i stilhed | Throw hvis `templateBySlug(slug)` = null |
| 7 | MED | 24h TTL uden native KV EX | Envelope `{fetchedAt, data}`, tjek alder ved get |
| 8 | MED | "DISPATCH" misvisende uden tunnel | Behold knap (Lucas's ønske) men route = persist+return; UI viser prompt + copy |
| 9 | LOW | recon-full wrapper let over-engineered | Behold (mandat kræver fil) men hold tynd |

**Implementeret R1:** alle HIGH + MED. Inline template-JSON + pinned URLs til design-MD
(hybrid). Sanitering+fence i prompt-builder. Scoping-sektion. TTL-envelope. Auth-gate
på dispatch-build (Bearer vs `STUDIO_DISPATCH_SECRET||DEEP_RESEARCH_SECRET`, no-secret=allow lokalt).

## Runde 2 — implementations-kritik (TBD)

## Runde 3 — demo-kritik (TBD)
