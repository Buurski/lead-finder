# Dit Agentic OS — ærlig analyse, plan & start

> Bygget efter et grundigt, kritisk forløb: dine 12 NotebookLM-kilder (inkl. deres
> ærlige kritik), Google/YouTube-research, og en gennemgang af DINE egne filer,
> Gmail (buur.aigro, seneste ~3 mdr), tidligere Cowork-sessioner og projekter.
> Jeg har **ikke** bygget vaulten — du skal forstå den først og så beslutte.
> Diagrammet i chatten viser strukturen; her er kødet.

---

## 1. Sådan virker det (helt enkelt)

Glem "operativsystem" et øjeblik. Det er bare **tre ting der taler sammen**:

1. **Obsidian-vaulten = hjernen.** En mappe fuld af tekstfiler (markdown) på din
   computer. Det er bare noter — men organiseret, så en AI kan læse og skrive i dem.
   Det er HER din viden bor permanent.
2. **Claude (her i Cowork) = cockpittet.** Det er mig. Jeg læser vaulten før jeg
   svarer, og skriver ny viden tilbage. Fordi alt ligger i hjernen, starter jeg
   ikke forfra hver gang — jeg *husker* din forretning, dine kunder, dine priser.
3. **GitHub = sync.** Gør vaulten til noget du og din ven deler, med backup og
   historik. (Kommer når din ven skal med — ikke dag 1.)

Det eneste der gør det "agentic" er, at hjernen er skrevet i et format en agent
kan bruge — plus en regelfil (`claude.md`) der fortæller mig hvordan jeg må
arbejde i den. Det er det. Resten (Hermes, personas, dreaming) er **påbygninger**,
ikke fundamentet.

**Den vigtigste sætning i hele dette dokument**, og det dine kilder selv siger er
det ENESTE der reelt rykker noget på lang sigt:

> Det der giver størst værdi er ét veltrukket hukommelseslag (`claude.md` + en
> simpel vault). Det giver en "renters rente"-effekt: AI'en bliver klogere for
> hver interaktion i stedet for at starte fra nul. Alt andet er sekundært.

---

## 2. Den ærlige reality-check (tilpasset DIG)

Du bad om kritik, ikke hype. Her er den — fra kilderne *og* fra din egen situation
(solo, begrænset tid, stramt budget, Claude Max uden API-nøgle, én ven på vej).

### Hvad det her IKKE kan / hvad der er overhyped
- **Det er ikke magi, og ikke en automat.** Kilderne er skarpe her: systemet bliver
  kun godt hvis du *passer* det — retter, giver feedback, rydder op. Ellers bliver
  vaulten et rodet pakhus af ligegyldig data. Forvent at bruge tid på indholdet.
- **Skaleringsmuren.** Det kører fint ved ~100 noter. Ved tusindvis af filer
  begynder det at "æde dig levende", fordi det koster tokens bare at læse indekset.
  Markdown alene erstatter ikke en rigtig database ved store arkiver.
- **"73 %-overhead".** En stor del af hver forespørgsel kan gå til faste
  system-prompts og regler, FØR der overhovedet svares. Jo mere du proppper ind,
  jo dyrere og langsommere bliver alt.
- **Token-eksplosion er reel.** Én dårlig instruktion kan brænde millioner af
  tokens på timer. Det er en konkret risiko, ikke teoretisk.

### Det vigtigste forbehold for DIG specifikt
Dit lead-system **er allerede et halvt agentic OS**: scheduled tasks, daglige
digests, draft-motor, godkendelses-kø, og en hård regel om at det aldrig selv
sender. Du skal altså **ikke bygge endnu en motor** — du skal give den motor en
**hukommelse** (vaulten) den deler med resten af dit arbejde (klient-websites,
playbook, idéer). Det er en langt mindre opgave end videoerne får det til at lyde.

Og: **Claude Max giver dig ikke en API-nøgle.** Det betyder at de fede,
altid-kørende dele (især Hermes på en VPS, der kalder modeller via OpenRouter/
Codex/Ollama) koster rigtige penge og kræver løbende drift. For dig lige nu er det
**for tidligt** — det er den dyreste, mest skrøbelige del, og den løser ikke dit
egentlige problem (at huske og finde/lukke kunder).

### Hvad der ER besværet værd for en solo-freelancer (byg dette)
- **Persistent hukommelse** — slip for at forklare din forretning forfra hver gang. Direkte tidsbesparelse hver dag.
- **Enkle skills/opskrifter** — automatisér de 30 % repetitive ting (fx outreach-tekst i din tone, ugentlig planlægning). Reel ROI.
- **"Hjerne-dump"** — få idéer og løse tråde ud af hovedet og ind et sted der minder dig. Fjerner stress.

