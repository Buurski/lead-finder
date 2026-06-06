# NIGHT_BUILD_REPORT_v4.md — Command Center v3, Del 4

*Skrevet 5. juni 2026. Del 4 = fix "ser godt ud, men virker ikke"-fundene fra
Council + en mobil-først redesign af Mission Control. Branch: `command-center-v3`.
Intet pushet/merged/deployet til main. Build + lint grøn efter hvert block.
Alle offline test-suites grønne. Live-kø urørt (12).*

---

## Kort version

Tre blocks, alle færdige:
1. **Mission Control mobil-redesign** — det største UX-løft.
2. **Funktionelle fixes** for de "døde knapper" Council pegede på.
3. **Hurtig polish.**

```bash
git checkout command-center-v3
npm run build && npm run lint && node scripts/test_all.mjs   # alle grønne
npx next start -p 3000   # / sender til /welcome første gang
```

---

## Block 1 — Mission Control mobil-først ✅
- **Hero-tal:** det vigtigste tal stort øverst (svar i dag → kø → nye leads),
  klikbart til den rigtige skærm.
- **UsageSparkline:** 14-dages SVG area-chart over mails/dag (sage 18% fyld,
  accent-streg, svar-prikker oveni), med tom-tilstand. `deck.ts` får `dailySent[]`.
- **Tabs mobil:** korte labels ("Goals & Revenue" → "Mål"), og på mobil flytter
  fane-baren NED under indholdet som "Skift visning"-sekundær-nav (header-tabs
  skjules). Horisontal-scroll-sikker.
- **Tættere mobil-padding** (14×16), `today-cols` → 1 kolonne, breakpoints
  synket til 640px.
- Verificeret i browser på 414px (mobil) + desktop. Screenshots i `_screenshots/del4/`.

## Block 2 — Funktionelle fixes ✅
- **Goals & Revenue:** rigtige tal nu. `buildRevenue()` summerer klienternes
  måneds- + setup-honorarer (dansk tusind-separator-aware); fanen viser
  løbende/md, setup og % af 10.000-kr-målet. Ingen hardkodede 0'er.
- **/seo Lighthouse → PageSpeed-fallback:** når der ikke er en lokal Chrome
  (Vercel) kalder den Google PageSpeed Insights API (gratis; `PAGESPEED_API_KEY`
  valgfri) og skriver tydeligt "Lighthouse ikke tilgængelig på Vercel — bruger
  PageSpeed API". Caches 24h.
- **KVStore.list():** SCAN-cursor-loop i stedet for `KEYS` (produktions-blocker
  — KEYS blokerer Redis' event-loop).
- **/replies live-send:** eksplicit **ARM-kontakt** (amber) + bekræft pr. svar.
  Ruten returnerer nu en KLAR struktureret 412 (`needsArm` + besked), ikke en
  stille fejl. Rigtig afsendelse sker kun når `LIVE_SEND_ARMED=1` + bekræft +
  modtager. (Jeg har IKKE sat `LIVE_SEND_ARMED` — guardrail.)

## Block 3 — Polish ✅
- **/claude:** de 4 marketing-kort er erstattet med en ærlig
  "deployment-pending" FaseNote (in-app chat er ikke deployet; Claude kører via
  CLI). Den rigtige Forbindelser-status er beholdt.
- **/replies:** klar "Gmail er ikke sat op endnu"-besked når GMAIL mangler
  (ruten gav i forvejen 200, ikke 500).
- **AI Spend:** `ai.ts` fanger nu de EKSAKTE input/output-tokens fra Anthropic-
  svaret (`usage`) og logger dem som ikke-estimerede; gateway-stien estimerer
  stadig på længde.

---

## Beslutninger / næste skridt
1. **LIVE_SEND_ARMED:** sæt den i miljøet, når du selv vil kunne sende svar til
   kunder fra /replies (stadig med bekræft pr. svar). Jeg lod den være slukket.
2. **PAGESPEED_API_KEY:** valgfri — uden den virker PageSpeed på gratis-kvote.
3. **Vercel:** KV/Blob-env + (valgfri) `STORE_DRIVER=kv` ved deploy.

## Guardrails — overholdt
✅ Kun commits på `command-center-v3` · intet push/merge/deploy
✅ Mail kun til buur.aigro (hard-locked) · ingen klient-mail · LIVE_SEND ikke armed
✅ Sheets-leads urørt · kø tilbage på 12
✅ Build + lint + alle suites grønne efter hvert block

God morgen. Åbn `/` på din telefon — det er der forskellen ses.
