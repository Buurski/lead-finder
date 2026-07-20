# Bundle I v3 — cloud-migrering, DONE

Status: cloud-SKILL'er skrevet, council-reviewet, INGEN task oprettet i Cowork endnu (kræver Lucas' login + klik-gennemgang). Autonom kørsel, Sonnet 5 orkestrator (Fable 5-quota opbrugt).

## Leveret

- `docs/cloud-tasks/daglig-brief/SKILL.md`
- `docs/cloud-tasks/ugentlig-brief/SKILL.md`
- `docs/cloud-tasks/lucas-os-brief/SKILL.md`
- `docs/cloud-tasks/daily-inbox-triage/SKILL.md`
- `docs/cloud-tasks/SECRETS.md`
- `docs/cloud-tasks/MIGRATION-GUIDE.md`

Alle 4 originale lokale SKILL.md-filer i `C:\Users\Buur\Documents\Claude\Scheduled\<task>\` er UÆNDREDE — cloud-versionerne er separate filer, intet er overskrevet.

## Metode

- Læste Bundle I v2-reconet (`docs/bundles/bundle-i-cloud-migration.md`) + alle 4 originale SKILL.md + `src/lib/vault.ts` (backbone-mønster for GitHub contents-API).
- Erstattede lokale filstier/PowerShell/`git CLI` med GitHub contents-API (læs/skriv/commit i ét PUT) + commits-API (erstatning for `git log`).
- Bevarede alle hårde regler verbatim: send-mail-allowlist, lucas-os-briefs 3 hårde regler (kun Lucas / aldrig i git / ingen handler), Salon Artec/Allan-eksklusioner.
- Fjernede `IMAP_INSECURE_TLS`-workaround fra cloud-versionen (unødvendig TLS-svaghed, kun relevant for Lucas' lokale antivirus-proxy).
- Forsøgte browser-login til `claude.ai/settings/scheduled-tasks` — ramte login-mur, ingen credentials indtastet (mod reglerne), ingen migrations-UI set. MIGRATION-GUIDE.md er derfor en manuel klik-guide, ikke verificeret skærmbillede-for-skærmbillede.
- 3-lens council (Haiku 4.5, parallelt): forbedringer / risici / hold-fast. Alle 3 svarede.

## Council-fund og hvad der blev rettet

**Rettet i denne session:**
- lucas-os-brief kilde D (byg-status): modsigelse løst — tasken har bevidst intet GITHUB_TOKEN, så byg-status er nu altid "[ukendt]" i cloud, ikke et forsøg på at læse alligevel.
- daglig-brief privacy-filter: tilføjet advarsel om at filtrere på EMNE, ikke kun nøgleord (en Lucas OS-commit kan omtales uden ordet "lucas-os").
- lucas-os-brief: tilføjet ærlig restrisiko-note om Coworks egen log-retention (kan ikke garanteres af denne SKILL alene).
- MIGRATION-GUIDE: tilføjet eksplicit pre-aktiverings-tjekliste for lucas-os-brief (ingen GITHUB_TOKEN, repo-privathed, log-retention).

**Ikke rettet — mindre polish, Lucas kan tage stilling senere (lens A):**
- Manglende fejl-håndtering hvis send_brief_mail.mjs selv fejler (script mangler/SMTP-timeout) — ingen fallback-mail i daglig/ugentlig-brief (kun lucas-os-brief har det, arvet fra original).
- Ingen kilde-vægtning hvis mange datakilder er stale samtidig.
- Ingen automatiseret GITHUB_TOKEN-rotation (kun dokumenteret 90-dages påmindelse).
- JSON-skema-versionering for inbox.json ikke tilføjet.

**Rest-risici Lucas bør kende (lens B, ikke alle løst):**
- Allowlist-håndhævelse i `send_brief_mail.mjs` er antaget, ikke bevist i denne session (koden blev ikke re-audited linje for linje her — kun refereret).
- Charlie-IMAP-fallback degraderer stille hvis hun ikke har sat app-kode op — ikke en "loud failure", kun en note i output.
- Secrets-maskering i fejl-logs ikke eksplicit adresseret i nogen SKILL.

## Ingen migrering udført

Ingen Cowork-task er oprettet eller ændret. `claude.ai/settings/scheduled-tasks` kræver login — jf. reglerne blev ingen credentials indtastet af agenten. Lucas skal selv:

1. Sætte secrets (`docs/cloud-tasks/SECRETS.md`) — inkl. bede Charlie oprette en Google App Password.
2. Følge `docs/cloud-tasks/MIGRATION-GUIDE.md` trin for trin, i rækkefølgen: daglig-brief + ugentlig-brief → daily-inbox-triage → lucas-os-brief (sidst, ekstra tjekliste).
3. Køre hver ny cloud-task manuelt én gang før skema aktiveres, og lade den lokale task køre parallelt 2-3 dage før den slukkes.
4. For lucas-os-brief specifikt: bekræfte at ingen GITHUB_TOKEN gives til tasken, og overveje Coworks log-retention før han stoler 100% på "intet gemmes".

## Blockers / åbne punkter

- Google Calendar-adgang fra Cowork ikke verificeret.
- Ukendt om lucas-os-repoet findes på GitHub — hvis ikke, mangler "Lucas OS — siden i går" i den private brief permanent i cloud (med vilje, ikke en fejl).
- Ingen faktisk Cowork secrets-UI set — antagelsen om task-niveau secrets i SECRETS.md er ikke bekræftet mod den reelle UI.

Branch: `feat/bundle-i-cloud-migration-2026-07-20`. Pushet til origin. INGEN merge til main.
