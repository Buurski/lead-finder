const ACTOR_ID = "compass~crawler-google-places";
const BASE = "https://api.apify.com/v2";

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
  // Skønhed
  "frisørsalon",
];

export const CITIES = [
  "Herning", "Ikast", "Silkeborg", "Viborg", "Holstebro",
  "Ringkøbing", "Struer", "Skive", "Lemvig", "Horsens",
];

export function buildQueries(branches = BRANCHES, cities = CITIES): string[] {
  return branches.flatMap((b) => cities.map((c) => `${b} ${c}`));
}

export async function runScraper(queries = buildQueries()): Promise<ApifyPlace[]> {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN not set");

  // Start run
  const runRes = await fetch(`${BASE}/acts/${ACTOR_ID}/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: queries,
      language: "da",
      maxCrawledPlacesPerSearch: 15,
      includeReviews: false,
      includeImages: false,
    }),
  });
  if (!runRes.ok) throw new Error(`Apify start failed: ${runRes.status}`);
  const { data: run } = await runRes.json();
  const runId: string = run.id;

  // Poll until done (max 5 min)
  const deadline = Date.now() + 5 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000));
    const statusRes = await fetch(`${BASE}/actor-runs/${runId}?token=${token}`);
    const { data: statusData } = await statusRes.json();
    if (statusData.status === "SUCCEEDED") break;
    if (statusData.status === "FAILED" || statusData.status === "ABORTED") {
      throw new Error(`Apify run ${statusData.status}`);
    }
  }

  // Fetch results
  const datasetRes = await fetch(
    `${BASE}/actor-runs/${runId}/dataset/items?token=${token}&format=json&clean=true`
  );
  if (!datasetRes.ok) throw new Error("Failed to fetch dataset");
  const items = await datasetRes.json();

  return items as ApifyPlace[];
}

export function scoreLead(place: ApifyPlace): number {
  let score = 0;

  // Rating × reviews signal (max ~35 pts)
  const rating = place.totalScore ?? 0;
  const reviews = place.reviewsCount ?? 0;
  if (rating > 0 && reviews > 0) {
    const normalized = Math.min((rating * Math.log10(reviews + 1)) / (5 * 2), 1);
    score += Math.round(normalized * 35);
  }

  // Website status
  if (!place.website) {
    score += 30; // no website — ideal lead
  } else {
    score += 0; // has website — still worth calling
  }

  // Has a claimed Google profile (has reviews)
  if (reviews > 0) score += 10;

  return Math.min(score, 100);
}

export function detectWebsiteStatus(website: string | null): "none" | "ok" {
  if (!website) return "none";
  return "ok";
}
