// Google Places API (New) — replaces Apify for lead scraping
const PLACES_BASE = "https://places.googleapis.com/v1/places:searchText";

export interface ApifyPlace {
  title: string;
  address: string;
  phone: string | null;
  website: string | null;
  email: string | null;
  totalScore: number | null;
  reviewsCount: number | null;
  categoryName: string | null;
  city: string | null;
  /** Googles drift-status: OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY. */
  businessStatus?: string | null;
}

export const BRANCHES = [
  // Håndværk
  "tømrer", "maler", "elektriker", "VVS-installatør", "blikkenslager", "tagdækker", "murermester",
  // Service
  "rengøringsvirksomhed", "vinduespudser", "anlægsgartner",
  // Auto
  "autoværksted", "bilværksted", "automekaniker",
  // Professionelle
  "advokat", "revisor", "fysioterapeut", "tandlæge", "optiker",
  // Mad & oplevelse
  "restaurant", "café",
  // Foto
  "fotograf",
  // Skønhed & velvære
  "skønhedsklinik", "hudklinik", "negle & vippeextensions salon", "frisørsalon",
];

export const CITIES = [
  // East Jutland — Aarhus + omegn (added 2026-05-18)
  "Aarhus", "Risskov", "Viby J", "Højbjerg", "Brabrand",
  "Tilst", "Hasselager", "Lystrup", "Skødstrup", "Beder",
  "Malling", "Solbjerg", "Hinnerup", "Hjortshøj", "Egå",
  "Skanderborg", "Galten", "Hammel", "Ry", "Odder",
  "Randers", "Grenaa", "Ebeltoft", "Hadsten",
  // Mid-Jutland (kept minus Ikast)
  "Herning", "Silkeborg", "Viborg", "Holstebro", "Ringkøbing",
  "Struer", "Skive", "Lemvig", "Horsens", "Varde",
  "Videbæk", "Brande", "Give", "Vinderup", "Ulfborg",
  // North Jutland
  "Aalborg", "Nørresundby", "Hjørring", "Frederikshavn", "Skagen",
  "Brønderslev", "Hobro", "Thisted",
  // South Jutland
  "Esbjerg", "Kolding", "Aabenraa", "Haderslev", "Tønder",
  "Vejle", "Fredericia", "Billund",
  // Fyn
  "Odense", "Middelfart", "Svendborg", "Nyborg", "Kerteminde",
  // Udvidelse 2026-09-21 (Lucas: "vi kan jo godt finde markant flere leads").
  // Brønden var tom: 0 ubearbejdede håndværkere tilbage i de gamle 60 byer.
  // Mid/vest-Jylland
  "Ikast", "Bjerringbro", "Grindsted", "Tarm", "Skjern", "Vejen",
  "Rønde", "Auning", "Hornslet", "Bramming", "Ribe", "Rødding",
  "Vamdrup", "Nykøbing Mors", "Hurup", "Løgstør",
  // Nord-Jylland
  "Sæby", "Støvring", "Aars", "Hadsund", "Dronninglund", "Pandrup", "Aabybro",
  "Skørping", "Terndrup",
  // Syd-Jylland
  "Nordborg", "Augustenborg", "Gråsten",
  // Fyn og øerne
  "Bogense", "Ringe", "Assens", "Faaborg", "Otterup", "Rudkøbing",
  // Sjælland UDEN hovedstaden (Lucas 2026-09-21: "det er også fint at der er
  // nogen på Sjælland. Men når alle sammen ligger i København, det går bare
  // ikke"). København, Frederiksberg og forstæderne står bevidst IKKE her.
  "Roskilde", "Næstved", "Slagelse", "Holbæk", "Køge", "Helsingør", "Hillerød",
  "Ringsted", "Kalundborg", "Nykøbing Falster", "Vordingborg", "Sorø", "Nakskov",
];

