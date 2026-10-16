# Annonce-bibliotek (GPT Image, runde 2, 16/10-2026)

Alt fra annonce-arbejdet 16/10. Bliver ikke deployet (`.vercelignore`). HQ viser kun det i `public/annoncer/`.

## Mapper
| Mappe | Indhold |
|---|---|
| `skabeloner/` | Rå GPT Image-annoncer med nøglefarvede skærme: magenta `#FF00FF` = telefon, grøn `#00FF00` = laptop/2. telefon, cyan `#00FFFF` = 3. telefon. **Kan genbruges** med alle skærmbilleder. |
| `prompts/` | Prompten bag hver skabelon (`prompt-<id>.txt`, `faelles.txt` = fælles regler) og Codex' endelige prompt (`*.prompt.txt`) |
| `faerdige/kinly/` | Klar med kinly.dk-skærme, må bruges nu |
| `faerdige/ikast/` | Med ikastautoservice.dk: **KRÆVER KUNDE-OK (Allan)** |
| `faerdige/planuko/` | Planuko-kladder: først efter App Store, Vilfreds spor |
| `planuko-skaerme/` | Planuko-skærme med statuslinje + logoer |
| `referencer/` | Stilreferencer givet til GPT Image (Booksy-ads, Kinly-enheder, font) |

## Skabeloner → færdig
| Skabelon | Koncept | Skærme | Status |
|---|---|---|---|
| `kinly-a3-haand.png` | Hånd + telefon, ember | magenta: 1 telefon | **Bedst** (5 fingre, rigtig længde) → `faerdige/kinly/haand-v3.png` |
| `kinly-a2-haand.png` | Hånd, ember | magenta | Erstattet: telefon for lang |
| `kinly-a-haand.png` | Hånd, skrå | magenta | Erstattet: 6 fingre |
| `kinly-b2-foer-efter.png` | Før/efter, to telefoner | grøn = før, magenta = efter | God → `faerdige/ikast/foer-efter-v2.png` |
| `kinly-c-pris.png` | Pris i mørk stil | magenta + grøn | `faerdige/kinly/pris.png` |
| `kinly-d-udkast.png` | Laptop + telefon | grøn = laptop, magenta = telefon | `faerdige/kinly/udkast.png` |
| `kinly-e-undersider.png` / `kinly-ek-undersider.png` | Tre telefoner, én pr. ydelse | magenta, grøn, cyan | `faerdige/*/undersider.png` |
| `planuko-p1-budget.png` | To telefoner, budget | magenta + grøn | `faerdige/planuko/budget.png` |
| `planuko-p2-haand.png` | Hånd, creme | magenta | `faerdige/planuko/haand.png`. Prøve-chippen fjernet 16/10 på Lucas' ordre (prøve kun på årsplan). Indsæt: `magenta=planuko-skaerme/skaerm-A-uge.png logo=planuko-skaerme/logo-moerk.png@64,1250,256`. AI-hænder er ok for Planuko |

## Lav en ny variant med en anden skærm
```bash
python -I scripts/annonce-indsaet.py annonce-bibliotek/skabeloner/kinly-a3-haand.png ud.png magenta=public/annoncer/kilde/skaerm-kinly-side-herning.png logo=public/annoncer/kilde/logo-paa-ember.png@64,1250,240
```
Nye skærme: tilføj til `SKUD` i `scripts/annonce-kilder.mjs` → kør `scripts/annonce-skaerme.mjs` (statuslinje + Safari).
Ny skabelon: `REFS="..." bash annonce-bibliotek/koer-gpt.sh <id>` (Codex GPT Image, ~5 min, kræver Codex-credits). Tjek ALTID fingre og telefonlængde visuelt.
Til HQ: resize til 1080×1350, læg i `public/annoncer/gpt/`, tilføj i `STILLS` i `scripts/annonce-stills.mjs`.
