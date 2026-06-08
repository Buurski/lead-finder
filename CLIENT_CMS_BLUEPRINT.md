# CLIENT_CMS_BLUEPRINT.md — "Claude CMS" til kundesites

> Kilde: Jack Roberts — *"Claude Code just Changed Website Design Forever"*
> (YouTube Q_K3k_ge8NA), dybde-interview via NotebookLM, 2026-06-07.
> Status: **research/blueprint — intet er bygget endnu.**

## Konceptet (det vi vil genskabe)

Et CMS-lag oven på de kodede kundesites, så kunden selv kan rette indhold
uden at kunne ødelægge koden. To interfaces:

1. **Client Editor** — kunden får et link + unik adgangskode (fx `hello6`).
   Visuel editor: ret tekst, skift billeder, tilføj sider, SEO-panel, AI-chat.
2. **Master Command** — ÉT dashboard til os, der styrer ALLE kundesites:
   status, "View Live Site" / "Open Editor" pr. site, versionshistorik,
   rollback, API-nøgler, valg af AI-model. Skal kunne skalere 1 → mange kunder.

## Arkitektur (som i videoen)

```
Kundesite (Next.js, GitHub repo, Vercel)
   │  "boot logic": ved opstart bekræftes MongoDB-forbindelse
   │  og indholdet HYDRERES fra databasen ind i sitet (runtime)
   ▼
MongoDB Atlas  ←  single source of truth
   • brugerkonti  • sideindhold (JSON-dokumenter)  • versionshistorik
   ▲
Client Editor + Master Command (egen app, egen Vercel URL eller localhost)
   • skriver direkte til MongoDB — INGEN redeploy ved indholdsændringer
   • "Publish" = snapshot i MongoDB → rollback altid muligt
```

**Nøglepointer:**
- Skarp adskillelse: kode bor i GitHub; redigerbart indhold bor i MongoDB.
- Ændringer går live "instantaneously" ved Publish (DB-write, ikke rebuild).
- Robusthed bevist i videoen: slet den lokale kopi → boot logic gendanner
  alt fra MongoDB.
- CMS'et kobler nye sites på **eksternt**: man giver det Vercel-URL +
  GitHub-repo-link. Men hvert site skal indeholde boot/hydration-logikken,
  så det er ikke 100 % kodefrit pr. site.

## Stack i videoen

| Rolle | Værktøj |
|---|---|
| Kodegenerering | Claude Code |
| Kode-lager | Privat GitHub repo pr. site |
| Hosting | Vercel (gratis-plan; token fra `vercel.com/account/settings/tokens`, scope "All Projects") |
| Indhold + versioner | MongoDB Atlas (gratis cluster, connection via "Drivers", Network Access `0.0.0.0/0` eller kunde-IP) |
| AI i editoren | OpenRouter (~$10 credits at starte; model kan vælges i Master Command) |
| Billedgenerering | "Key API" (sandsynligvis KIE API) — billig generering direkte ind i designet |
| Design-kvalitet | Custom skill "design blueprint extractor" + Firecrawl: screenshot/scrape af kvalitetssites → blueprint Claude bygger efter (mod "Claude slop") |

## Client Editor — funktioner

