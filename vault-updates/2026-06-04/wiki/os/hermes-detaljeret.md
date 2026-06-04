---
title: Hermes — detaljeret
type: os
updated: 2026-06-04
---

# Hermes — den 24/7 baggrundsagent

Hermes er den lille agent der kører hele tiden ved siden af command-center'et.
Skelettet ligger i `hermes/` i lead-system-repoet. Ikke deployet endnu.

## Arkitektur
- **Railway**-app (Docker). Root = `hermes/`. Node, ingen tunge deps (kun fetch).
- **Telegram-bot** (BotFather) som styre-flade. Adlyder KUN `TELEGRAM_ALLOWED_CHAT_ID`.
- **Dreaming-loop**: natlig sweep (~03:00) der læser vaulten og foreslår oprydning.
- **Delt hukommelse**: læser/skriver `Buurski/KnowledgeOS` via GitHub API (samme
  vault som appen læser live fra → mobil-noter dukker op i dashboardet).

## Integration-plan
- **Gmail**: kun via appens armed send-sti — Hermes sender aldrig selv.
- **Calendar**: callbacks + møder som deck-items (Fase C).
- **Sheets**: læser leads/klienter via appens read-ruter (ikke direkte skriv).
- **KnowledgeOS (GitHub)**: periodisk pull + write-back af forslag (aldrig kerne-filer).
- **AI Spend**: Hermes' egne kald logges gennem samme `spend-log` som appen.

## Sikkerheds-overvejelser
- Kan ALDRIG sende mail uden eksplicit "ja" i Telegram.
- Kun én chat-id må styre den.
- Motor-kald går gennem appens **preview** (skriver intet) indtil bekræftelse.
- Ingen destruktive sletninger i vaulten — kun tilføj/forslag.
- Hemmeligheder kun i Railway env-vars.

## Setup-trin (kort)
Se `SETUP_HERMES.md` i repo-roden for de eksakte trin (Railway, BotFather, env,
handshake, deploy).

## Cost-estimat
- Railway: ~5-7 USD/md for en lille altid-kørende container.
- Telegram: gratis.
- AI: kun hvis Hermes selv kalder modeller (dreaming-resuméer) — få kr/md.
- GitHub API: gratis inden for rate-limits.

## Status
2026-06-04: skelet + setup-guide klar. Ikke deployet. Næste skridt er Lucas' eget
Railway-deploy.
