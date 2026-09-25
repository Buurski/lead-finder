// city-region.ts — ligger byen øst for Storebælt? Lucas 2026-09-21:
// "vi er ikke i København... alle dem her fra København er faktisk ikke helt
// interessante for os". Kinly sidder i Herning og sælger til Jylland og Fyn.
//
// Hvorfor Jev og ikke en hardkodet liste: bylisten vokser hver gang scraperen
// kører (174 distinkte byer nu, halvdelen småbyer som Tapdrup og Herrup), og
// en håndholdt Sjælland-liste rådner præcis som kæde-listen gjorde. Jev kender
// dansk geografi, og svaret caches for evigt — en by flytter sig ikke.
//
// Hvorfor Noul og ikke Choice: en fire-vejs "hvilken landsdel" gav under 0,6
// sikkerhed på 86 af 174 byer (målt 2026-09-21) — inklusive Horsens, Skive og
// Holbæk — fordi Jev delte sandsynligheden mellem jylland og fyn på småbyer.
// Men den fordeling er ligegyldig: begge er inden for området. Det ENESTE
// spørgsmål der betyder noget er ja/nej til øst for Storebælt, og det er Jev
// markant mere sikker på.
//
// Kun bynavnet sendes til Jev. Ingen firmanavne, ingen adresser, ingen
// kundedata forlader dette modul.

import { store } from "../store.ts";
import { jevAsk, noul, type JevQuestion } from "../jev.ts";

const CACHE_KEY = "jev-city-region";
/** P(hovedstaden) over dette = for langt væk / for koncentreret. */
export const OUT_OF_TERRITORY_AT = 0.7;
/** Mellem disse er svaret for usikkert til at straffe på — ingen straf. */
export const UNCERTAIN_BELOW = 0.3;
/** Loft pr. kørsel, så en frisk bylistning ikke æder hele batch-deadline. */
export const MAX_NEW_CITIES_PER_RUN = 250;

// Begge spørgsmål stilles i ÉT kald — output er gratis hos TypeSafe, så det
// andet koster reelt ingenting. Kun `hovedstaden` bruges til straf (Lucas
// 2026-09-21: "det er også fint at der er nogen på Fyn og også nogen på
// Sjælland. Men når alle sammen ligger i København, det går bare ikke").
// `oest` gemmes som en knap, hvis afstand senere skal vægtes.
const REGION_QUESTION: Record<string, JevQuestion> = {
  hovedstaden: {
    type: "noul",
    instructions:
      "Ligger den danske by `by` i hovedstadsområdet — altså København, Frederiksberg eller en forstad inden for ca. 30 km (fx Glostrup, Ballerup, Herlev, Gentofte, Hvidovre, Taastrup, Greve)? Svar nej for resten af landet, inklusive resten af Sjælland (fx Roskilde, Slagelse, Næstved, Holbæk) og hele Jylland og Fyn.",
  },
  oest_for_storebaelt: {
    type: "noul",
    instructions:
      "Ligger den danske by `by` øst for Storebælt — altså på Sjælland, Lolland, Falster, Møn eller Bornholm (fx København, Roskilde, Slagelse, Næstved, Nykøbing Falster, Rønne)? Svar nej hvis byen ligger i Jylland eller på Fyn (fx Herning, Aarhus, Aalborg, Esbjerg, Odense, Svendborg).",
  },
};

/** By → {hovedstaden, øst for Storebælt} som sandsynligheder. */
export interface CityRegion { hovedstaden: number; oest?: number }
export type CityRegionMap = Record<string, CityRegion>;

/**
 * Byer Jev ér øst for Storebælt, men kun gav 0,30–0,69 på (målt over alle 174
 * byer i lead-basen 2026-09-21 — se vault-noten). Jev rammer de store byer
 * sikkert (København 0,95 · Roskilde 0,95 · Næstved 0,96) og falder tilbage på
 * ~0,40 for småbyer, hvor jyske og sjællandske navne overlapper fuldstændigt.
 * Tærsklen bliver derfor på 0,7 (nul falske positive i målingen), og de
 * konkrete undtagelser står her — hver enkelt slået efter i hånden.
 */