// Region presets for /api/scrape?region=... — keeps scrape function under 5 min
export const REGION_PRESETS: Record<string, string[]> = {
  aarhus: ["Aarhus", "Risskov", "Viby J", "Højbjerg", "Brabrand", "Tilst", "Hasselager", "Lystrup", "Skødstrup", "Beder", "Malling", "Solbjerg", "Hinnerup", "Hjortshøj", "Egå", "Skanderborg", "Galten", "Hammel", "Ry", "Odder", "Randers", "Grenaa", "Ebeltoft", "Hadsten"],
  odense: ["Odense", "Middelfart", "Svendborg", "Nyborg", "Kerteminde"],
  esbjerg: ["Esbjerg", "Kolding", "Aabenraa", "Haderslev", "Tønder", "Vejle", "Fredericia", "Billund"],
  aalborg: ["Aalborg", "Nørresundby", "Hjørring", "Frederikshavn", "Skagen", "Brønderslev", "Hobro", "Thisted"],
  midt: ["Herning", "Silkeborg", "Viborg", "Holstebro", "Ringkøbing", "Struer", "Skive", "Lemvig", "Horsens", "Varde", "Videbæk", "Brande", "Give", "Vinderup", "Ulfborg"],
  // Nye områder 2026-09-21. Egne presets, så et scrape kan køres i bidder —
  // en fuld gennemkørsel af hele branche×by-nettet er dyr (Places-kald).
  "midt-nye": ["Ikast", "Bjerringbro", "Grindsted", "Tarm", "Skjern", "Vejen", "Rønde", "Auning", "Hornslet", "Bramming", "Ribe", "Rødding", "Vamdrup", "Nykøbing Mors", "Hurup", "Løgstør"],
  "nord-nye": ["Sæby", "Støvring", "Aars", "Hadsund", "Dronninglund", "Pandrup", "Aabybro", "Skørping", "Terndrup"],
  "fyn-nye": ["Bogense", "Ringe", "Assens", "Faaborg", "Otterup", "Rudkøbing", "Nordborg", "Augustenborg", "Gråsten"],
  sjaelland: ["Roskilde", "Næstved", "Slagelse", "Holbæk", "Køge", "Helsingør", "Hillerød", "Ringsted", "Kalundborg", "Nykøbing Falster", "Vordingborg", "Sorø", "Nakskov"],
};

export const BRANCH_PRESETS: Record<string, string[]> = {
  craft: ["tømrer", "maler", "elektriker", "VVS-installatør", "blikkenslager", "tagdækker", "murermester"],
  food: ["restaurant", "café"],
  beauty: ["skønhedsklinik", "hudklinik", "negle & vippeextensions salon", "frisørsalon"],
  professional: ["advokat", "revisor", "fysioterapeut", "tandlæge", "optiker"],
  auto: ["autoværksted", "bilværksted", "automekaniker"],
};

export function buildQueries(branches = BRANCHES, cities = CITIES): string[] {
  return branches.flatMap((b) => cities.map((c) => `${b} ${c}`));
}

function extractCity(formattedAddress: string): string | null {
  // Danish addresses: "Vestergade 12, 7400 Herning, Danmark"
  const parts = formattedAddress.split(",");
  for (const part of parts) {
    const m = part.trim().match(/^\d{4}\s+(.+)$/);
    if (m) return m[1].trim();
  }
  if (parts.length >= 2) {
    const candidate = parts[parts.length - 2].trim().replace(/^\d{4}\s*/, "");
    if (candidate) return candidate;
  }
  return null;
}