### Hvad du skal DROPPE (overkill eller for skrøbeligt)
- **Kompleks RAG / Pinecone / vektor-databaser** — "en atombombe til at dræbe en flue" for en solo-bruger. Drop det.
- **Browser-automatisering via agenter** — ekstremt skrøbeligt (fejler på cookies/UI-skift). Drop det.
- **Hermes (mobil) lige nu** — koster + skal driftes; vent til fundamentet kører.
- **Personas/Pantheon + dreaming** — fede legetøj, men sidst. Ikke nu.
- **Over-organisering** — byg IKKE 50 mapper på dag 1. Hold det fladt.

### De 5 mest kritiske regler (fra kilderne — lær dem udenad)
1. **Indhold > grafen.** Brug tid på hvad noterne *siger*, ikke på hvor pænt graf-billedet i Obsidian ser ud ("node porn").
2. **`hot.md`** — en lille fil med de vigtigste ~500 tegn kontekst, så du sparer tokens.
3. **Hænderne væk fra "send".** Agenter må aldrig sende mails eller slette ting uden dit ja — kun lave kladder. (Dit lead-system gør allerede præcis dette — behold det.)
4. **Auditér ugentligt** ("lint" hver fredag) — fjern modstridende/forældede noter. Stale memory er #1 årsag til at AI'en opfører sig mærkeligt.
5. **Vær mentor, ikke automat** — spørg "hvorfor valgte du det?" og ret systemet til.

---

## 3. Hvad VI gør — skræddersyet til dig

| Fase | Hvad | Hvorfor | Hvornår |
|------|------|---------|---------|
| **0 — Hjernen** | Obsidian-vault + `claude.md` + `context/` (dig, forretning, priser, kunder) | Det ENESTE der rykker på lang sigt; billigt, lav vedligehold | **Nu** |
| **1 — Kobl til motoren** | Lad vaulten være hukommelse for lead-systemet (klient- og lead-noter) | Du har allerede motoren — den mangler bare hukommelse | Næste |
| **2 — Din ven** | GitHub + Obsidian Git-plugin → delt vault | Backup, versionering, samarbejde | Når han skal med |
| **3 — Enkle skills** | 1-2 opskrifter (fx outreach-tekst, ugentlig brief) | Automatisér de repetitive 30 % | Når Fase 0-1 kører |
| **Senere** | Hermes (mobil), personas, dreaming | Fedt, men dyrt/skrøbeligt — kun når fundamentet står | Bevidst udskudt |

Princippet: **lille, billigt, robust fundament først.** Vi lader systemet vokse
naturligt i stedet for at bygge stort og skrøbeligt.

---

## 4. Indholds-plan — hvad der skal INDE i vaulten

Det her er alt det vi har fundet, organiseret efter hvor det hører hjemme. Det er
"opskriften" — du godkender, så kan jeg bygge det (Fase 0).

### `context/` — fakta AI'en altid skal kende
- **about_me.md** — dig: solo web-freelancer, Ikast, 20 år, salgselev til hverdag, koder hjemmesider ved siden af. Arbejdsstil: kort/direkte, rolige systemer. Bygger OS med én ven.
- **about_business.md** — forretningen: finder lokale leads → bygger websites → drift/social. Kører som privatperson (ingen CVR/moms) indtil ~50.000 kr/år.
- **priser.md** ⭐ (du bad særligt om denne) — din faktiske pris-historik + fremtidig strategi:
  - **Playbook-pakker (første-kunde):** Basis 4.500 + 500/md · CMS-menu 6.000 + 500/md · Fuld 7.500 + 1.500/md.
  - **Add-ons:** CMS +1.500 · sæson +1.500 · social 1.000–1.800/md · ekstra underside 500.
  - **Faktisk tilbud (Allan/Den Lille Maler):** 5.000 kr (alle undersider) ELLER 6.500 kr m. selv-redigering (Decap CMS). Hosting 250/md (kun) eller 500/md (m. support).
  - **Strategi fremad:** +20–30 % pr. ny kunde efterhånden som du bliver sikker. Allan var bevidst billig (læring + portfolio).
  - **Dit pris-argument:** "Jeg er ikke et bureau — det er bare mig, til en fair pris; du ejer 100 % af koden, ingen lock-in."
- **brand-og-tone.md** — din stemme: afslappet, personlig, "ydmyg salgselev/hobby", aldrig corporate. Bruges til al outreach og kundekommunikation.

