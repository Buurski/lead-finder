# Codex gpt-6-sol — strategisk gap-review af feat/crm-hq-2026-09-22 vs main (24/9)

## 1. MERGE-PLAN

Brug `origin/main` som base for personligt login, Hermes-ejerskab og den asynkrone svar-indbakke. Indarbejd derefter branchens kunder, opgaver, kladder og SEO-historik. I `proxy.ts` skal login-undtagelserne fra main og kalender-undtagelsen fra branchen samles; behold main’s brugerafhængige avatar i `Sidebar.tsx` og tilføj `/kunder` i navigationen. I `RepliesClient.tsx` bør main’s “Scan nu”, trådvisning og håndtering vinde; branchens direkte afsendelse bør vente på rettelserne nedenfor. **Branchen må opgive magic-link som normalt login og den delte Basic-konto som daglig adgang.** Behold Basic kun som midlertidig nødvej, som den godkendte spec kræver (`origin/main:docs/superpowers/specs/2026-09-23-personligt-hq-design.md:5`).

Migrér additivt: fastslå først hvilke migrationer produktion faktisk har kørt (**UVERIFICERET**), tag backup, behold main’s `0006`/`0007`, omnummerér branchens tre SQL-filer til `0008`–`0010`, og opdatér journal/snapshots. Branchens journal stopper ved `0005`, selv om SQL-filerne findes (`drizzle/meta/_journal.json:40`, `drizzle/0006_task_priority.sql:1`). Test begge personlige logins og eksisterende data før deploy.

## 2. TOP-10 MANGLER

1. **Send svar** binder ikke requestens `toEmail` til det indlæste svar eller lead; en gyldig bruger kan sende til en vilkårlig adresse (`src/app/api/replies/[leadId]/send-reply/route.ts:53`). SMTP-kaldet sætter heller ikke trådreferencer (`:67`).
2. **Dobbelt-send**: svarrutens `get` efterfulgt af `put` er ingen atomisk reservation; to samtidige kald kan passere (`send-reply/route.ts:59`). Godkendelsesrutens kø-lås har samme mønster (`src/app/api/approve/send/route.ts:235`).
3. **Sendt, men ikke registreret**: hvis kø-opdateringen fejler efter SMTP, kan kladden stadig se sendbar ud (`src/app/api/approve/send/route.ts:465`). Kræv en varig sendestatus og afstemning.
4. **Svar markeret som færdigt uden CRM-bogføring**: mailen sendes først; fejl i `recordReplyOutcome` giver blot `recorded:false` (`send-reply/route.ts:79`). Vis en vedvarende opgave til manuel afstemning.
5. **“Scan nu” på denne branch** kalder en lokal IMAP-fallback (`src/app/replies/RepliesClient.tsx:294`); main starter VPS-jobbet (`origin/main:src/app/replies/RepliesClient.tsx:370`). Vælg ét dokumenteret flow og vis faktisk jobstatus.
6. **“Lav mail-kladde”** bruger en generisk `composeColdEmail` fra CRM-felter, ikke Hermes’ research eller et faktisk bygget gratis udkast (`src/lib/hq/company-draft.ts:36`). Mærk den tydeligt som kold standardkladde.
7. **Kalenderen** eksporterer kun åbne opgaver med dato, ikke private kalenderposter lovet i spec’en (`src/app/api/kalender/[user]/route.ts:16`; `origin/main:docs/superpowers/specs/2026-09-23-personligt-hq-design.md:10`).
8. **SEO-historik** måler PageSpeed og on-page forhold, men ikke søgeord eller GEO-resultater (`src/lib/hq/seo-history.ts:54`). Navngiv målingerne præcist i kundevisningen.
9. **Agentens opgavehandlinger** tager `actor` fra signerede request-data; HMAC beviser VPS’en, ikke hvilken person der bad Hermes handle (`origin/main:src/app/api/agent/tasks/route.ts:29`).
10. **Kundeoverblik** lover “Intet der haster”, når `attention` er tom (`src/app/kunder/page.tsx:47`). Skeln mellem ingen fund og manglende/friskhed af data.

## 3. FJERN

Fjern `/profil` som særskilt side efter at kalenderlinket er flyttet til `/settings` og opgaverne til `/opgaver` (`src/app/profil/page.tsx:14`, `src/lib/nav-config.ts:31`). Skjul `/drift` som selvstændigt navigationspunkt, når den allerede er fane under `/agenter` (`src/lib/nav-config.ts:37`, `:94`). Udfas `/api/cron/kv-crm-bridge` **først efter** verificeret Postgres-cutover; ellers risikeres tab af synk (`vercel.json:41`).

## 4. RISICI

Main undtager hele `/api/agent/` fra proxyen: alle nuværende og fremtidige ruter skal derfor selv verificere HMAC (`origin/main:src/proxy.ts:39`). HMAC har fem minutters replay-vindue (`src/lib/hermes-hmac.ts:7`). ICS-linket er et statisk bearer-token afledt af sessionshemmeligheden; et lækket link kan ikke tilbagekaldes særskilt (`src/lib/hq/calendar.ts:11`, `src/app/profil/page.tsx:19`). Branchens `/api/approve/regenerate` indeholder stadig hardcoded Basic-legitimationsoplysninger; main fjerner dem (`src/app/api/approve/regenerate/route.ts:40`). Rotér dem, hvis de nogensinde har været brugt. Jeg fandt ingen direkte Composio-kald i repoets produktionskode; SEO-siden beskriver dog VPS-snapshots via Composio (`src/lib/hermes-client.ts:103`). **VPS-koden og faktisk produktionsbrug er UVERIFICERET.**

## 5. UD-AF-BOKSEN

Indfør en daglig **“lovet kunden”**-liste med ansvarlig og dato, en ugentlig **afstemning af Sendt-mappe mod CRM/kø**, og et enkelt **kundekort over adgang, domænefornyelse og backup-ansvar**. De tre ting beskytter leverancer og relationer mere direkte end flere dashboards (`src/lib/db/schema.ts:171`, `src/lib/db/schema.ts:189`).
