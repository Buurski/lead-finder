# 03 — Hermes: idéen, hvad profilerne har lavet, og hvad de mangler

Kilder: Hermes' egne handovers 24/9 aften (`raa/hermes-marketing.md`, `raa/hermes-default.md`,
`raa/hermes-cofounder.md` hvis den nåede at svare) + Lucas' Telegram/webui-samtaler læst via Hermes-MCP.
Hermes' tal er Hermes' påstande — verificér de vigtige (git, prod, DB) før du handler på dem.

## Idéen (samlet fra profilerne og Lucas)

Kinly skal omsætte **synlighed til henvendelser** og **henvendelser til betalende kunder** for et 2-mands bureau:
- **Blive fundet og valgt** (marketing): lokale virksomheder søger eller spørger en AI → møder Kinly i Google/AI-svaret → lander på `/seo-tjek/` eller prissiden → kontakter os → Lucas svarer. Penge: opsætning 3.997/4.997/8.449 kr + Hjemmesidepas fra 479 kr/md.
- **Blog** (/blog, besluttet 24/9): 4 korte opslag/md, story-drevet men i praksis en **GEO-maskine** (klare svar, rigtige tal, kilde pr. påstand, FAQ 3–5 spørgsmål, hvert opslag sælger noget konkret, ~én side). Agenten skriver og kvalitetstjekker med council; **Lucas godkender i CRM'et; et job udgiver.** Plan: `KnowledgeOS/wiki/kinly/blog-plan-2026-09-24.md`, pipeline-spec `blog-pipeline-spec-2026-09-24.md`.
- **Kinly HQ** samler leads, kundedialog, opgaver og godkendelser, så Lucas og Charlie kan følge op uden at miste kontekst. Målgruppe: selvstændige danske servicevirksomheder — ikke kæder, ikke oplevelses-steder med tusindvis af anmeldelser (ICP v2, cofounder).
- **Gratis udkast** er indgangstilbuddet (forsiden viser det live).
- **Rollefordeling (Lucas 24/9):** GPT-6 Sol = orchestrator (default, lucas, charlie, cofounder) der planlægger og kvalitetssikrer; DeepSeek V4.1 Flash = worker (marketing, kundeplejer, alle ~18 crons). **Space Bunny Alpha fjernet fra alle automatiske ruter og må aldrig lave design/UI/kundesider.**

## Hvad der er lavet (de sidste ~10 dage, ifølge Hermes)

- **kinly.dk** (`/root/kinly-site`, main): responsive billeder/webp, PostHog cookieless + web vitals, `/seo-tjek/`-rettelser (reelle signaler, cap 97, CVR-format), B2B-navne + noindex på Aalborg/Aarhus-bølge, `/billig-hjemmeside/` + nationale undersider + interne links, **forsidens priser forenklet (`6342fb6`, live 24/9)**.
- **Blog**: teknisk fundament (indeks, opslag, RSS, schema, tests) på `agent/0924-1746-kinly-site` (også `agent/0924-blog-kinly-site`/`agent/0924-blog-s4-fix`) — **ikke merget, /blog giver 404**. Tre rigtige kladder (1.367–1.399 ord, med council og kildetjek) i `KnowledgeOS/drafts/blog/`. De venter på Lucas' "SKAL TJEKKES"-svar nederst i hver fil + `BLOG_PUBLISH_LIVE=1`.
  - ⚠ Blog-planen siger "ca. én side (600–900 ord)"; kladderne er ~1.400 ord. Ret det før udgivelse.
