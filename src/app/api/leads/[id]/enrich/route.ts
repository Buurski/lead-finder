import { NextRequest, NextResponse } from "next/server";
import { getLeads, saveEnrichedInfo, saveLeadEmail } from "@/lib/sheets";

export interface EnrichedInfo {
  fetchedAt: string;
  website: {
    description: string;
    headings: string[];
    services: string[];
    phone: string | null;
    email: string | null;
  } | null;
  facebook: {
    url: string;
    description: string;
    category: string;
  } | null;
  facebookSearchUrl: string;
  email: string | null; // best email found
  summary: string; // plain Danish summary for display
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" };

function extractEmail(html: string): string | null {
  // Find mailto: links first (most reliable)
  const mailto = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  // Fall back to bare email addresses in visible text
  const bare = html.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (bare) {
    const addr = bare[1].toLowerCase();
    // Skip common non-business addresses
    if (!addr.includes("noreply") && !addr.includes("example") && !addr.includes("sentry") && !addr.includes("w3.org")) {
      return addr;
    }
  }
  return null;
}

function extractText(html: string, selector: RegExp): string {
  const m = html.match(selector);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : "";
}

function extractMeta(html: string, name: string): string {
  const m = html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']{5,300})["']`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']{5,300})["'][^>]+(?:name|property)=["']${name}["']`, "i"));
  return m ? m[1].trim() : "";
}

function extractHeadings(html: string): string[] {
  const matches = [...html.matchAll(/<h[123][^>]*>([^<]{3,80})<\/h[123]>/gi)];
  return [...new Set(matches.map(m => m[1].trim()))].slice(0, 6);
}

function detectServices(html: string, branch: string): string[] {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const danishServiceWords = [
    "renovering", "installation", "reparation", "montage", "service",
    "vedligehold", "konsultation", "rådgivning", "projektering", "design",
    "klipning", "farvning", "behandling", "massage", "rengøring",
    "maling", "tapetsering", "gulv", "tag", "facade", "isolering",
    "VVS", "el-arbejde", "tømrerarbejde", "snedkerarbejde",
  ];
  const found = danishServiceWords.filter(w => new RegExp(w, "i").test(text));
  if (found.length === 0 && branch) found.push(branch);
  return found.slice(0, 5);
}

async function fetchWebsiteInfo(url: string, branch: string) {
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      signal: AbortSignal.timeout(8000), headers: HEADERS,
    });
    if (!res.ok) return null;
    const html = await res.text();

    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      extractText(html, /<p[^>]*>([^<]{40,300})<\/p>/i) ||
      "";

    return {
      description,
      headings: extractHeadings(html),
      services: detectServices(html, branch),
      phone: html.match(/(?:tlf|telefon|ring)[^0-9]*(\+?45[\s.]?\d{2}[\s.]\d{2}[\s.]\d{2}[\s.]\d{2}|\d{8})/i)?.[1]?.trim() ?? null,
      email: extractEmail(html),
    };
  } catch {
    return null;
  }
}

async function fetchFacebookInfo(fbUrl: string) {
  try {
    const res = await fetch(fbUrl, {
      signal: AbortSignal.timeout(8000), headers: HEADERS,
    });
    if (!res.ok) return null;
    const html = await res.text();
    const description =
      extractMeta(html, "description") ||
      extractMeta(html, "og:description") ||
      "";
    const category = extractMeta(html, "og:type") || "";
    if (!description) return null;
    return { url: fbUrl, description, category };
  } catch {
    return null;
  }
}

async function findFacebookViaWebsite(websiteHtml: string): Promise<string | null> {
  const m = websiteHtml.match(/facebook\.com\/([A-Za-z0-9._%-]{3,50})(?:["'\/?])/);
  if (!m) return null;
  const slug = m[1];
  if (["sharer", "share", "plugins", "tr", "dialog", "photo"].includes(slug)) return null;
  return `https://www.facebook.com/${slug}`;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let lead;
  try {
    const leads = await getLeads();
    lead = leads.find(l => l.id === id);
  } catch {
    return NextResponse.json({ error: "Could not load leads" }, { status: 500 });
  }
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const result: EnrichedInfo = {
    fetchedAt: new Date().toISOString(),
    website: null,
    facebook: null,
    facebookSearchUrl: `https://www.facebook.com/search/pages/?q=${encodeURIComponent(lead.name + " " + lead.city)}`,
    email: null,
    summary: "",
  };

  let websiteHtml = "";

  // 1. Fetch website
  if (lead.website) {
    const url = lead.website.startsWith("http") ? lead.website : `https://${lead.website}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: HEADERS });
      if (res.ok) {
        websiteHtml = await res.text();
        const siteEmail = extractEmail(websiteHtml);
        result.website = {
          description:
            extractMeta(websiteHtml, "description") ||
            extractMeta(websiteHtml, "og:description") ||
            extractText(websiteHtml, /<p[^>]*>([^<]{40,300})<\/p>/i) ||
            "",
          headings: extractHeadings(websiteHtml),
          services: detectServices(websiteHtml, lead.branch),
          phone: websiteHtml.match(/(?:tlf|telefon|ring)[^0-9]*(\+?45[\s.]?\d{2}[\s.]\d{2}[\s.]\d{2}[\s.]\d{2}|\d{8})/i)?.[1]?.trim() ?? null,
          email: siteEmail,
        };
        if (siteEmail) result.email = siteEmail;
      }
    } catch { /* site unreachable */ }
  }

  // 2. Find Facebook — from website source first, then direct search
  let fbUrl: string | null = null;
  if (websiteHtml) fbUrl = await findFacebookViaWebsite(websiteHtml);

  // Try common Facebook URL patterns if not found via website
  if (!fbUrl) {
    const slugCandidates = [
      lead.name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, ""),
      lead.name.toLowerCase().replace(/\s+/g, "."),
    ];
    for (const slug of slugCandidates) {
      if (slug.length < 3) continue;
      const candidate = `https://www.facebook.com/${slug}`;
      try {
        const res = await fetch(candidate, { signal: AbortSignal.timeout(5000), headers: HEADERS });
        // Facebook returns 200 even for non-existent pages; check if it has og:title
        if (res.ok) {
          const html = await res.text();
          const title = extractMeta(html, "og:title");
          if (title && !html.includes("This page isn't available") && !html.includes("siden er ikke tilgængelig")) {
            fbUrl = candidate;
            break;
          }
        }
      } catch { /* not found */ }
    }
  }

  if (fbUrl) {
    result.facebook = await fetchFacebookInfo(fbUrl);
  }

  // 3. Build Danish summary
  const parts: string[] = [];
  if (result.website?.description) parts.push(result.website.description);
  if (result.website?.services?.length) parts.push(`Ydelser: ${result.website.services.join(", ")}.`);
  if (result.facebook?.description) parts.push(`Facebook: ${result.facebook.description}`);
  if (!lead.website && !result.facebook) {
    parts.push("Ingen hjemmeside eller Facebook fundet automatisk. Brug søgelinket til at tjekke manuelt.");
  }
  result.summary = parts.join(" ").slice(0, 600);

  // 4. Save to Sheets column M (enrichedInfo) + N (email)
  try {
    const rowIndex = parseInt(lead.id) - 2;
    await saveEnrichedInfo(rowIndex, JSON.stringify(result));
    if (result.email && !lead.email) {
      await saveLeadEmail(rowIndex, result.email);
    }
  } catch { /* don't fail the request if save fails */ }

  return NextResponse.json(result);
}