### `wiki/kunder/` — én note pr. kunde/projekt (status, beslutninger, priser sagt, næste skridt)
- **den-lille-maler.md** (Allan) — maler; aktiv aftale; Decap CMS; SEO-flytning (behold domæne, DNS→Vercel, evt. 301). Pris sagt: 5.000/6.500 + hosting.
- **jernbanecafeen.md** — café i Ikast; designsystem færdigt (varm fløde/skifer/amber, Lora+Outfit); catering vigtigt forretningsben.
- **midtadvokaterne.md** — advokatfirma (siden 1964), Ikast; fuld brief; 5 sider; navy/grøn + amber, serif+sans; tone: rolig, ingen jura-jargon.
- **buurfoto.md** — din fotograf-demo/portfolio + Facebook-pitch (bruges til at lande fotograf-kunder).
- **vida.md** — website-projekt (fra dine sessioner: inquiry-svar + compliance) — saml hvad VIDA er og status.
- **ktvvs.md** — website-projekt; saml status.

### `wiki/proces/` — din viden & måde at arbejde på
- **freelance-playbook.md** — hele dit flow (8 trin), de 7 spørgsmål du altid stiller, pakker, mail-templates.
- **outreach-systemet.md** — sådan kører lead-systemet (PICK→RESEARCH→QUALIFY→DRAFT→kø), Messenger-digests, "Lille idé til…"-formatet, målgrupper (skønhed/salon/spa/klinik vægtet op, + håndværk + restaurant).
- **teknisk-stak.md** — Next.js + Sheets, Decap CMS til selv-redigering, Vercel hosting, "kode-side, ejer 100 %".

### `wiki/os/` — selve det agentic OS (så systemet kender sig selv)
- Dette dokument, reality-check'en, fase-planen, og de 5 regler.

### `raw/` — rå kilder
- NotebookLM-udtrækkene (Hermes-dyk, start-her, kritik), video-noter, fremtidige web-klip.

> **Vigtig note om Notion/OneNote:** din Notion-workspace var tom ved søgning, og
> OneNote ligger i et binært format. Hvis der ER vigtigt indhold der, skal du
> pege mig på det — ellers springer vi dem over og lader Obsidian være det nye sted.

---

## 5. Præcis start — hvad du gør (Fase 0)

Du var i tvivl om du skulle bygge eller starte med at downloade. **Svar: start med
download — det er det fysiske første skridt, og så forstår du resten undervejs.**

1. **Download Obsidian** fra obsidian.md (gratis). Installér.
2. **Lav mappen** `C:\Users\Buur\Documents\KnowledgeOS` (tom, selvstændig — IKKE i lead-system).
3. I Obsidian: **"Open folder as vault"** → vælg `KnowledgeOS`. Nu *ser* du hvordan en vault er — bare en mappe med filer.
4. Lav fire undermapper: `raw/`, `wiki/`, `context/`, `daily/`.
5. Sig til mig: **"byg indholdet"** — så fylder jeg `claude.md`, `context/`-filerne og kunde-/proces-noterne fra indholds-planen ovenfor (alt er klar; jeg har dataene).
6. Læg din `freelancewebplaybook.md` i `raw/` og bed mig lave den første wiki-note. **Nu lever hjernen.**

Senere (Fase 2), når din ven skal med: privat GitHub-repo + **Obsidian Git**-plugin
(auto-commit hvert 10. min). Det er den rene, gratis vej til at I deler vaulten.

---

## 6. Beslutninger inden jeg bygger (kort)
1. **Bygger jeg vaulten for dig** (jeg laver filerne), eller vil du oprette dem selv ud fra mine tekster? (Jeg anbefaler: du downloader + laver mappen; jeg fylder indholdet.)
2. **VIDA og ktvvs** — vil du have, at jeg dykker i de sessioner og laver ordentlige kunde-noter? (Jeg så dem, men læste dem ikke i dybden endnu.)
3. **Notion/OneNote** — er der noget vigtigt der jeg skal have med, eller udfaser vi dem?

---

## Kilder
NotebookLM-notebook ("The Claude Code and Obsidian Memory Meta", 12 kilder) · dine filer (freelancewebplaybook, Den Lille Maler-aftale, Jernbane designsystem, MidtAdvokaterne-brief, lead-system COMMAND_CENTER_VISION/PRODUCT) · Gmail buur.aigro (outreach seneste ~3 mdr) · tidligere Cowork-sessioner · web: Obsidian Git-setup + kritik af agentic AI 2026.
