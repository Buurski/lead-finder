# Buurski — intern brand-identitet

Intern identitet for Lucas + Charlies værktøjer (Command Center, buur-cms
/master-admin, fremtidige interne flader). ALDRIG kunde-synlig: kundeflader
(Vida, Jernbanecafeen, CMS-abonnenters editor) har deres egne brands.
Formålet er genkendelighed og lidt hygge for de to daglige brugere — ikke
et salgsbrand.

## Navn

**buurski** — altid små bogstaver i ordbilledet. I løbende tekst: Buurski.

## Mærket: "naboerne"

Buur = nabo. To afrundede blokke side om side: den fyldte (sage) og den
tegnede kontur — de to mennesker i firmaet. Prikken over mellemrummet er
agenten/lyset, arvet fra den gamle sidebar-glødeprik.

- `logo-mark.svg` — kun mærket (sidebar, avatarer, stempler)
- `logo-wordmark.svg` — kun ordbilledet med signatur-prik
- `logo-full.svg` — mærke + ordbillede (docs, rapport-headers)
- `src/app/icon.svg` — favicon-varianten (begge blokke fyldt, mere kontrast
  på 16 px; creme baggrundsplade så den virker på mørke faneblade)

Signatur-form: **afrundet blok (rx ≈ 30% af bredden) + fritstående prik.**
Genbrug den form frem for at opfinde nye dekorationer.

## Farver (4)

| Token | Hex (SVG/print) | CSS-var (lead-system) | Brug |
|---|---|---|---|
| Sage | `#5B8C72` | `--accent` oklch(58% 0.085 150) | Primær accent, den fyldte nabo |
| Ink | `#2E2A24` | `--text` oklch(24% 0.020 70) | Tekst, konturen |
| Creme | `#F8F5EE` | `--bg` oklch(97.2% 0.012 85) | Papir/baggrund |
| Guld | `#C8A97E` | buur-cms `--accent-warm` | Prikken, bro til buur-cms' Sting-tema |

buur-cms' kunde-UI beholder sit eget Sting-tema (#F4F1EB / #D4500F) — guld
er den bevidste fællesnævner mellem de to systemer.

## Typografi (2)

- **Fraunces** (display, 600) — overskrifter og ordbilledet. Fallback Georgia.
- **Plus Jakarta Sans** (body) — alt andet. Fallback system-ui.

Begge er allerede indlæst i både lead-system og buur-cms via next/font.

## Regler

1. Mærket skalerer ned til 16 px (favicon-varianten). Brug aldrig
   wordmark-SVG'erne under 24 px højde.
1b. På lyse UI-flader (creme sidebar) bruges den mørke sage
   (`--accent-ink`, oklch 42%) til den fyldte blok — ren `--accent` er for
   lavkontrast (~2.6:1) til små grafiske objekter. Favicon-varianten bruger
   ink + sage blokke (ikke sage + guld — de smelter sammen ved 16 px).
2. Én accent pr. flade: sage ER accenten i Command Center. Guld kun til
   prikken og små highlights.
3. Ingen skygger/gradienter i mærket — flade former, som resten af CC.
4. Wordmark-SVG'erne bruger lokal Fraunces/Georgia via `<text>` — de er til
   interne flader og docs, ikke til miljøer uden fonte (mail-signaturer
   bruger ren tekst).
