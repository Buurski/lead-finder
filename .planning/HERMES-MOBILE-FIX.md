# Hermes mobil-fix + forbedringsplan (2026-06-11)

## Diagnose (verificeret med Playwright, 375x812)

Root cause: `HermesClient.tsx` bruger inline grid `minmax(0, 1fr) 300px`
**uden media query**. På 375px klemmes chat-kolonnen til ~40px (deraf
"Hje"/"Lu"/"Ch"-bleed = trunkerede profil-chips), mens 300px-sidekolonnen
æder resten. Shell-draweren (hamburger) virker fint — det Lucas så "bløde
igennem" var Hermes-sidens egen venstre kolonne, ikke nav-sidebaren.

Sekundært: touch-targets < 44px (cron-knapper 3px/9px, session-knapper
~32px), "+ Ny samtale" wrapper, textarea 13.5px trigger iOS-zoom,
nav viser stadig "SNART"-badge på Hermes.

## Strategi

- Flyt layout-bærende inline styles til CSS-klasser i `globals.css`
  (`hermes-grid`, `hermes-chat`, `hermes-side`, `hermes-chips`,
  `hermes-mini-btn`, `hermes-session-btn`, `hermes-input`, `hermes-new-btn`).
- Breakpoint **860px** (matcher shell-draweren) → 1 kolonne, chat øverst,
  status/cron/samtaler/dream-cards fuld bredde under.
- Mobil: touch-targets ≥44px, textarea 16px (ingen iOS-zoom), chips nowrap.
- Hermes-brand bevares: grøn accent, cc-card-sprog, "Hjernen/Lucas/Charlie"
  chips, Moon-dream-sektion — kun geometri ændres.

## Kritiker-fund der fixes i samme omgang (lav-risiko)

- Sessions-effect dobbelt-fetch (dep på `sending` → guard `if (sending) return`).
- Profilskift/sessionsskift midt i send → guard.
- `maxLength={8000}` på textarea.
- Quick-chips forsvandt permanent efter første besked → vises nu altid (når online).
- Offline-state frosset fra SSR → "Tjek igen"-knap der re-fetcher `/api/hermes/status`.
- Cron-fejl var stum → inline fejltekst.
- Dream-slice kunne klippe midt i markdown → klip ved afsnitsgrænse.
- `latestDream` sluger fejl stumt → `console.error`.
- Nav: Hermes "SNART"-badge fjernes (den ER live).

## Udskudt (backlog — kræver VPS-redeploy eller større omskrivning)

- Shim: per-profil rate limit (nu global 30/min), LRU i stedet for
  `_session_locks.clear()`, `proc.kill()` ved TimeoutExpired.
- KV append ikke-atomisk (lav risiko: én bruger).
- TLS via Caddy + subdomæne (kendt begrænsning, står i vps/README.md).
- Per-profil sessions-loft (globalt 60 nu).

## Status-mysteriet ("hermes-api offline" på Lucas's screenshot)

Pragmatiker-agent verificerede 2026-06-11 ~22:40: VPS-services active,
port 8787 svarer 401 udefra, prod svarer med basic-auth-vagt. Lucas's
screenshot er sandsynligvis taget FØR env-var-redeploy var færdigt.
Efter UI-fix verificeres prod-status igen i browser.

## Idé-katalog (visionær-agent, 2026-06-11)

### Cron-ideer (top-5 af 12)
1. **Pipeline Pulse** (07:00 dagligt) — kø + callbacks + svar → 5-linjers brief. [S]
2. **Follow-up Reminder** (09:00 dagligt) — sent >5 dage, intet svar, uden for 14-dages blok → liste. [S]
3. **Demo-Bombe Scout** (mandag) — brancher med 3+ leads uden demo → 2 konkrete demo-forslag. [S]
4. **Vault-havearbejde** (søndag nat) — broken wikilinks, døde noter → rapport, ingen auto-ændringer. [S-M]
5. **Kunde-Radar** (tir+tor) — uptime-check på kunders sites → Telegram ved nedbrud. [M]
   (Fuld liste m. 12 ideer + prompts: se agent-output i session/vault.)

### Webside-ideer (top-3 af 7)
1. **Dream-arkiv browser** — tidslinje over alle nattens dreams, søgbar. [S]
2. **"Spørg om nattens fund"-knap** — dato-unik quick-prompt efter dreaming. [S]
3. **Cron last-output viewer** — accordion med seneste job-output (kræver shim-endpoint). [S-M]

### Vilde (top-2 af 5)
1. **Lucas-patterns** — Hermes læser vault som adfærdsdata ("du redigerer 80% af
   klinik-drafts") → `lucas-patterns.md` → justerer engine-prompts. [L]
2. **Hermes som forsiden** — dashboardet ER Hermes' fortolkning af systemtilstand,
   regenereret løbende. [L]
