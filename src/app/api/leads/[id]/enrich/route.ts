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
  email: string | null;
  summary: string;
}

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" };

function extractEmail(text: string): string | null {
  const mailto = text.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const bare = text.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (bare) {
    const addr = bare[1].toLowerCase();
    if (!addr.includes("noreply") && !addr.includes("example") && !addr.includes("sentry") && !addr.includes("w3.org")) {
      return addr;
    }
  }
  return null;
}

function extractPhone(text: string): string | null {
  // Danish phone: 8 digits, optionally prefixed +45
  const m = text.match(/(?:\+45[\s.]?)?(\d{2}[\s.]\d{2}[\s.]\d{2}[\s.]\d{2}|\d{8})/);
  return m ? m[0].trim() : null;
}

// Fetch page content via Jina Reader — works on JS-rendered sites
async function fetchViaJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url.startsWith("http") ? url : `https://${url}`}`;
    const res = await fetch(jinaUrl, {
      headers: { ...HEADERS, "Accept": "text/plain", "X-Return-Format": "markdown" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 100 ? text : null;
  } catch {
    return null;
  }
}

// Also fetch raw HTML for email/phone extraction and Facebook link detection
async function fetchRawHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url.startsWith("http") ? url : `https://${url}`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function parseWebsiteContent(markdown: string, branch: string) {
  const lines = markdown.split("\n").map(l => l.trim()).filter(Boolean);

  // Description: first substantial non-heading paragraph
  const description = lines.find(l =>
    !l.startsWith("#") && !l.startsWith("*") && !l.startsWith("-") &&
    !l.startsWith("|") && !l.startsWith("!") && !l.startsWith("[") &&
    l.length > 60
  ) ?? "";

  // Headings: lines starting with # (strip the # prefix)
  const headings = lines
    .filter(l => /^#{1,3}\s/.test(l))
    .map(l => l.replace(/^#+\s*/, "").trim())
    .filter(l => l.length > 2 && l.length < 80)
    .slice(0, 6);

  // Services: bullet/list lines that look like service descriptions
  const danishServiceWords = [
    "renovering", "installation", "reparation", "montage", "service", "vedligehold",
    "konsultation", "rådgivning", "projektering", "design", "klipning", "farvning",
    "behandling", "massage", "rengøring", "maling", "tapetsering", "gulv", "tag",
    "facade", "isolering", "VVS", "el-arbejde", "tømrerarbejde", "snedkerarbejde",
    "hjemmeside", "webdesign", "SEO", "markedsføring",
  ];
  const fullText = markdown.replace(/[#*\-|!]/g, " ");
  const foundServices = danishServiceWords.filter(w => new RegExp(w, "i").test(fullText));
  if (foundServices.length === 0 && branch) foundServices.push(branch);

  const phone = extractPhone(markdown);
  const email = extractEmail(markdown);

  return { description: description.slice(0, 300), headings, services: foundServices.slice(0, 5), phone, email };
}

function findFacebookInHtml(html: string): string | null {
  const m = html.match(/facebook\.com\/([A-Za-z0-9._%-]{3,50})(?:["'\/?])/);
  if (!m) return null;
  const slug = m[1];
  if (["sharer", "share", "plugins", "tr", "dialog", "photo"].includes(slug)) return null;
  return `https://www.facebook.com/${slug}`;
}

async function fetchFacebookMeta(fbUrl: string): Promise<{ url: string; description: string; category: string } | null> {
  try {
    const res = await fetch(fbUrl, { signal: AbortSignal.timeout(8000), headers: HEADERS });
    if (!res.ok) return null;
    const html = await res.text();
    const descMatch =
      html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']{10,300})["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']{10,300})["'][^>]+(?:name|property)=["'](?:description|og:description)["']/i);
    const description = descMatch?.[1]?.trim() ?? "";
    if (!description || html.includes("This page isn't available")) return null;
    return { url: fbUrl, description, category: "" };
  } catch {
    return null;
  }
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

  let rawHtml = "";

  if (lead.website) {
    // Fetch both Jina (clean content) and raw HTML (emails, FB links) in parallel
    const [markdown, html] = await Promise.all([
      fetchViaJina(lead.website),
      fetchRawHtml(lead.website),
    ]);

    rawHtml = html ?? "";

    if (markdown) {
      const parsed = parseWebsiteContent(markdown, lead.branch);
      // Prefer email from raw HTML (more reliable for mailto: links)
      const emailFromHtml = rawHtml ? extractEmail(rawHtml) : null;
      const emailFromMarkdown = parsed.email;
      const bestEmail = emailFromHtml ?? emailFromMarkdown;

      result.website = {
        description: parsed.description,
        headings: parsed.headings,
        services: parsed.services,
        phone: parsed.phone,
        email: bestEmail,
      };
      if (bestEmail) result.email = bestEmail;
    } else if (rawHtml) {
      // Jina failed — fall back to basic raw HTML extraction
      const email = extractEmail(rawHtml);
      const phone = extractPhone(rawHtml);
      result.website = { description: "", headings: [], services: [lead.branch].filter(Boolean), phone, email };
      if (email) result.email = email;
    }
  }

  // Find Facebook: prefer link found in website HTML, then guess from name
  let fbUrl: string | null = rawHtml ? findFacebookInHtml(rawHtml) : null;

  if (!fbUrl) {
    const slugCandidates = [
      lead.name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, ""),
      lead.name.toLowerCase().replace(/\s+/g, "."),
    ];
    for (const slug of slugCandidates) {
      if (slug.length < 3) continue;
      try {
        const res = await fetch(`https://www.facebook.com/${slug}`, {
          signal: AbortSignal.timeout(5000), headers: HEADERS,
        });
        if (res.ok) {
          const html = await res.text();
          const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
          if (title && !html.includes("This page isn't available") && !html.includes("siden er ikke tilgængelig")) {
            fbUrl = `https://www.facebook.com/${slug}`;
            break;
          }
        }
      } catch { /* not found */ }
    }
  }

  if (fbUrl) result.facebook = await fetchFacebookMeta(fbUrl);

  // Build Danish summary from real content
  const parts: string[] = [];
  if (result.website?.description) parts.push(result.website.description);
  if (result.website?.services?.length) parts.push(`Ydelser: ${result.website.services.join(", ")}.`);
  if (result.facebook?.description) parts.push(`Facebook: ${result.facebook.description.slice(0, 200)}`);
  if (!lead.website && !result.facebook) {
    parts.push("Ingen hjemmeside eller Facebook fundet automatisk. Brug søgelinket til at tjekke manuelt.");
  }
  result.summary = parts.join(" ").slice(0, 600);

  // Save to sheet
  try {
    const rowIndex = parseInt(lead.id) - 2;
    await saveEnrichedInfo(rowIndex, JSON.stringify(result));
    if (result.email && !lead.email) {
      await saveLeadEmail(rowIndex, result.email);
    }
  } catch { /* don't fail if save fails */ }

  return NextResponse.json(result);
}
