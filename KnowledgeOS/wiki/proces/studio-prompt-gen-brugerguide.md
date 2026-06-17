---
title: Studio prompt-gen — brugerguide
date: 2026-06-16
type: proces
---

# Studio `/studio/prompt-gen` — sådan bruger du den

Genererer en komplet Claude Code **build-prompt** for en kunde-demo og dispatcher
den til en gratis build-session. **Orchestration billig (API), build gratis
(subscription).** Hver demo bliver UNIK — drevet af kundens egen recon, ikke en
fast template.

## Flowet i 1 sætning
agenticos skraber kundens offentlige sider → bygger en prompt (kunde-recon +
branche-template + perf/a11y-kit + sikkerheds-scope) → en Claude Code-session
kører prompten og bygger demoen → privat Vercel-preview.

## Sådan gør du
1. Gå til **`/studio` → "Prompt-gen →"** (eller direkte `/studio/prompt-gen`).
2. Udfyld:
   - **Kunde-navn** (påkrævet) — fx "Guðrun's Goodies".
   - **Branche** — vælg den nærmeste (café→restaurant-template, barber→frisør, negle→hudpleje osv.).
   - **Hjemmeside/FB** (valgfrit) — fx `kunde.dk` eller `facebook.com/kunde`.
   - **Google/maps-URL** (valgfrit) — ekstra recon-kilde.
   - **IG/FB-noter** — indsæt manuelt det du selv så (farver, stil, fakta). Bruges som ekstra brand-signal.
3. **"Hent recon"** → ser kundens titel, tone, brand-farver, billeder. Tjek at det ser rigtigt ud.
4. **"DISPATCH BUILD"** (rød) → bygger + gemmer prompten, viser den + "Kopiér prompt".
5. Kør prompten i en **Claude Code-session** (gratis på din subscription). Den bygger demoen.

## Hvad gør hver knap
- **Hent recon** → kun læsning. Skraber + cacher 24t. Ændrer intet.
- **DISPATCH BUILD** → bygger prompten fra (cached) recon + template, gemmer den under
  `dispatch/<slug>` og viser den. Det er IKKE auto-send — du kører selv build-sessionen.

## Hvor finder du demoen bagefter
- Build-sessionen lægger den i **`demo-sites/<slug>/index.html`**.
- Preview deployes til Vercel (privat projekt under buurskis-projects), fx
  `https://<slug>.vercel.app`. Deployment-protection slås fra så du kan åbne uden login.

## Re-run en kunde
- Kør "Hent recon" igen (cachen er 24t — efter det hentes friskt). Eller skift
  hjemmeside/IG-noter og dispatch igen. Samme `slug` → samme demo-mappe (overskrives).

## Hvad gør du ved fejl
- **"Recon kom tom tilbage"** → siden er JS-tung/blokeret. Prøv FB-URL'en, eller udfyld
  IG/FB-noter manuelt, eller vælg branche så template alene driver designet.
- **"ukendt branche/template"** → vælg en af de 7 kendte brancher i dropdownen.
- **Demo ser generisk ud** → recon fandt for lidt. Giv en side med mere indhold eller
  flere IG-noter. Recon SKAL drive designet (ingen placeholder).
- **Forkerte farver** → kunden brugte WordPress-default-farver; recon filtrerer de
  kendte (#f78da7 osv.) fra, men tjek "Farver" i recon-preview før dispatch.

## Sikkerhed (indbygget — rør ikke)
- Skrabet HTML er **fenced som UNTRUSTED DATA** i prompten — kan ikke injicere kommandoer.
- Build-sessionen er **scoped til `demo-sites/<slug>/`**, må ikke læse `.env` eller deploye prod.
- `dispatch-build`-routen er auth-gated (Bearer-secret); recon-full er kun læsning.

## Bevist (2026-06-16, 6 E2E-demoer)
Guðrun's Goodies · Café Wilder · Pipers Hus · O's Barbershop · The Nail Studio ·
Frisør Alex. Alle mobil-Lighthouse **perf 90-95, a11y 95-100, SEO 100**. Hver med
kundens egne farver/billeder. Council-log: [[studio-prompt-gen-council-2026-06-16]].
