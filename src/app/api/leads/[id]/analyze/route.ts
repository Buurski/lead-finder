import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";

export interface WebsiteAnalysis {
  url: string;
  alive: boolean;
  https: boolean;
  // Detected tech / age signals
  cms: string | null;           // "WordPress", "Wix", "Jimdo", "Squarespace", etc.
  copyrightYear: number | null; // last year found in footer copyright
  mobileReady: boolean;
  hasGoogleFonts: boolean;
  hasSchemaOrg: boolean;
  hasSocialMeta: boolean;       // og: / twitter: meta
  hasModernImages: boolean;     // webp
  jQueryVersion: string | null;
  // Overall quality tier
  qualityTier: "modern" | "mediocre" | "old" | "dead";
  qualityScore: number;         // 0–100, higher = better website
  // Displayed text
  summary: string;              // 1-sentence verdict
  details: string[];            // bullet-point observations
  opportunity: string;          // why this is good/bad for a sale pitch
}

export interface AnalysisResult {
  website: WebsiteAnalysis | null;
  noWebsite: boolean;
  facebook: { searchUrl: string; directUrl: string | null };
  googleMaps: string;
}

function detectCms(html: string): string | null {
  if (/wp-content|wp-includes|wordpress/i.test(html)) return "WordPress";
  if (/wix\.com|wixstatic/i.test(html)) return "Wix";
  if (/squarespace\.com/i.test(html)) return "Squarespace";
  if (/jimdo\.com/i.test(html)) return "Jimdo";
  if (/webnode\.com/i.test(html)) return "Webnode";
  if (/one\.com|one-com/i.test(html)) return "One.com";
  if (/weebly\.com/i.test(html)) return "Weebly";
  if (/shopify/i.test(html)) return "Shopify";
  if (/drupal/i.test(html)) return "Drupal";
  if (/joomla/i.test(html)) return "Joomla";
  return null;
}

function extractCopyrightYear(html: string): number | null {
  const matches = html.match(/©\s*(\d{4})|copyright\s*[©]?\s*(\d{4})/gi);
  if (!matches) return null;
  const years = matches
    .map(m => m.match(/\d{4}/)?.[0])
    .filter(Boolean)
    .map(Number)
    .filter(y => y >= 1990 && y <= 2030);
  if (!years.length) return null;
  return Math.max(...years);
}

