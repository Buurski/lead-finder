# SETUP_HERMES.md — sådan tænder du Hermes (24/7-agenten)

Hermes er den lille baggrundsagent der kører hele tiden: natlige sweeps, Telegram-
beskeder fra dig på farten, og write-back til vaulten. Den ligger klar i `hermes/`
men er **ikke** deployet — du tager selv det sidste skridt fra Railway når du er
hjemme. Den følger **samme guardrails** som command center'et: den kan ikke sende
mail uden din bekræftelse.

> Hele pointen: du skriver "kør motoren" eller "hvad kræver mig?" i Telegram, og
> Hermes svarer + handler — men alt der sender/sletter/koster spørger først.

---

## 1. Opret Railway-projekt
1. Gå til https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Vælg `Buurski/lead-system` (eller et nyt repo med kun `hermes/`).
3. Sæt **Root Directory** = `hermes`.
4. Railway opdager `hermes/Dockerfile` og bygger automatisk.

## 2. Telegram-bot via BotFather
1. Åbn Telegram, skriv til **@BotFather**.
2. Send `/newbot` → giv den navn (fx "Lucas Hermes") og brugernavn (fx `lucas_hermes_bot`).
3. Kopiér **bot-token** (ser ud som `123456:ABC-DEF...`).
4. Find dit eget **chat-id**: skriv til botten, åbn så
   `https://api.telegram.org/bot<TOKEN>/getUpdates` og find `chat.id`.

## 3. Miljøvariabler på Railway (Settings → Variables)
```
TELEGRAM_BOT_TOKEN=<fra BotFather>
TELEGRAM_ALLOWED_CHAT_ID=<dit chat-id — kun du må styre den>
GITHUB_TOKEN=<read/write til Buurski/KnowledgeOS>
VAULT_REPO=Buurski/KnowledgeOS
APP_URL=<din Vercel-app-URL>            # så Hermes kan kalde /api/engine/run preview
CRON_SECRET=<samme som i Vercel>        # hvis du sætter cron-guard
```
Sæt IKKE GMAIL-credentials her endnu — Hermes skal ikke kunne sende mail i v1.

## 4. GitHub-handshake (delt hukommelse)
- Hermes læser/skriver `Buurski/KnowledgeOS` (samme vault som appen læser fra).
- Den henter via GitHub API (token i env) — enten periodisk pull (hvert 15. min)
  eller som submodule. Mobil-noter du laver i Obsidian dukker så op i dashboardet.

## 5. Dreaming-loop (hvad den gør hver nat)
`hermes/dreaming.js` kører kl ~03:00:
1. Læser dagens kontekst (hot.md + seneste daily-note).
2. Sweeper vaulten for rod: tomme noter, manglende frontmatter, døde links.
3. Skriver et kort forslag til `daily/<dato>-dream.md` (oprydning + advarsler).
4. Sender dig ÉN rolig Telegram-linje om morgenen — ikke en strøm.
   Den **foreslår**; den ændrer ikke kerne-filer (soul.md/claude.md) selv.

## 6. Guardrails (skal stå fast)
- Hermes må **aldrig** sende mail uden din eksplicitte "ja" i Telegram.
- Kun `TELEGRAM_ALLOWED_CHAT_ID` kan styre den.
- Motor-kald går via appens **preview**-rute (skriver intet) indtil du bekræfter.
- Ingen destruktive sletninger i vaulten — kun tilføj/forslag.

## 7. Deploy (dit skridt — ikke automatiseret)
```
# lokalt, hvis du vil teste først:
cd hermes && npm install && node index.js
# Railway deployer selv ved git push, når projektet er sat op.
```

Når den kører, skriv "ping" i Telegram — den skal svare "Hermes er vågen 👋".
