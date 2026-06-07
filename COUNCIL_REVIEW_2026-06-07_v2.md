# Council Review v2 — post-deploy findings (2026-06-07)

5-rolle internt council på Lucas's 3 live-fund: "5300"-tæller, Mission Control-rod, Memory-stale.
Fokus: andre tællere med samme mismatch, andre stale caches, andre overlap, simplest mobil-UX.

---

## 1. ARCHITECT — andre tællere med samme mismatch som 5300?

"5300" er IKKE en afkobling som 2300-bugen (det var producent-tal vs viste items). 5300 er et
ÆGTE tal — `deck.numbers.newLeads = status==="new"` ([deck.ts:226](src/lib/deck.ts#L226)) — men
**semantisk inkonsistent** med /lead-gen's "kontaktbare" (isContactable, top-40).

Tællere gennemgået:
- **newLeads** (rå status-new) → vist stort i HeroNumber-fallback + NumbersStrip. **MISMATCH. Fix.**
- **/leads "X nye"** = samme status-new. OK i pipeline-view (totaler forventes der) — beholdes.
- **sentToday / repliesPending / wonThisWeek** = ægte events fra Sheets-datoer. Konsistente.
- **messenger pool "eligible"** bruger `isMessengerEligible` (= isContactable) → ALLEREDE konsistent.
  Det er modellen at følge: tæl det handlingsbare, ikke det rå.
- **/lead-gen feed-count** capper visning til 40 uden at vise totalen → forvirrer mod 5300. **Fix:**
  vis `totalContactable` + "viser top 40".
→ Konklusion: ÉN kilde til "hvor mange kan jeg kontakte nu" = `contactable`. Brug overalt.

## 2. SRE — andre stale caches?

- **/memory local-first** ([vault.ts:207](src/lib/vault.ts#L207)) → committed snapshot, læser aldrig
  remote. **DEN store stale-bug.** Badge "Vault: live" er direkte usandt. Fix: preferRemote.
- **`/api/vault/note`** kun remote for `daily/` ([note/route.ts:12](src/app/api/vault/note/route.ts#L12))
  → alle memory-noter lokale. Fix: `&remote=1`.
- readVaultNote 5-min cache + readVaultJson 90-sek cache = fine (Lucas ville 5-15 min).
- Andre flader der læser ikke-`daily/` vault lokalt: ingen — kun /memory. /build-guide læser repo-filer
  bevidst; deck/Sheets er live (force-dynamic). Morgen-vitals læser remote via readVaultJson. OK.
- vaultLiveCheck-badge viste "live" mens listen var lokal → inkonsistens forsvinder med remote-fix.

## 3. UX — andre Mission Control-overlap?

- **3 "morgen"-blokke stablet**: MorningVitals + "Hvad skal vi i dag" (brief) + "Dagens opgaver"
  (needs-you). Det er roddet. Fix: vitals → slank kollapsbar health-bar (system-health adskilt fra
  Lucas-opgaver).
- **Dobbelt-tal**: HeroNumber OG NumbersStrip viser begge `newLeads` → samme tal to gange. Efter
  fix viser begge `contactable`; acceptabelt (hero = stort fokus-tal, strip = kontekst) men hold øje.
- QueueCard + "Dagens opgaver"s queue-pointer refererer begge køen — mild dobbelthed, ikke kritisk.

## 4. DEVIL / GROWTH — risici + den simpleste unified UX

- **Devil:** at ændre `newLeads`→`contactable` i hero må IKKE skjule at der ER en stor rå pulje
  (Lucas vil vide at scrapet virkede). Løsning: hero/strip = "klar at kontakte" (handlingsbart),
  og /lead-gen viser totalen eksplicit. Ingen tal forsvinder — de får bare ærlige labels.
- **Devil:** remote-memory tilføjer et GitHub-kald pr. note-åbning. 5-min cache + on-demand
  (én note ad gangen) holder det billigt. Listing er ét tree-kald pr. page-load. Fint.
- **Growth:** den konsistente "contactable"-tæller er fundamentet for fremtidig "branche-mætning"
  + daglig kvote ("X klar, kør N i dag").
- **Simplest mobil-UX (besluttet):** vitals = tynd ÉN-linje bar der auto-kollapser når alt friskt
  ("✓ alle morgenkørsler friske"), udvider kun stale/røde. Brief leder, opgaver følger.

---

## Beslutninger → DEL 1-3
1. **DEL 1:** `deck.contactable` (isUnworkedStatus && isContactable) → Mission Control + /lead-gen
   viser "klar at kontakte" konsistent; /lead-gen "{total} kontaktbare · viser top 40".
2. **DEL 2:** MorningVitals → slank kollapsbar health-bar (auto-kollaps når grøn).
3. **DEL 3:** /memory remote-first (list + note + Opdater-knap); `/api/vault/note?remote=1`.

Ingen P0. Alle 3 er P1-klarheds/friskheds-fixes, ingen sikkerheds-/send-risiko.
