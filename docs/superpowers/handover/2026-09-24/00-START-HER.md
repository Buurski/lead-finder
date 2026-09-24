# 00 — START HER (handover 24/9-2026 → næste session)

## Læs i denne rækkefølge (≈15 min)

1. `00-START-HER.md` (denne) — prompt, mål, første 3 handlinger
2. `05-regler-og-faelder.md` — hårde regler (send = kladder, hemmeligheder, Hermes' cron er ikke din) + fælder der har kostet timer
3. `01-tilstand.md` — hvad findes, hvor, og **at main og feature-branchen er gået fra hinanden**
4. `02-mangler-og-prioriteter.md` — prioriteret liste A→G med færdig-betingelser
5. `03-hermes-og-idéen.md` — hvad Hermes-profilerne (default, cofounder, marketing) har lavet, idéen bag, og hvad de mangler
6. `04-arbejdsmetode-og-skills.md` — skills, modeller, councils, verifikation
7. `06-blog-pipeline.md` — blog-board i HQ (Hermes' spec + Lucas' tilføjelser: manuelle idéer → Hermes bearbejder, idé-signaler fra CRM, rating, billeder, udgiver-cron) + koordinering med Hermes
8. `07-seo-data-og-kunde-synlighed.md` — SEO-data (GSC/GEO) på kundeprofilen, kunde-kort på kinly.dk/projekter, resultater på forsiden (kun verificerede tal)
9. Hermes marketings blog-handoff (SHA'er, gates, A/B-fix): `KnowledgeOS/wiki/kinly/blog-handoff-2026-09-25-b4-fix.md`
10. `raa/` — rå rapporter (Codex Sol-strategi, council-linser, Hermes' egne handovers). Læs når et punkt i 02 henviser dertil.

Uden for mappen, når relevant: spec `docs/superpowers/specs/2026-09-22-kinly-crm-hq-design.md` (feature) og `…/2026-09-23-personligt-hq-design.md` (main), vault `KnowledgeOS/wiki/os/kinly-hq-status-2026-09-23.md`, `wiki/os/ideal-kunde-icp-v2-2026-09-24.md`, `wiki/os/lead-system-analyse-2026-09-24.md`, `wiki/kinly/blog-plan-2026-09-24.md`.

## Målet

Ét færdigt, verificeret Kinly HQ som **Lucas og Charlie faktisk bruger hver dag** — ikke flere sider.
Det der tæller: (1) intet kan sende forkert/dobbelt eller havne i spam, (2) kolde mails og gratis udkast
bliver til samtaler og kunder, (3) kunderne er i fokus (hvad har vi lovet, hvad skylder de, hvad har vi lavet),
(4) Charlie kan bruge det uden Lucas. **Den ærlige dom fra councils: flaskehalsen er konvertering, ikke flere leads eller features.**

## De første tre handlinger

1. **Merge main ind i `feat/crm-hq-2026-09-22`** efter planen i 02-A (tag først, migrationer omnummereres 0008–0010, main's login vinder, `/profil` → `/settings`). Kør `claudex-loop`: skriv merge-planen, lad Codex gpt-6-sol reviewe den, byg, lad Sol inspicere diffen.
2. **Luk sikkerheds-/send-punkterne i 02-B** i samme bølge (send-svar-ruten, "sendt men ikke registreret", Charlie-afsender, regenerate-Basic, ICS-token, dekodet env på VPS via Hermes).
3. **Giv Hermes overdragelsen** (06, "Overdragelses-protokol"): merge-SHA + regenereret drizzle-journal til default + marketing og kanban-kort t_6c9d3972. Default integrerer derefter blog-grenen som 0011+.
4. **Verificér og deploy én gang**: `npm run verify`, browser-gennemklik af de Codex-byggede spor (opgaver/kalender, kunder/relationer/Viden, SEO) på lokal kopi, én ende-til-ende testmail til `buur.aigro@gmail.com` med DMARC-pass, prod-deploy, live-tjek. Opdatér memory + vault-status.

Derefter C → D → E → F (blog: se 06, koordineret med Hermes) → G i 02, med en plan pr. bølge. Du må ændre rækkefølgen, hvis du finder noget vigtigere — skriv hvorfor i planen.

---

## Prompt til den nye session (kopiér alt herunder)

```
Du overtager Kinly HQ (internt CRM + lead- og mailsystem for Kinly: Lucas og Charlie) efter en lang session.
Arbejd selvstændigt: spørg mig kun ved reelt nye scope-beslutninger, ellers beslut selv og skriv hvorfor.

START: Brug skills i denne rækkefølge: caveman (full) + ponytail (full) for token-besparelse;
superpowers:using-superpowers → superpowers:writing-plans (lav en plan ud fra handoveren, bølger + hårde gates);
claudex-loop for alt på send/auth/penge/DB/merge (Codex gpt-6-sol reviewer planen og inspicerer diffen,
gpt-6-luna til mekanik; CODEX_HOME=$HOME/.codex-review, altid < /dev/null);
superpowers:subagent-driven-development + using-git-worktrees til udførsel; systematic-debugging ved fejl;
verification-before-completion før du siger færdig; impeccable + screenshot-loop til UI;
anti-slop til al kundevendt tekst; claude-seo-familien til SEO/GEO; typesafe:typesafe-ai til Jev.

LÆS FØRST: C:\Users\Buur\Documents\Workflows\lead-system-crm\docs\superpowers\handover\2026-09-24\00-START-HER.md
og derefter filerne i den rækkefølge den angiver. Verificér påstande mod koden/DB før du stoler på dem —
handoveren er et øjebliksbillede fra 24/9 og andre sessioner (og Hermes) arbejder parallelt.
Tjek altid `git log HEAD..origin/main` før du bygger.

VÆR KRITISK: sig fra når noget er en dårlig idé (også mine ønsker). Hellere færre ting der virker end
mange der ser færdige ud. Brug councils (2-3 friske linser + Codex Sol) efter hver bølge der rører
send/auth/penge/data. Bevis før "done": test-output, screenshot, HTTP-svar.

HÅRDE REGLER: udgående mails/beskeder er altid kladder som Lucas/Charlie selv sender (testmails kun til
buur.aigro@gmail.com); send-gaten må aldrig svækkes; hemmeligheder kun fra filer, aldrig i chat/git;
Claude rører aldrig Hermes' cron-config/.env — tal med Hermes via Hermes-MCP eller
`ssh hermes-vps 'hermes -p <profil> -z "…"'`; vault: pull --rebase --autostash før skriv, aldrig force-push;
migrér før deploy; git-tag før destruktivt arbejde; Composio aldrig i produktionskode; max 2-3 prod-deploys/dag.

FØRSTE OPGAVE: læs Hermes' alignment-svar (raa/ eller /tmp/hermes-*-svar.md på VPS'en), merge main ind i
feat/crm-hq-2026-09-22 + luk sikkerheds-/send-punkterne (02-A og 02-B), verificér og deploy én gang.
Derefter resten af 02 i prioriteret rækkefølge. Blog-boardet (06) bygges SAMMEN med Hermes oven på den nye main —
Hermes ejer sin gren agent/0924-1932-lead-system; aftal hvem der integrerer før du rører den.

TÆNK UD AF BOKSEN: hvad mangler et 2-mands bureau med 4-5 kunder for at nå 20 — og hvad skal fjernes?
Afslut hver bølge med opdateret memory, en vault-statusnote og en kort rapport til mig på dansk.
```