async function searchPlaces(query: string, apiKey: string): Promise<ApifyPlace[]> {
  const res = await fetch(PLACES_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": [
        "places.displayName",
        "places.formattedAddress",
        "places.nationalPhoneNumber",
        "places.websiteUri",
        "places.primaryTypeDisplayName",
        "places.rating",
        "places.userRatingCount",
        // Googles egen drift-status: OPERATIONAL | CLOSED_TEMPORARILY |
        // CLOSED_PERMANENTLY. Det eneste AUTORITATIVE dødt-forretning-signal vi
        // kan få (Lucas 2026-09-21, Dangi Frisør). Ligger i samme SKU-niveau som
        // rating/userRatingCount, som vi allerede betaler for — koster intet
        // ekstra. Gælder kun leads scrapet fra og med nu.
        "places.businessStatus",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: query,
      languageCode: "da",
      maxResultCount: 20,
      regionCode: "DK",
    }),
  });

  if (!res.ok) throw new Error(`Google Places fejlede (${res.status}): ${await res.text()}`);
  const data = await res.json();
  const places = (data.places ?? []) as Record<string, unknown>[];

  return places.map((p): ApifyPlace => {
    const displayName = p.displayName as { text?: string } | undefined;
    const primaryType = p.primaryTypeDisplayName as { text?: string } | undefined;
    const address = (p.formattedAddress as string) ?? "";
    return {
      title: displayName?.text ?? "",
      address,
      phone: (p.nationalPhoneNumber as string | null) ?? null,
      website: (p.websiteUri as string | null) ?? null,
      email: null,
      businessStatus: (p.businessStatus as string | null) ?? null,
      totalScore: (p.rating as number | null) ?? null,
      reviewsCount: (p.userRatingCount as number | null) ?? null,
      categoryName: primaryType?.text ?? null,
      city: extractCity(address),
    };
  });
}

/**
 * Slå ÉN konkret forretning op på navn + by. Bruges til at berige kladder i
 * godkendelses-køen der aldrig har haft en Sheets-række og derfor mangler
 * website, anmeldelsestal og drift-status (2026-09-21).
 *
 * Ét Places-kald pr. opslag — kalderen står for at holde antallet nede.
 * Returnerer null hvis der ikke er et rimeligt navne-match, så vi hellere
 * mangler data end tilskriver en forretning en fremmed hjemmeside.
 */
export async function lookupPlace(name: string, city: string): Promise<ApifyPlace | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not set");
  const q = `${name} ${city}`.trim();
  if (!q) return null;
  const places = await searchPlaces(q, apiKey);
  if (places.length === 0) return null;
  const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const wanted = norm(name);
  // Krav om et rigtigt navne-overlap: Places svarer gerne med "nærmeste
  // frisør" på et navn den ikke kender, og så ville vi hæfte en tilfældig
  // forretnings hjemmeside på kladden.
  const hit = places.find((p) => {
    const got = norm(p.title);
    return got === wanted || got.includes(wanted) || wanted.includes(got);
  });
  return hit ?? null;
}

export async function runScraper(queries = buildQueries()): Promise<ApifyPlace[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_PLACES_API_KEY not set");

  const allResults: ApifyPlace[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    try {
      const places = await searchPlaces(query, apiKey);
      for (const p of places) {
        if (!p.title) continue;
        // Google siger selv at forretningen er lukket. Den skal aldrig ind i
        // basen (Lucas 2026-09-21, Dangi Frisør-sagen). CLOSED_TEMPORARILY
        // lukkes IKKE ude — ferielukket eller ombygning er stadig en kunde.
        if (p.businessStatus === "CLOSED_PERMANENTLY") continue;
        const key = p.title.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allResults.push(p);
        }
      }
    } catch (err) {
      console.error(`Query "${query}" failed:`, err);
    }
    // Stay well within rate limits
    await new Promise((r) => setTimeout(r, 120));
  }

  return allResults;
}

export function scoreLead(place: ApifyPlace): number {
  let score = 0;

  const rating = place.totalScore ?? 0;
  const reviews = place.reviewsCount ?? 0;
  if (rating > 0 && reviews > 0) {
    const normalized = Math.min((rating * Math.log10(reviews + 1)) / (5 * 2), 1);
    score += Math.round(normalized * 40);
  }

  if (!place.website) score += 30;
  if (reviews >= 20) score += 15;

  return Math.min(score, 100);
}

export function detectWebsiteStatus(website: string | null): "none" | "ok" {
  if (!website) return "none";
  return "ok";
}
