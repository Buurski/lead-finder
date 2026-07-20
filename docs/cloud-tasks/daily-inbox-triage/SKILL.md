---
name: daily-inbox-triage
description: CLOUD VERSION — 2026-07-20. Daglig indbakke-triage kl 07:30 — scanner BEGGE konti (Lucas buur.aigro + Charlie 1charlie.nielsen via IMAP) og tagger hver mail med account.
---

CLOUD VERSION — 2026-07-20. Original lokal SKILL uændret i `C:\Users\Buur\Documents\Claude\Scheduled\daily-inbox-triage\SKILL.md` indtil Lucas godkender switch. **Status: GO, men kræver en logget-ind browser-session for selve Cowork-migrations-UI'et — se `docs/cloud-tasks/MIGRATION-GUIDE.md` for det uafklarede punkt.**

Du er Lucas' OG Charlies daglige INBOX-TRIAGE operatør. Du gør KUN indbakke-scan, ikke lead-gen eller messenger. Du scanner BEGGE konti og tagger hver mail med `account` ("lucas" | "charlie").

SECRETS (Cowork task-secrets, se `docs/cloud-tasks/SECRETS.md`) — ALDRIG i prompt/kode:
- `CHARLIE_GMAIL_USER`, `CHARLIE_GMAIL_APP_PASSWORD` (erstatter `.env.local`, som ikke findes i cloud)
- `GITHUB_TOKEN` (repo-scope, Buurski/KnowledgeOS, til at skrive `data/inbox.json`)
- Lucas' konto: samme Gmail-adgang som Cowork allerede bruger til de øvrige morgentasks (ingen ny secret hvis den findes).

ARKITEKTUR-SKIFTE:
1. **Ingen `Test-Path`/`New-Item`.** GitHub contents-API opretter mappen implicit ved første PUT til `data/inbox.json` — der er intet "mappe skal eksistere"-trin i en git-backed API. Spring skridt 1 fra lokal SKILL helt over.
2. **IMAP-scriptet kører stadig** (`scripts/scan_inbox_imap.mjs` — selve IMAP-kaldet mod Gmail er allerede cloud-venligt, ingen ændring i scriptets logik), MEN:
   - Creds kommer fra Cowork task-secrets (`CHARLIE_GMAIL_USER`/`CHARLIE_GMAIL_APP_PASSWORD` som env-vars i sandboxen), ALDRIG fra `.env.local` — den fil findes ikke i cloud og må ikke kopieres derhen.
   - **`IMAP_INSECURE_TLS`-workaround FJERNES.** Den findes i scriptet (`scripts/scan_inbox_imap.mjs:75-86`, `rejectUnauthorized: !insecureTls`) som en lokal fix for en antivirus-MITM-proxy på Lucas' Windows-maskine. Cowork-sandboxen har ingen sådan proxy — sæt IKKE `IMAP_INSECURE_TLS=1` i cloud-secrets. Kør scriptet med standard `rejectUnauthorized: true` (dvs. bare undlad env-varen). At sætte den i cloud ville være en unødvendig TLS-svaghed uden formål.
   - Scriptet printer stadig JSON: `{ ok, items:[{id,from,fromName,subject,date,snippet}] }`. `ok:false` med reason "no creds" → Charlie-secrets ikke sat op, skriv note og fortsæt med Lucas alene (samme fallback som lokal version).
3. **Git push → GitHub contents-API PUT.** Erstat `git add/commit/push` (lokal SKILL linje 38-42) med samme mønster som `writeVaultNote` i `src/lib/vault.ts:94-136`: GET nuværende `sha` for `data/inbox.json` (hvis filen findes), derefter PUT med `{ message, content: base64(JSON), branch: "master", sha? }` mod `https://api.github.com/repos/Buurski/KnowledgeOS/contents/data/inbox.json`. Ét API-kald erstatter add+commit+push.

GØR TRIN-FOR-TRIN:

1. Scan BEGGE indbakker — sidste 7 dage, max 40 mails pr. konto.
   a) LUCAS (buur.aigro@gmail.com): scan via Cowork's Gmail-værktøjer som hidtil.
   b) CHARLIE (1charlie.nielsen@gmail.com): kør IMAP-scriptet i Cowork-sandboxen med secrets injiceret som env-vars:
      ```
      CHARLIE_GMAIL_USER=<secret> CHARLIE_GMAIL_APP_PASSWORD=<secret> node scripts/scan_inbox_imap.mjs --account charlie --days 7 --max 40
      ```
      - `ok:false` reason "no creds" → Charlie-secrets ikke sat op endnu. Skriv kun Lucas' items + note "Charlie-indbakke: ikke konfigureret endnu (mangler app-kode)". IKKE en fejl.
      - `ok:false` anden reason → log den i note, fortsæt med Lucas alene.
   - For BEGGE konti: skip system-mails (GitHub, Vercel, build-notifications).
   - Klassificér hver: "interested" | "no-interest" | "question" | "internal" | "promo".
   - Importance score 0-100: high hvis kunde-mail kræver svar i dag.

2. For mails med needsReply=true: lav suggestedReply (kort, dansk, humble tone). Underskriv efter `account`: Lucas-mails "Mvh, Lucas", Charlie-mails "Mvh, Charlie".

3. Byg `data/inbox.json`-indholdet (samme skema som lokal version, uændret):
   ```
   { "generatedAt":"<ISO>", "generatedBy":"cowork-cloud-inbox", "accounts":["lucas","charlie"],
     "windowDays":7, "note":"Lucas: X scannet/Y svar · Charlie: X scannet/Y svar (eller 'ikke konfigureret')",
     "items":[ { "id":"<id>", "account":"lucas", "from":"...", "fromName":"...", "subject":"...",
       "snippet":"<ren tekst>", "date":"<ISO>", "category":"interested",
       "importance":88, "needsReply":true, "reason":"...",
       "gmailLink":"https://mail.google.com/mail/u/0/#inbox/<id>",
       "suggestedReply":"Hej ...\n\nMvh, Lucas" } ] }
   ```
   (Charlie-items har account:"charlie"; gmailLink kan udelades — UID'en er nok.)

4. SKRIV til vaulten via GitHub contents-API (se arkitektur-skifte punkt 3 ovenfor). Commit-besked: `"daily-inbox <dato> — <antal> items (Lucas+Charlie), <antal> kræver svar"`.

5. SEND Lucas: "Inbox done: Lucas X/Y svar · Charlie X/Y svar. Top: [subject 1, subject 2]." (Cowork-taskens egen svar-kanal, ikke en mail — uændret fra lokal version.)

Hold runtime under 10 min. Hvis en konto-scan fejler, medtag den andens items + rapportér den fejlede i note. Skriv aldrig en helt tom fil pga. én konto-fejl.

ÅBENT PUNKT (fra recon, uløst): ingen UI-screenshots af selve Cowork-migrations-flowet — browser ramte login-mur på `claude.ai/settings/scheduled-tasks`. Se `docs/cloud-tasks/MIGRATION-GUIDE.md` for manuel klik-guide og hvad der mangler en logget-ind session for at bekræfte.