- **Tekst:** klik direkte på en sektion/tekstbid → markeres → chat-panel
  åbner i højre side → kunden skriver naturligt sprog ("skift prisen fra
  $0 til $6") → ændring sker øjeblikkeligt i editoren.
- **Billeder:** skift direkte i UI; AI-generering via Key API ind i designet.
  Indhold (inkl. billedreferencer) gemmes som JSON i MongoDB.
- **Nye sider:** venstre panel → vælg skabelon ("Article page", "Blank page")
  eller tilføj sektioner til eksisterende sider.
- **SEO-panel:** kunden indtaster key phrase (fx "AI growth") → score
  (fx 45/60) beregnet på stedet; baseret på metadata/meta-beskrivelser, som
  kan rettes og gemmes direkte → opdateres live.
- **Publish-flow:** intet går live før "Publish"; hvert Publish = snapshot.

## Guardian-systemet (sikkerhedslaget)

- AI'en i editoren ændrer som udgangspunkt **kun copy og billeder — aldrig
  kode**.
- Hver ændring valideres af en "guardian"/safegate: ok → igennem; truer
  sidens struktur → kasseres.
- Kan slås fra (fuld kodeadgang til kunden) — frarådes.

## Setup-flow fra videoen (trin + ordrette prompts)

1. **Byg sitet:** screenshot af inspirationsdesign (Dribbble e.l.) →
   *"…I want you to do the design blueprint extractor skill based on this
   website as inspiration"*.
2. **Deploy:** *"I would like you to create a private GitHub repo and then
   I want you to go ahead and basically post this onto Vercel creating a
   website"* (browser-login når Claude beder om det; domæne kan købes i Vercel).
3. **Init CMS:** upload "Claude CMS"-boilerplate-filen (template/blueprint
   som Claude læser — ikke et færdigt repo) → *"Hey go ahead read this and
   open up the CMS please"*. Indsæt Vercel-token + OpenRouter-nøgle i
   dashboardet.
4. **Tilkobl site:** *"Go ahead and add this website you'll see the URL to
   the website from Vercel and you also have access to GitHub repo"*.
5. **Database:** MongoDB Atlas gratis cluster (fx `websiteCMS`) → Drivers →
   del connection string → *"Connect MongoDB to cover all the databases and
   version control"* → IP-whitelist.
6. **Publicer CMS:** *"publish this CMS on its own Vercel URL"* → del
   editor-link + kode med kunden.

## Mapping til VORES setup (forslag — ikke besluttet)

- **AI-gateway:** vi har allerede `src/lib/ai.ts` (Vercel AI Gateway →
  Anthropic direct → deterministic). Brug den i stedet for OpenRouter —
  samme rolle, én gateway mindre. Husk: Max-abonnement ≠ API-nøgle;
  editor-AI kræver API-credits (køb først ved deploy).
- **Framework:** vores sites er Next.js 16 / React 19 — hydration-mønstret
  (indhold fra DB ved runtime) passer naturligt (server components der
  læser fra DB, evt. ISR).
- **Database:** videoen bruger MongoDB Atlas. Overvej alternativ der matcher
  os (fx Vercel KV/Postgres) — men dokument-JSON-formen er en god pasform
  til side-/sektionsindhold og snapshots. Beslutning udestår.
- **Guardian + tone:** vores guardian-regler bør også håndhæve dansk tone
  og brand (jf. KnowledgeOS [[brand-og-tone]]) når kundens AI omskriver copy.
- **Master Command ↔ Agentech OS:** Master-dashboardet er i praksis et
  modul i kommandocentret (COMMAND_CENTER_VISION) — kundeliste, status,
  rollback. Skal designes i vores "room-like" stil, ikke videoens generiske.
- **Demo-vinkel:** "I ejer 100 % af koden + I kan selv rette indhold" er et
  stærkt salgsargument oven på det eksisterende pitch.

## Åbne spørgsmål (videoen svarer ikke)

- Præcis MongoDB-skema (collections/feltnavne) vises ikke — kun "users,
  pages/content, version history" som JSON-dokumenter.
- Hvordan boot/hydration-logikken konkret er implementeret i sitet
  (filnavne/ruter nævnes ikke).
- SEO-scorens præcise faktorer ud over metadata/meta-beskrivelser.
- Boilerplate-filen er fra Jacks betalte community — vi skal selv skrive
  vores egen spec (denne fil er starten).
- Auth er kun "password pr. site" — overvej noget stærkere (magic link?).

## Næste skridt (når Lucas siger go)

1. Beslut DB (Mongo Atlas vs. Vercel-native) og auth-model.
2. Skriv vores egen "CMS-spec" (vores boilerplate) ud fra denne blueprint.
3. Byg en prototype mod ÉT demo-site på en feature branch — aldrig main.
