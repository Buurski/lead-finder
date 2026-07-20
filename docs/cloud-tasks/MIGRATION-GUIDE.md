# Migration-guide: 4 tasks til Cowork Scheduled tasks

Forsøgt: browser til `claude.ai/settings/scheduled-tasks` 2026-07-20 — ramte login-mur (ingen aktiv session). Ingen credentials indtastet (mod reglerne). Ingen screenshots af selve flowet muligt uden Lucas logger ind selv. Nedenstående er derfor en manuel klik-guide baseret på Cowork's kendte UI-mønster, ikke en verificeret skærmbillede-for-skærmbillede — bekræft selv trin 2-5 mod den faktiske UI, den kan afvige.

## Forudsætning FØR du opretter nogen task

Sæt alle secrets fra `docs/cloud-tasks/SECRETS.md` FØRST. En task oprettet uden secrets fejler stille ved første kørsel (401'ere, "no creds") — nemmere at opsætte rigtigt fra start end at fejlsøge bagefter.

## Trin pr. task (gentages for alle 4)

1. Log ind på claude.ai i din browser.
2. Gå til Settings → Scheduled tasks (eller Cowork-fanen hvis tasks er organiseret der).
3. Find den eksisterende lokale task ved navn (`daglig-brief`, `ugentlig-brief`, `lucas-os-brief`, `daily-inbox-triage`).
4. Se efter en "cloud"/"migrate"-toggle eller en "Duplicate as cloud task"-knap på task-raden eller detaljesiden. Hvis ingen sådan findes: opret en NY task fra bunden (ikke rediger den lokale) og peg dens prompt/SKILL på filen i `docs/cloud-tasks/<task>/SKILL.md` i dette repo — kopiér SKILL-indholdet ind, eller referér filstien hvis Cowork understøtter det.
5. Under task-oprettelse: tilføj secrets (Settings → Secrets for tasken, se `SECRETS.md`) FØR første kørsel.
6. Sæt samme skema som den lokale task (07:45 / 08:00 / 08:15 / 07:30) — bekræft tidszone matcher (dansk tid, cloud-runtime kan være UTC default).
7. Kør tasken MANUELT én gang (ikke vent på skema) og læs output-loggen igennem for "[ukendt]"-felter der burde have data, og for fejl fra manglende secrets.
8. Først når en manuel kørsel er ren: aktivér skemaet.
9. **Behold den lokale task kørende parallelt i mindst 2-3 dage** og sammenlign output (samme dag, cloud vs. lokal) før du deaktiverer den lokale — ingen "big bang"-cutover.

## Rækkefølge (anbefalet)

1. `daglig-brief` og `ugentlig-brief` først — laveste risiko, ingen ny secret-type (kun `GITHUB_TOKEN` + eksisterende Gmail).
2. `daily-inbox-triage` — kræver Charlie faktisk opretter en Google App Password først (afhænger af hende, ikke kun Lucas).
3. `lucas-os-brief` — sidst, fordi output-destinationen (mail-only, ingen fil) er en reel arkitekturændring fra den lokale version, ikke bare et løft-og-flyt. FØR aktivering:
   - Test grundigt at "To:"-feltet KUN er buur.aigro@gmail.com.
   - Bekræft at tasken IKKE har fået `GITHUB_TOKEN` i sine secrets (se `SECRETS.md`) — denne task skal aldrig kunne skrive eller læse via GitHub-API'et.
   - Findes lucas-os-repoet på GitHub: bekræft det er PRIVAT (kun Lucas), før du overvejer at give NOGEN task adgang til det.
   - Overvej Coworks egen log-retention på task-outputs (se restrisiko-note i `lucas-os-brief/SKILL.md`) — hvis Lucas vil have garanti for at intet gemmes, kræver det svar fra Cowork/Anthropic selv, ikke noget denne SKILL kan love.

## Hvad der stadig mangler recon (ærligt, ikke gættet)

- Har Cowork-tasks adgang til Google Calendar uden ekstra OAuth-opsætning per task? Ukendt — afklar ved første manuelle kørsel af `daglig-brief`-cloud.
- Findes lucas-os-repoet på GitHub (ikke kun lokalt)? Hvis ikke, giver kilde D i `lucas-os-brief`-cloud-SKILL'en konsekvent "[ukendt]" — ikke en fejl i migreringen, men en reel datamangel der kræver Lucas' beslutning om at pushe det repo til GitHub, hvis han vil have byg-status i den private brief.
- Cowork-tasks' faktiske secrets-UI (navn, scope: task vs. global) er ikke set — `SECRETS.md` antager task-niveau secrets findes; bekræft ved trin 5 ovenfor.
