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
}

export const BRANCHES = [
  // Håndværk
  "tømrer", "maler", "elektriker", "VVS-installatør", "blikkenslager", "tagdækker", "murermester",
  // Service
  "rengøringsvirksomhed", "vinduespudser", "anlægsgartner",
  // Professionelle
  "advokat", "revisor", "fysioterapeut", "tandlæge", "optiker",
  // Mad & oplevelse
  "restaurant", "café", "fotograf",
];

export const CITIES = [
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
];

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
      totalScore: (p.rating as number | null) ?? null,
      reviewsCount: (p.userRatingCount as number | null) ?? null,
      categoryName: primaryType?.text ?? null,
      city: extractCity(address),
    };
  });
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
