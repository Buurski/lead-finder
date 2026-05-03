import { NextRequest, NextResponse } from "next/server";
import { getLeads, saveEnrichedInfo, saveLeadEmail } from "@/lib/sheets";

export const maxDuration = 300;

const BASE = "https://api.apify.com/v2";

export interface DeepResearch {
  fetchedAt: string;
  businessName: string;
  branch: string;
  city: string;
  website: string;
  // From website crawl
  websitePages: { url: string; title: string; text: string }[];
  websiteSummary: string;      // all page text combined, cleaned
  // From Google Maps
  googleDescription: string;
  googleCategories: string[];
  googleHours: string;
  googleReviewCount: number;
  googleRating: number;
  // From Facebook (if found)
  facebookUrl: string;
  facebookDescription: string;
  // Email (from website or Google Maps)
  email: string;
  // For CLAUDE.md
  autoFilledBrief: {
    customers: string;
    services: string;
    tone: string;
    colorVibe: string;
    differentiator: string;
    hasLogo: string;
  };
}

async function waitForRun(runId: string, token: string, timeoutMs = 180_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 5000));
    const res = await fetch(`${BASE}/actor-runs/${runId}?token=${token}`);
    const { data } = await res.json();
    if (data.status === "SUCCEEDED") return true;
    if (data.status === "FAILED" || data.status === "ABORTED") return false;
  }
  return false;
}

async function crawlWebsite(url: string, token: string): Promise<{ url: string; title: string; text: string }[]> {
  const startUrl = url.startsWith("http") ? url : `https://${url}`;
  const res = await fetch(`${BASE}/acts/apify~website-content-crawler/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url: startUrl }],
      maxCrawlPages: 8,
      crawlerType: "cheerio",
      removeCookieWarnings: true,
      htmlTransformer: "readableText",
    }),
  });
  if (!res.ok) return [];
  const { data: run } = await res.json();
  const ok = await waitForRun(run.id, token, 120_000);
  if (!ok) return [];
  const dataRes = await fetch(`${BASE}/actor-runs/${run.id}/dataset/items?token=${token}&format=json&clean=true`);
  if (!dataRes.ok) return [];
  const items = await dataRes.json();
  return items.map((item: { url?: string; title?: string; text?: string; markdown?: string }) => ({
    url: item.url ?? "",
    title: item.title ?? "",
    text: (item.text ?? item.markdown ?? "").slice(0, 2000),
  })).slice(0, 8);
}

async function googleMapsLookup(name: string, city: string, token: string) {
  const res = await fetch(`${BASE}/acts/compass~crawler-google-places/runs?token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchStringsArray: [`${name} ${city}`],
      language: "da",
      maxCrawledPlacesPerSearch: 3,
      includeReviews: false,
    }),
  });
  if (!res.ok) return null;
  const { data: run } = await res.json();
  const ok = await waitForRun(run.id, token, 90_000);
  if (!ok) return null;
  const dataRes = await fetch(`${BASE}/actor-runs/${run.id}/dataset/items?token=${token}&format=json&clean=true`);
  if (!dataRes.ok) return null;
  const items = await dataRes.json();
  // Find best match by name similarity
  const match = items.find((p: { title?: string }) =>
    p.title?.toLowerCase().includes(name.toLowerCase().split(" ")[0])
  ) ?? items[0];
  return match ?? null;
}