- **Blog-board i lead-system** (godkendelse/udgiver i CRM'et): kerne "B4" på VPS-grenen `agent/0924-1932-lead-system` (`695d755`) — 37 fokuserede tests, ikke fuld suite, ikke prod. Review af "B" AFVIST → fix-kort kører. **Koordinér med merge i 02-A** (samme repo, andre filer).
- **Kinly HQ på main** (24/9, bygget af Hermes/Codex-session via `/root/lead-hq-*`-worktrees): personligt login, `/api/agent/*`, async chat, Svar-indbakke, Gmail-trådlink + udfaldsknap (`8599a78`).
- **Kunder**: VIDA (behandlingssider, mobil-dropdown i menuen, hero-billede skiftet, Maps-link til profilen; kladde til Lene lagt i Gmail), Ikast (case-side "Sider vi byggede", GSC-baseline), KT VVS (case-rute — men **KT VVS har ingen godkendt offentlig case**; brug ikke demoen som case).
- **Svar-digest** omskrevet til Jev-klassificering (fra 4,4 mio. tokens pr. kørsel til ~30 s script) — men se "pauset" nedenfor.
- **ICP v2** (`wiki/os/ideal-kunde-icp-v2-2026-09-24.md`): 1.427 rækker analyseret; støj = storcentre, museer, 5.000+-anmeldelses-steder, kæder; rangering v2 er en hypotese.

## Kørende automatik (24/9 ~23:00, ifølge default)

| Job | Tid | Status |
|---|---|---|
| `agent-leadgen-daglig` → ingest 06:30 → CRM-kø | 06:00 | ok |
| `kinly-preview-intake` (gratis udkast) | hver 30. min, DeepSeek | ok (Lucas bad om Sol til første udkast 23/9 — **tjek hvilken model den faktisk bruger**) |
| `crm-mail-sync` + `inbox-digest-sync` | 08/10/15 + 08:50/10:50/15:50 | **PAUSET** ("not_run_after_release_gate") → kunde-tidslinjernes mail-resuméer og Svar-indbakken bliver ikke opdateret automatisk! |
| `team-checkin` | hverdage 09:00 | ok, skriver til `/api/agent/log`. Stiller spørgsmål på Telegram — hold op mod reglen "ingen beskeder" (interne til Lucas/Charlie er OK) |
| `morning-brief`, `morgenrapport` | 07:15 / 07:00 | ok |
| `agent-blog-cyklus` | man 08:00 | aktiv, aldrig kørt → **pause den til /blog er live** |
| `nat-build-check`, `cloudflared-quick-tunnel-rotate` | 06:00 / hver 12. t | **fejler** (timeout / systemd) |
| `maaned-marketing` | 1. i md | fejlede 1/9 (script manglede), uverificeret |
| GEO-citation-loop | man 08:20 | fejler hvis vaulten er "beskidt" → hold vaulten ren søndag |

## Hvad Hermes mangler / beder om

Fra Lucas: go-live af /blog + svar på kladderne; valg af blogbilleder; KT VVS-case-godkendelse; CVR/Datafordeler-adgang; Ikast-pris; faktura 010 til Jernbanecaféen (usendt); GBP-opslag afventer Google; 5+ anmeldelser → /anmeldelser/-side; artikel 3's egen måling fra telefonen (VPS-IP blokeres).
Fra Claude Code: færdiggør blog-board/udgiver i lead-system sammen med merge; én autoritativ CRM-optælling med entydige nævnere før score v2; release-gate for mail-sync (grøn "0-send"-test) så sync kan tændes igen.
**Må ikke røres af Claude:** `KnowledgeOS/drafts/blog/*` (Lucas retter selv), `data/gbp-opslag.md`, Hermes' profil-scripts/cron/credentials/release-gates, kinly.dk's hero/priser/cookie-tekst (Lucas' alene).

## Min kritiske vurdering (Claude)

1. **For mange parallelle byggere på samme repo** (denne session, en Codex/Claude-session på main, Hermes-worktrees på VPS'en). Det er årsagen til den divergens der nu kræver en større merge. Aftal én integrations-ejer pr. repo pr. dag. Hermes bygger på grene; kun én merger til main.
2. **Tidslinjerne lyver stille**: mail-sync er pauset, så "hvem venter på hvem" på kundeprofilerne er forældet. Det er det vigtigste driftsproblem for Lucas' ønske om at "se hvad vi har skrevet til folk". Løs det enten ved at få release-gaten grøn eller ved at bygge Sendt-mappe-læsning direkte i HQ (02-D).
3. **Blog før målbar tragt er for tidligt**: 16 besøg og 0 henvendelser på 28 dage. Merge fundamentet med `/blog` noindex, udgiv ét opslag om en RIGTIG kunde med tal og interne links til by-/branchesider, og mål henvendelser pr. opslag, før kadencen går op.
4. **Gratis udkast er Kinlys stærkeste kort**, men der er kun bygget ganske få gennem hele kæden. Mål: fra "ja tak" til link sendt på under 24 timer, med screenshot i CRM'et.
5. **Nyhedsbrev**: begge (default og council) siger nej med 4 kunder. Enig.