function extractJQueryVersion(html: string): string | null {
  const m = html.match(/jquery[.-](\d+\.\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

function analyzeWebsite(url: string, html: string): WebsiteAnalysis {
  const cms = detectCms(html);
  const copyrightYear = extractCopyrightYear(html);
  const mobileReady = /viewport/i.test(html);
  const hasGoogleFonts = /fonts\.googleapis/i.test(html);
  const hasSchemaOrg = /schema\.org/i.test(html);
  const hasSocialMeta = /property=["']og:|name=["']twitter:/i.test(html);
  const hasModernImages = /\.webp/i.test(html);
  const jQueryVersion = extractJQueryVersion(html);

  const now = new Date().getFullYear();
  const age = copyrightYear ? now - copyrightYear : null;

  // Score: higher = better website (bad for us, good for them)
  let qualityScore = 50;
  if (!mobileReady) qualityScore -= 25;
  if (age !== null && age > 5) qualityScore -= 20;
  if (age !== null && age > 8) qualityScore -= 10;
  if (jQueryVersion) {
    const major = parseInt(jQueryVersion.split(".")[0]);
    if (major < 3) qualityScore -= 10;
  }
  if (hasGoogleFonts) qualityScore += 5;
  if (hasSchemaOrg) qualityScore += 10;
  if (hasSocialMeta) qualityScore += 5;
  if (hasModernImages) qualityScore += 10;
  if (cms === "Wix" || cms === "Jimdo" || cms === "Webnode" || cms === "One.com") qualityScore -= 10;
  qualityScore = Math.max(0, Math.min(100, qualityScore));

  let qualityTier: WebsiteAnalysis["qualityTier"];
  if (qualityScore >= 65) qualityTier = "modern";
  else if (qualityScore >= 35) qualityTier = "mediocre";
  else qualityTier = "old";

  // Build Danish details
  const details: string[] = [];

  if (cms) {
    details.push(`Lavet i ${cms}${copyrightYear && age && age > 3 ? ` (sidst opdateret ca. ${copyrightYear})` : ""}`);
  } else if (copyrightYear) {
    details.push(`Copyright sidst opdateret ${copyrightYear}${age && age > 3 ? ` — ${age} år gammel` : ""}`);
  }

  if (!mobileReady) details.push("Ikke mobilvenlig — ser dårlig ud på telefon");
  else details.push("Mobilvenlig");

  if (jQueryVersion) {
    const major = parseInt(jQueryVersion.split(".")[0]);
    if (major < 3) details.push(`Bruger gammel jQuery v${jQueryVersion}`);
  }

  if (!hasSocialMeta) details.push("Ingen deling på sociale medier sat op");
  if (!hasSchemaOrg) details.push("Mangler strukturerede data (dårligt for Google)");
  if (cms === "Wix" || cms === "Jimdo" || cms === "One.com") {
    details.push(`${cms}-sites er typisk langsomme og svære at ranke på Google`);
  }
  if (hasModernImages) details.push("Bruger moderne billedformat (WebP)");

  // Summary and opportunity
  let summary: string;
  let opportunity: string;

  if (qualityTier === "old") {
    summary = age && age > 5
      ? `Hjemmesiden er ${age} år gammel og viser det tydeligt.`
      : "Hjemmesiden er forældet og trænger til et komplet redesign.";
    opportunity = "Stærk salgsmulighed — kunden har en hjemmeside der aktivt skader deres troværdighed.";
  } else if (qualityTier === "mediocre") {
    summary = "Hjemmesiden fungerer, men er middelmådig og skiller sig ikke ud.";
    opportunity = "God mulighed — de har prøvet det men fået et generisk resultat. Et professionelt redesign er let at sælge.";
  } else {
    summary = "Hjemmesiden er relativt moderne og velfungerende.";
    opportunity = "Svær salgsmulighed — kunden er sandsynligvis tilfreds med deres nuværende hjemmeside.";
  }

  return {
    url,
    alive: true,
    https: url.startsWith("https"),
    cms,
    copyrightYear,
    mobileReady,
    hasGoogleFonts,
    hasSchemaOrg,
    hasSocialMeta,
    hasModernImages,
    jQueryVersion,
    qualityTier,
    qualityScore,
    summary,
    details,
    opportunity,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let lead;
  try {
    const leads = await getLeads();
    lead = leads.find((l) => l.id === id);
  } catch {
    return NextResponse.json({ error: "Could not load leads" }, { status: 500 });
  }

  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const result: AnalysisResult = {
    website: null,
    noWebsite: !lead.website,
    facebook: {
      searchUrl: `https://www.facebook.com/search/top?q=${encodeURIComponent(lead.name + " " + lead.city)}`,
      directUrl: null,
    },
    googleMaps: `https://maps.google.com/?q=${encodeURIComponent(lead.name + " " + lead.city)}`,
  };

  if (lead.website) {
    const url = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
      });
      if (res.ok) {
        const html = await res.text();
        result.website = analyzeWebsite(url, html);
        // Detect Facebook link in page source
        const fbMatch = html.match(/facebook\.com\/([A-Za-z0-9._%-]{3,50})(?:["'\/?])/);
        if (fbMatch && !["sharer", "share", "plugins", "tr", "dialog"].includes(fbMatch[1])) {
          result.facebook.directUrl = `https://www.facebook.com/${fbMatch[1]}`;
        }
      } else {
        result.website = {
          url, alive: false, https: url.startsWith("https"),
          cms: null, copyrightYear: null, mobileReady: false,
          hasGoogleFonts: false, hasSchemaOrg: false, hasSocialMeta: false,
          hasModernImages: false, jQueryVersion: null,
          qualityTier: "dead", qualityScore: 0,
          summary: "Hjemmesiden svarer ikke — sandsynligvis nede eller fjernet.",
          details: [`Serveren returnerede fejl (HTTP ${res.status})`],
          opportunity: "Fremragende mulighed — de betaler sandsynligvis stadig for en hjemmeside der ikke virker.",
        };
      }
    } catch {
      result.website = {
        url, alive: false, https: url.startsWith("https"),
        cms: null, copyrightYear: null, mobileReady: false,
        hasGoogleFonts: false, hasSchemaOrg: false, hasSocialMeta: false,
        hasModernImages: false, jQueryVersion: null,
        qualityTier: "dead", qualityScore: 0,
        summary: "Hjemmesiden kan ikke nås — timeout eller DNS-fejl.",
        details: ["Siden svarer ikke indenfor 10 sekunder"],
        opportunity: "Fremragende mulighed — de betaler sandsynligvis stadig for en hjemmeside der ikke virker.",
      };
    }
  }

  return NextResponse.json(result);
}
