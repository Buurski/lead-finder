# Secrets til Bundle I cloud-migrering

Sæt disse i Cowork: **task-niveau Settings → Secrets** (per task, ikke global env) før du opretter/migrerer nogen af de 4 tasks. Aldrig i prompt, kode eller commits.

## Fælles for alle 4 tasks

| Secret | Værdi kommer fra | Bruges til |
|---|---|---|
| `GMAIL_USER` | eksisterende lokal `.env.local` i lead-system-repoet | afsender-adresse for `send_brief_mail.mjs` |
| `GMAIL_APP_PASSWORD` | Google-konto app-kode (2FA → App passwords) | SMTP-auth for `send_brief_mail.mjs` |

## daglig-brief, ugentlig-brief

| Secret | Værdi | Bruges til |
|---|---|---|
| `GITHUB_TOKEN` | GitHub Personal Access Token (fine-grained), scope: **kun** `Buurski/KnowledgeOS` repo, permission: Contents Read+Write | GitHub contents-API læs/skriv af daily/weekly-noter + data-JSONs |

Roter tokenet mindst hver 90. dag — sæt en kalender-reminder, ellers stopper skrivning stille (401, briefen fejler tavst uden nogen mærker det før en dag mangler i journal-view).

## daily-inbox-triage

| Secret | Værdi | Bruges til |
|---|---|---|
| `CHARLIE_GMAIL_USER` | 1charlie.nielsen@gmail.com | IMAP-login til Charlies indbakke |
| `CHARLIE_GMAIL_APP_PASSWORD` | Charlies Google-konto app-kode (kræver Charlie opretter en — 2FA → App passwords) | IMAP-auth, read-only scan |
| `GITHUB_TOKEN` | samme som ovenfor | skriv `data/inbox.json` |

**IKKE** sæt `IMAP_INSECURE_TLS` i cloud — den workaround er kun til Lucas' lokale antivirus-MITM-proxy og er en unødvendig TLS-svaghed i Cowork-sandboxen.

## lucas-os-brief

| Secret | Værdi | Bruges til |
|---|---|---|
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | som ovenfor | `--to lucas`-mail |
| Google Sheets service-account-JSON | samme creds som `scripts/skriv-agent-rows.mjs` bruger lokalt til lucas-os-sheetet | read-only `values.get` på Maal/Digest/Vaesentligt/Nudge/Outreach/Budget/Investering/NetWorth/Opsparingsmaal/Kunder/Livshjul/health-faner |
| Google Calendar-adgang | OAuth eller service-account med calendar.readonly scope | dagens aftaler |

**IKKE** sæt `GITHUB_TOKEN` for denne task — den skal ALDRIG skrive til noget repo (hård regel 2 i cloud-SKILL'en). At give den skrive-adgang til et repo ville modsige privatlivs-gaten.

## Verifikation efter opsætning

1. Kør hver task manuelt én gang i Cowork (ikke på skema) og se output-loggen for `[ukendt]`-felter der burde have data — det er signalet på en secret der mangler eller er forkert.
2. For `GITHUB_TOKEN`: tjek at PUT-kaldet til contents-API returnerer 200/201, ikke 401 (token afvist) eller 403 (rate-limit/forkert scope).
3. For Charlie-IMAP: bekræft at Charlie faktisk har oprettet en Google App Password (kræver 2FA aktiveret på hendes konto) — uden det svarer scriptet `ok:false, reason:"no creds"` og degraderer gracefully (ikke en fejl, men heller ikke reel Charlie-dækning).
4. For lucas-os-brief: bekræft mailen KUN går til buur.aigro@gmail.com (tjek "To:"-feltet manuelt første gang) — dette er en hård regel, ikke en detalje.
