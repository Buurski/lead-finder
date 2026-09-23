# Personligt Kinly HQ — godkendt design

Godkendt af Lucas 23-09-2026 i samtalen. Eksisterende virksomheder, aftaler, opgaver, fakturaer og historik er fælles og må ikke slettes eller omskrives. Lucas og Charlie er tekniske ligemænd.

## Login
To konti: `lucas@kinly.dk` og `charlie@kinly.dk`. Hver vælger egen adgangskode ved første login; efterfølgende bruges mail + kode. Ingen automatisk mail eller besked sendes af appen/agenten i dette flow. Førstegangsbevis er et unikt, tidsbegrænset engangskodeord, genereret offline af en admin-kommando, kun hash gemmes i databasen, og de rå setup-koder skrives til en lokal chmod 600-fil på VPS'en. Lucas henter dem selv og deler Charlies manuelt. Brug eksisterende `app_user` uden at opdatere eksisterende poster; additive migrationer, aldrig drop/truncate. Brug scrypt med salt og konstanttids-sammenligning. Legacy Basic-login beholdes kun som nødvej under cutover og fjernes ikke, før begge personlige konti er testet. UI må ikke længere indeholde Basic-adgangskode.

## Privat / fælles
Kun Lucas/Charlie selv kan se egne Hermes-samtaler, private noter, private council-udkast og private kalenderposter. Serversiden afleder identitet af verificeret session, aldrig request-body, query-string eller en cookie fra JS. Fælles CRM forbliver fælles: `owner` på en opgave er ansvar, ikke en læserettighed. Gamle Hermes-sessioner beholdes uden destruktiv migrering; delte/ukendte historikker vises ikke som private. Egen sessionStorage i browseren pr. indlogget bruger; logout rydder client-cache.

## Hermes inde i HQ
Docken skal være samme Hermes Agent på VPS, med separate profiler eller eksplicit anden reelt isoleret hukommelse pr. person. Profilen må aldrig arves direkte fra en anden persons private hukommelse. Hermes må undersøge CRM og udefra, oprette/opdatere/afslutte HQ-opgaver og ændre kalenderposter i en privat HQ-kalender. Ændringer af selve kalenderen må ikke invitere/give gæster notifikationer. Ingen email, SMS, chat, invitationer eller andre udgående beskeder; kun kladder. Hver mutation har server-side allowlist, aktør-audit og læse-efter-skriv verifikation. Før synk med Google Calendar kræves en verificeret separat forbindelse for hver persons konto; ingen brug af Lucas' Composio-tilslutning til Charlie.

## Rækkefølge og rollback
1. Lokal auth og privat adgang med tests; ingen produktionsdata ændres.
2. Opsæt isolerede Hermes-profiler og smalle HQ-værktøjer; bevis fejl-/succesveje uden rigtige kundedata.
3. Test fuld suite, lint, typecheck og build grønt før main-push. Én samlet deploy.
4. Additiv DB-migration og setup-koder først når deployment er klar; verificér begge brugere uden at sende noget. Fejl: behold legacy Basic som nødvej og rollback via tidligere deployment, ikke ved datatab.

## Risici
Den nuværende magic-link-rute udsender mails; den må ikke bruges til opsætningen. Dens gamle tokenlag er ikke atomisk. Den nuværende VPS-bro genkender `lucas`/`charlie`, men deres profiler findes ikke; public health måler kun default. Aktuel Hermes-historik kan læses på tværs via query-parametre; luk det inden private noter tages i brug. Kalender-integration med eksterne konti er ikke sikker, før ejerskab og `sendUpdates=none` er verificeret.
