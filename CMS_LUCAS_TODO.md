# CMS_LUCAS_TODO.md — det DU selv skal gøre (manuelt)

> Claude Code kan bygge alt kode, men disse konti/nøgler kræver dig.
> Rækkefølgen matcher byggefaserne — du behøver kun trin 1-3 før fase 0.

## Før byget starter (fase 0)

**1. MongoDB Atlas — ✅ STORT SET FÆRDIG (verificeret 2026-06-07)**
Cluster `buur-cms` kører: gratis M0, AWS Stockholm (eu-north-1, EU ✓),
bruger `shadowporo123` oprettet ✓. Tre småting mangler:
1. Connect → "Drivers" → kopiér connection string (`mongodb+srv://...`),
   indsæt dit database-password i den, og læg den i `.env.local` som
   `MONGODB_URI` (eller giv den til Claude Code).
2. SENERE (først når CMS'et deployes til Vercel): Network Access →
   "Allow access from anywhere" (0.0.0.0/0). Lige nu er kun din egen IP
   whitelistet — det er FINT til lokal udvikling.
3. Slet sample-datasettet igen (Atlas er ved at loade det) — det æder
   en stor bid af free-tierens 512 MB. Database → Browse Collections →
   slet sample_*-databaserne.
NB: "Connect via CLI/Compass" behøver du IKKE — Claude Code forbinder
via connection string i .env.local.

**2. Vercel-token — KAN VENTE til fase 1/3 (publish-funktionen)**
Hvorfor token når du har Vercel MCP + CLI? Fordi MCP'en og CLI'en er
DINE værktøjer på DIN maskine (logget ind som dig) — de bruges af
Claude Code under udviklingen. Men når CMS'et kører i produktion på
Vercel og en KUNDE trykker "Udgiv", skal CMS-serveren selv kunne kalde
Vercel API'et — den har ikke din CLI-login. Det kan kun et API-token.
Når det bliver aktuelt:
1. (Council-krav) Opret et dedikeret Vercel-team til kundesites, så
   tokenet ikke kan røre dine egne projekter.
2. vercel.com/account/settings/tokens → "Create Token" → scope: det
   dedikerede team → `VERCEL_TOKEN` (+ `VERCEL_TEAM_ID`) i .env.local.

**3. Anthropic-nøgle — ✅ FÆRDIG (besluttet 2026-06-07)**
Lucas vil IKKE have en ekstra nøgle — den eksisterende genbruges og
ligger allerede i `.env.local` (kopieret fra lead-system).
Konsekvens for bygget: CMS'ets eget kr-loft pr. site + samlet
månedsloft i Master Command er nu ENESTE værn om budgettet — byg det
solidt (jf. CLAUDE.md §A.4).

## Under bygget (når Claude Code beder om det)

**4. Vercel Blob (fase 1, 2 min):** I CMS-projektet på Vercel →
Storage → Create Blob store → token gives som `BLOB_READ_WRITE_TOKEN`.
(Claude Code kan guide dig præcis når det er aktuelt.)

**5. Pilot-godkendelse (fase 1):** kig Mellow-ingesten igennem —
godkend de foreslåede redigerbare felter (én gang pr. site).

## Senere faser

**6. KIE-nøgle:** du HAR nøglen — indsæt den selv i `.env.local` på
linjen `KIE_API_KEY=` (bruges først i fase 5, men så er den klar).

**7. CMS-domæne (før VIDA):** beslut fx `cms.<jeres-domæne>.dk` og peg
det på CMS'ets Vercel-projekt (Vercel guider DNS).

**8. GDPR (fase 5, indbakken):** udfyld Datatilsynets standard-
databehandleraftale med VIDA som første kunde (Claude Code laver udkast).

**9. PageSpeed/Search Console (fase 4):** gratis Google Cloud-projekt +
API-nøgle til PSI; Search Console-verificering klarer systemet via
service account (genbrug af lead-systemets Google-setup — Claude Code
guider).

## Det er ALT.
Resten (repo, kode, deploy af CMS'et, login, editor, AI-lag) bygger
Claude Code selv ud fra `CMS_CLAUDE_CODE_PLAN.md`.
