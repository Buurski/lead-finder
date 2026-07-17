---
name: omverden-daily
description: Daglig omverdens-scanning kl 06:30 via last30days-skillet (LOKAL Claude Code — aldrig Vercel/VPS). Kuraterer 3-5 fund og skriver data/omverden.json til vaulten. Forsiden + daily brief læser derfra.
schedule: "30 6 * * *"
---

# omverden-daily

Daglig kørsel af `last30days`-skillet: frisk viden fra TechTwitter/X, Reddit, HN,
GitHub, YouTube og web — kurateret til det Lucas faktisk kan bruge.

## Canonical copy

Denne fil er den version-trackede kilde under
`scripts/scheduled/omverden-daily/SKILL.md`. Den LIVE scheduled task læser en
kopi i `C:\Users\Buur\Documents\Claude\Scheduled\omverden-daily\SKILL.md`.
Retter du den ene, kopiér til den anden (samme regel som lead-engine-morning).

## HARD GATE — hvor dette KAN køre

`last30days` er et Claude Code-skill. Det kører KUN i lokal Claude Code på
Lucas' maskine. ALDRIG i Vercel-crons, ALDRIG på Hermes/VPS'en. Arkitekturen
er derfor: **lokal task producerer → vault-fil er kontrakten → alt andet læser.**

## Hvad den gør

1. Kør `last30days doctor` — er kilder nede, notér det i output i stedet for at fake fund.
2. Kør last30days på disse emner (fast rotation, alle hver dag):
   - **AI/agent-nyt** der påvirker måden vi bygger på (nye Claude/skill-mønstre, MCP, agent-værktøj)
   - **Hvad andre bygger** som ligner Kinly / lead-system (inspiration, trusler)
   - **Globalt væsentligt** i tech der faktisk betyder noget (ikke støj)
   - **Projekt-idéer**: konkrete ting Lucas kunne bygge/bruge denne uge
3. Kuratér til MAX 5 punkter. Krav pr. punkt: hvorfor er det relevant for Lucas
   (én sætning), kilde-URL, source-tag. Rå dumps forbudt.
4. Skriv `data/omverden.json` i vaulten (`Documents/KnowledgeOS`):

```json
{
  "at": "<ISO-timestamp for kørslen>",
  "items": [
    { "title": "…", "summary": "hvorfor relevant for Lucas", "url": "https://…", "source": "x|reddit|hn|github|youtube|web", "tag": "ai|kinly|lead-system|idé" }
  ]
}
```

5. Push til vaulten med den sikre sekvens: `git pull --rebase --autostash` først,
   derefter add/commit/push af KUN `data/omverden.json`. (OBS: safe-push.sh har
   kendt bug — pusher claude-obsidian, ikke vault-roden; kør vault-sekvensen manuelt.)

## Forbrugere (én kørsel, to modtagere)

- **lead-system forsiden:** `/api/omverden` → OmverdenCard (Mission Control, Today-fanen).
  Dato-stemplet; fund > 36 t vises dæmpet som "gammel kørsel".
- **Lucas OS / daily brief (session 3):** læser SAMME fil — dobbeltkør aldrig søgningerne.

## Fallback — maskinen slukket ved task-tid

Kørslen springes over; ingen kø. `data/omverden.json` beholder sidste `at`, og
forsiden viser tydeligt at fundene er gamle — stale er synligt by design.
Hermes' rolle (anbefaling, session 6): et dagligt heartbeat-cron på VPS'en kan
tjekke filens `at` via GitHub raw og pinge Lucas på Telegram hvis > 36 t.
Hermes kører ALDRIG selve skillet — kun påmindelsen. Cron-idéen ligger i
vaultens `wiki/os/hermes-cron-ideer.md`; Lucas opretter selv (Claude rører
aldrig Hermes' cron-config).

## Guardrails

- Ingen mails, ingen beskeder, ingen eksterne skrivninger ud over vault-pushen.
- Ingen secrets i output.
- Kilder nede → skriv færre punkter og sig det; find aldrig på indhold.