function extractMeta(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']{5,300})["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']{5,300})["'][^>]+(?:name|property)=["']${name}["']`, "i"));
  return m ? m[1].trim() : "";
}

async function fetchFacebookDescription(fbUrl: string): Promise<string> {
  try {
    const res = await fetch(fbUrl, {
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
    });
    if (!res.ok) return "";
    const html = await res.text();
    return extractMeta(html, "description") || extractMeta(html, "og:description");
  } catch { return ""; }
}

function inferAutoFill(
  pages: { title: string; text: string }[],
  googleDesc: string,
  googleCategories: string[],
  branch: string,
  googleRating: number,
  googleReviewCount: number,
  facebookDesc: string,
  website: string,
  facebookUrl: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gmaps: any,
) {
  const rawText = pages.map(p => p.text).join("\n");
  const allText = rawText.toLowerCase();

  // ── CUSTOMERS ───────────────────────────────────────────────
  let customers = "";
  const hasBusiness = /erhverv|virksomhed|firma|b2b|industri|bolig.?forening|andelsbolig/i.test(allText);
  const hasPrivate  = /private?|boligejer|husejere|villaejer|lejlighedsejer|hjem/i.test(allText);
  if (hasBusiness && hasPrivate) customers = "Både private og erhvervskunder";
  else if (hasBusiness)          customers = "Erhvervskunder og virksomheder";
  else if (hasPrivate)           customers = "Private boligejere og husejere";
  else {
    // Fall back on branch type
    if (/frisør|skønhed|wellness|spa|klinik|terapeut/i.test(branch))
      customers = "Private kunder, primært lokale";
    else if (/tømrer|maler|VVS|elektriker|murer|gulv|tag|facade/i.test(branch))
      customers = "Private boligejere og mindre erhvervskunder i lokalområdet";
    else
      customers = "Private og erhvervskunder i lokalområdet";
  }

  // ── SERVICES ────────────────────────────────────────────────
  // Try to pull explicit service lines from the website text
  const serviceLines: string[] = [];

  // Match "Vi tilbyder: X, Y, Z" or "Vores ydelser: ..." patterns
  const offerPatterns = rawText.match(
    /(?:vi tilbyder|vores ydelser|vores services?|hvad vi laver|vi udfører)[:\s–-]+([^\n.]{15,300})/gi
  ) ?? [];
  for (const m of offerPatterns) {
    const cleaned = m.replace(/vi tilbyder|vores ydelser|vores services?|hvad vi laver|vi udfører/gi, "").replace(/^[:\s–-]+/, "").trim();
    if (cleaned.length > 10) serviceLines.push(cleaned);
  }

  // Pull headings that look like service names (h2/h3-ish capitalized lines)
  const headingMatches = rawText.match(/^#{1,3}\s+(.{8,60})$/gm) ?? [];
  const serviceHeadings = headingMatches
    .map(h => h.replace(/^#+\s+/, "").trim())
    .filter(h => !/om os|kontakt|forside|menu|hjem|blog|nyheder|galleri/i.test(h))
    .slice(0, 6);
  if (serviceHeadings.length > 2) serviceLines.push(...serviceHeadings);

  // Use Google categories as a reliable fallback
  const catServices = googleCategories
    .filter(c => !/^(Virksomhed|Firma|Forretning|Service|Local)$/i.test(c))
    .slice(0, 4);

  let services: string;
  if (serviceLines.length > 0) {
    services = serviceLines.slice(0, 4).join("\n");
  } else if (catServices.length > 0) {
    services = catServices.join(", ");
  } else if (googleDesc) {
    services = googleDesc.slice(0, 300);
  } else {
    services = branch;
  }

  // ── TONE ────────────────────────────────────────────────────
  let tone = "";
  if (/familieejet|generations|tradition|siden \d{4}|år erfaring/i.test(allText))
    tone = "traditionel, troværdig, familieorienteret";
  else if (/moderne|innovativ|ny teknologi|up-to-date|opdateret/i.test(allText))
    tone = "moderne, professionel, innovativ";
  else if (/personlig|nærværende|omsorgsfuld|tæt dialog|altid klar/i.test(allText))
    tone = "personlig, nærværende, troværdig";
  else if (/erfaren|specialist|ekspert|faglig|certificer/i.test(allText))
    tone = "faglig, erfaren, troværdig";
  else if (googleReviewCount > 50)
    tone = "etableret, troværdig, lokal";
  else
    tone = "troværdig, lokal, professionel";

  // ── COLOR VIBE ──────────────────────────────────────────────
  let colorVibe = "";
  if (/tømrer|snedker|murer|tagdæk|gulv/i.test(branch))
    colorVibe = "varm, jordet, solid — træ-toner og naturlige farver";
  else if (/maler|facad/i.test(branch))
    colorVibe = "frisk, ren, professionel — hvid og stærke accenter";
  else if (/VVS|blikkensla|varme|sanitær/i.test(branch))
    colorVibe = "professionel blå, teknisk, pålidelig";
  else if (/elektriker|el-/i.test(branch))
    colorVibe = "ren, teknisk, sikker — blå eller gul accent";
  else if (/frisør|hår/i.test(branch))
    colorVibe = "lys, stilren, indbydende — neutral med varm accent";
  else if (/skønhed|wellness|spa|massage/i.test(branch))
    colorVibe = "rolig, lys, luksuriøs — bløde neutrale toner";
  else if (/læge|tandlæge|klinik|terapeut/i.test(branch))
    colorVibe = "ren, tryg, professionel — hvid og lyseblå";
  else if (/restaurant|cafe|mad/i.test(branch))
    colorVibe = "varm, indbydende, appetitlig";
  else
    colorVibe = "professionel, neutral, lokal";

  // ── DIFFERENTIATOR ──────────────────────────────────────────
  let differentiator = "";

  // Explicit "why us" section
  const whyMatch = rawText.match(
    /(?:vi adskiller|det særlige ved|hvorfor vælge|vores styrke|hvad gør os|det unikke)[^\n.]{0,10}[:\s–-]+([^\n]{20,300})/i
  );
  if (whyMatch) {
    differentiator = whyMatch[1].trim();
  } else {
    // Build from signals
    const parts: string[] = [];
    if (/siden \d{4}/.test(allText)) {
      const yearMatch = allText.match(/siden (\d{4})/);
      if (yearMatch) parts.push(`Erfaring siden ${yearMatch[1]}`);
    }
    if (/familieejet|familiebedrift/i.test(allText)) parts.push("familieejet virksomhed");
    if (/garanti|garanterer/i.test(allText)) parts.push("garanti på arbejdet");
    if (/gratis tilbud|gratis besigtigelse/i.test(allText)) parts.push("gratis tilbud");
    if (/certificer|autoriseret|godkendt/i.test(allText)) parts.push("certificeret/autoriseret håndværker");
    if (googleRating >= 4.5 && googleReviewCount >= 10)
      parts.push(`${googleRating}/5 på Google (${googleReviewCount} anmeldelser)`);
    if (facebookDesc && facebookDesc.length > 20) parts.push(facebookDesc.slice(0, 100));

    differentiator = parts.length > 0
      ? parts.join(" · ")
      : "Lokalt forankret med personlig service og faglig ekspertise";
  }

  // ── HAS LOGO ────────────────────────────────────────────────
  // Strong yes signals: logo mentioned on their own website, Google Maps has image, Facebook has profile
  const websiteHasLogoMention = /logo/i.test(allText);
  const gmapsHasImage = !!(gmaps?.imageUrl || gmaps?.thumbnailUrl || (gmaps?.images?.length > 0));
  const hasFacebook = !!facebookUrl;
  const hasWebsite = !!website;

  let hasLogo: string;
  if (websiteHasLogoMention || gmapsHasImage) {
    hasLogo = "Ja — logo fundet på hjemmeside/Google Maps";
  } else if (hasWebsite && pages.length > 1) {
    // Established enough to have a website with multiple pages — probably has a logo
    hasLogo = "Sandsynligvis ja — har hjemmeside";
  } else if (hasFacebook) {
    hasLogo = "Måske — tjek Facebook-profilbillede";
  } else if (hasWebsite) {
    hasLogo = "Måske — hjemmesiden blev analyseret men logo ikke bekræftet";
  } else {
    hasLogo = "Ukendt — ingen hjemmeside fundet, spørg kunden";
  }

  return {
    customers,
    services: services.slice(0, 500),
    tone,
    colorVibe,
    differentiator: differentiator.slice(0, 400),
    hasLogo,
  };
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = process.env.APIFY_TOKEN;
  if (!token) return NextResponse.json({ error: "APIFY_TOKEN not set" }, { status: 500 });

  let lead;
  try {
    const leads = await getLeads();
    lead = leads.find(l => l.id === id);
  } catch {
    return NextResponse.json({ error: "Could not load leads" }, { status: 500 });
  }
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const result: DeepResearch = {
    fetchedAt: new Date().toISOString(),
    businessName: lead.name,
    branch: lead.branch,
    city: lead.city,
    website: lead.website,
    websitePages: [],
    websiteSummary: "",
    googleDescription: "",
    googleCategories: [],
    googleHours: "",
    googleReviewCount: 0,
    googleRating: 0,
    facebookUrl: "",
    facebookDescription: "",
    email: "",
    autoFilledBrief: { customers: "", services: "", tone: "", colorVibe: "", differentiator: "", hasLogo: "" },
  };

  // Run website crawl and Google Maps lookup in parallel
  const [pages, gmaps] = await Promise.all([
    lead.website ? crawlWebsite(lead.website, token) : Promise.resolve([]),
    googleMapsLookup(lead.name, lead.city, token),
  ]);

  result.websitePages = pages;
  result.websiteSummary = pages.map(p => `## ${p.title}\n${p.text}`).join("\n\n");

  if (gmaps) {
    result.googleDescription = gmaps.description ?? "";
    result.googleCategories = [gmaps.categoryName, ...(gmaps.categories ?? [])].filter(Boolean).slice(0, 5);
    result.googleHours = gmaps.openingHours?.map((h: { day: string; hours: string }) => `${h.day}: ${h.hours}`).join(", ") ?? "";
    result.googleReviewCount = gmaps.reviewsCount ?? 0;
    result.googleRating = gmaps.totalScore ?? 0;
    // Facebook from Google Maps social links
    const fbFromMaps = gmaps.socialProfiles?.find((s: { name: string; url: string }) => s.name?.toLowerCase().includes("facebook"))?.url ?? "";
    if (fbFromMaps) {
      result.facebookUrl = fbFromMaps;
      result.facebookDescription = await fetchFacebookDescription(fbFromMaps);
    }
  }

  // Try to find Facebook from website if not found via Maps
  if (!result.facebookUrl && pages.length > 0) {
    const allHtml = pages.map(p => p.text).join(" ");
    const fbMatch = allHtml.match(/facebook\.com\/([A-Za-z0-9._%-]{3,50})(?:\s|\/|"|')/);
    if (fbMatch && !["sharer", "share", "plugins", "tr"].includes(fbMatch[1])) {
      result.facebookUrl = `https://www.facebook.com/${fbMatch[1]}`;
      result.facebookDescription = await fetchFacebookDescription(result.facebookUrl);
    }
  }

  // ── EMAIL ───────────────────────────────────────────────────
  // Try Google Maps email field first, then scan website page text
  const gmapsEmail: string = gmaps?.email ?? "";
  if (gmapsEmail) {
    result.email = gmapsEmail;
  } else {
    const allPageText = pages.map(p => p.text).join("\n");
    const mailtoMatch = allPageText.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    const bareMatch   = allPageText.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
    const candidate = mailtoMatch?.[1] ?? bareMatch?.[1] ?? "";
    if (candidate && !/noreply|example|sentry|w3\.org/i.test(candidate)) {
      result.email = candidate.toLowerCase();
    }
  }

  result.autoFilledBrief = inferAutoFill(
    pages,
    result.googleDescription,
    result.googleCategories,
    lead.branch,
    result.googleRating,
    result.googleReviewCount,
    result.facebookDescription,
    lead.website,
    result.facebookUrl,
    gmaps,
  );

  // Save to Sheets column M (enrichedInfo) + N (email)
  try {
    const rowIndex = parseInt(lead.id) - 2;
    await saveEnrichedInfo(rowIndex, JSON.stringify({ ...result, type: "deep" }));
    if (result.email && !lead.email) {
      await saveLeadEmail(rowIndex, result.email);
    }
  } catch { /* don't fail */ }

  return NextResponse.json(result);
}