const MANUAL_HOVEDSTADEN = new Set([
  "københavn", "frederiksberg", "valby", "vanløse", "brønshøj", "hellerup",
  "gentofte", "charlottenlund", "lyngby", "kongens lyngby", "herlev", "ballerup",
  "glostrup", "rødovre", "hvidovre", "brøndby", "albertslund", "taastrup",
  "tåstrup", "ishøj", "greve", "vallensbæk", "søborg", "kastrup", "dragør",
  "amager", "nørrebro", "østerbro", "vesterbro",
]);

export function cityKey(city: string): string {
  return (city || "").trim().toLowerCase();
}

/**
 * Hovedstadsområdet. IKKE hele Sjælland: Lucas 2026-09-21 sagde udtrykkeligt at
 * Fyn og Sjælland er fine, og at problemet er at ALLE ligger i København.
 * Straffen her håndterer afstanden til Herning; koncentrationen håndteres af
 * by-loftet i engine.ts, ikke af en større straf.
 */
export function isOutOfTerritory(r: CityRegion | undefined, city?: string): boolean {
  if (city && MANUAL_HOVEDSTADEN.has(cityKey(city))) return true;
  return typeof r?.hovedstaden === "number" && r.hovedstaden >= OUT_OF_TERRITORY_AT;
}

export async function loadCityRegions(): Promise<CityRegionMap> {
  const raw = await store.get<CityRegionMap>(CACHE_KEY);
  if (!raw || typeof raw !== "object") return {};
  // Defensivt: en tidligere version gemte strenge ("jylland"). Dem ignorerer vi
  // i stedet for at lade dem forurene en talsammenligning.
  const out: CityRegionMap = {};
  for (const [k, v] of Object.entries(raw)) {
    // Ældre versioner gemte et bart tal (P(øst)). Det siger intet om
    // hovedstaden, så det kasseres og byen spørges igen.
    if (v && typeof v === "object" && typeof (v as CityRegion).hovedstaden === "number") {
      out[k] = v as CityRegion;
    }
  }
  return out;
}

/** Kastes af classifyCities når Jev ikke svarer (5 kald i træk uden svar). */
export class JevUnavailableError extends Error {
  constructor() { super("jev-unavailable"); }
}

/**
 * Klassificér de byer der ikke allerede står i cachen, og gem resultatet.
 * Returnerer HELE kortet (gammelt + nyt). Best-effort: en by Jev ikke svarer
 * på, springes over og prøves igen næste gang — ingen gættet landsdel.
 */
export async function classifyCities(cities: string[], deadline?: number): Promise<CityRegionMap> {
  const known = await loadCityRegions();
  const missing: string[] = [];
  const seen = new Set<string>();
  for (const c of cities) {
    const key = cityKey(c);
    if (!key || known[key] !== undefined || seen.has(key)) continue;
    seen.add(key);
    missing.push(key);
  }
  if (missing.length === 0) return known;

  // Parallelt i hold: ét bynavn er ~0,8 s, og 174 byer sekventielt ville ikke
  // nå inden for fase 0's budget — så ville straffen først slå igennem efter
  // fem kørsler. Ingen delt tilstand pr. by, så otte ad gangen er trivielt.
  const batch = missing.slice(0, MAX_NEW_CITIES_PER_RUN);
  let added = 0;
  let i = 0;
  // 5 Jev-kald i træk uden svar (429/5xx/timeout) = stop fase 0 (Codex 25/9);
  // byerne caches ikke ved fejl og prøves igen næste kørsel.
  let failStreak = 0;
  const worker = async () => {
    while (failStreak < 5 && i < batch.length && !(deadline && Date.now() > deadline)) {
      const key = batch[i++];
      const res = await jevAsk({ by: key }, REGION_QUESTION, { timeoutMs: 10_000 });
      failStreak = res ? 0 : failStreak + 1;
      const h = noul(res?.answers, "hovedstaden");
      if (typeof h !== "number" || !Number.isFinite(h) || h < 0 || h > 1) continue;
      const o = noul(res?.answers, "oest_for_storebaelt");
      known[key] = { hovedstaden: h, ...(typeof o === "number" ? { oest: o } : {}) };
      added++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, worker));
  if (added > 0) await store.put(CACHE_KEY, known);
  // Kaldere (jev-run) skal vide at Jev er nede, så de ikke starter næste fase forfra.
  if (failStreak >= 5) throw new JevUnavailableError();
  return known;
}
