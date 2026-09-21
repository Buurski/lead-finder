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
/** P(øst for Storebælt) over dette = uden for området. */
export const OUT_OF_TERRITORY_AT = 0.7;
/** Mellem disse er svaret for usikkert til at straffe på — ingen straf. */
export const UNCERTAIN_BELOW = 0.3;
/** Loft pr. kørsel, så en frisk bylistning ikke æder hele batch-deadline. */
export const MAX_NEW_CITIES_PER_RUN = 250;

const REGION_QUESTION: Record<string, JevQuestion> = {
  oest_for_storebaelt: {
    type: "noul",
    instructions:
      "Ligger den danske by `by` øst for Storebælt — altså på Sjælland, Lolland, Falster, Møn eller Bornholm (fx København, Roskilde, Slagelse, Næstved, Nykøbing Falster, Rønne)? Svar nej hvis byen ligger i Jylland eller på Fyn (fx Herning, Aarhus, Aalborg, Esbjerg, Odense, Svendborg).",
  },
};

/** By → P(øst for Storebælt). */
export type CityRegionMap = Record<string, number>;

/**
 * Byer Jev ér øst for Storebælt, men kun gav 0,30–0,69 på (målt over alle 174
 * byer i lead-basen 2026-09-21 — se vault-noten). Jev rammer de store byer
 * sikkert (København 0,95 · Roskilde 0,95 · Næstved 0,96) og falder tilbage på
 * ~0,40 for småbyer, hvor jyske og sjællandske navne overlapper fuldstændigt.
 * Tærsklen bliver derfor på 0,7 (nul falske positive i målingen), og de
 * konkrete undtagelser står her — hver enkelt slået efter i hånden.
 */
const MANUAL_EAST = new Set([
  "frederikssund", "nakskov", "vordingborg", "maribo", "hundested",
  "faxe", "korsør", "stege", "greve", "haslev", "vipperød",
]);

export function cityKey(city: string): string {
  return (city || "").trim().toLowerCase();
}

/** Sjælland og øerne øst for Storebælt ligger uden for Kinlys område. */
export function isOutOfTerritory(p: number | undefined, city?: string): boolean {
  if (city && MANUAL_EAST.has(cityKey(city))) return true;
  return typeof p === "number" && p >= OUT_OF_TERRITORY_AT;
}

export async function loadCityRegions(): Promise<CityRegionMap> {
  const raw = await store.get<CityRegionMap>(CACHE_KEY);
  if (!raw || typeof raw !== "object") return {};
  // Defensivt: en tidligere version gemte strenge ("jylland"). Dem ignorerer vi
  // i stedet for at lade dem forurene en talsammenligning.
  const out: CityRegionMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1) out[k] = v;
  }
  return out;
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
  const worker = async () => {
    while (i < batch.length && !(deadline && Date.now() > deadline)) {
      const key = batch[i++];
      const res = await jevAsk({ by: key }, REGION_QUESTION, { timeoutMs: 10_000 });
      const p = noul(res?.answers, "oest_for_storebaelt");
      if (typeof p !== "number" || !Number.isFinite(p) || p < 0 || p > 1) continue;
      known[key] = p;
      added++;
    }
  };
  await Promise.all(Array.from({ length: Math.min(8, batch.length) }, worker));
  if (added > 0) await store.put(CACHE_KEY, known);
  return known;
}
