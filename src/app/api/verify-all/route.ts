import { NextResponse } from "next/server";
import { getLeads, batchUpdateLeadVerifications, websiteQualityBonus } from "@/lib/sheets";
import type { WebsiteQualityTier } from "@/lib/sheets";

export const maxDuration = 300;

// Re-uses website analysis logic inline (avoids circular imports)
function detectCms(html: string): string | null {
  if (/wp-content|wp-includes|wordpress/i.test(html)) return "WordPress";
  if (/wix\.com|wixstatic/i.test(html)) return "Wix";
  if (/squarespace\.com/i.test(html)) return "Squarespace";
  if (/jimdo\.com/i.test(html)) return "Jimdo";
  if (/webnode\.com/i.test(html)) return "Webnode";
  if (/one\.com|one-com/i.test(html)) return "One.com";
  if (/weebly\.com/i.test(html)) return "Weebly";
  return null;
}

function extractCopyrightYear(html: string): number | null {
  const matches = html.match(/©\s*(\d{4})|copyright\s*[©]?\s*(\d{4})/gi);
  if (!matches) return null;
  const years = matches
    .map(m => m.match(/\d{4}/)?.[0])
    .filter(Boolean)
    .map(Number)
    .filter(y => y >= 1995 && y <= 2030);
  if (!years.length) return null;
  return Math.max(...years);
}

function extractJQueryVersion(html: string): string | null {
  const m = html.match(/jquery[.-](\d+\.\d+(?:\.\d+)?)/i);
  return m ? m[1] : null;
}

function extractEmailFromHtml(html: string): string | null {
  const mailto = html.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const bare = html.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (bare) {
    const addr = bare[1].toLowerCase();
    if (!/noreply|example|sentry|w3\.org|name@domain|user@domain|email@email|your@|test@test/i.test(addr)) return addr;
  }
  return null;
}

async function analyzeUrl(url: string): Promise<{ tier: WebsiteQualityTier; email: string | null }> {
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  // Social media pages are not real websites — treat as dead (no real web presence)
  if (/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|tiktok\.com/i.test(fullUrl)) {
    return { tier: "dead", email: null };
  }
  try {
    const res = await fetch(fullUrl, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" },
    });
    if (!res.ok) return { tier: "dead", email: null };

    const html = await res.text();
    const email = extractEmailFromHtml(html);
    const now = new Date().getFullYear();
    const cms = detectCms(html);
    const copyrightYear = extractCopyrightYear(html);
    const mobileReady = /viewport/i.test(html);
    const hasSchemaOrg = /schema\.org/i.test(html);
    const hasSocialMeta = /property=["']og:|name=["']twitter:/i.test(html);
    const hasModernImages = /\.webp/i.test(html);
    const jQueryVersion = extractJQueryVersion(html);
    const age = copyrightYear ? now - copyrightYear : null;

    let qualityScore = 50;
    if (!mobileReady) qualityScore -= 25;
    if (age !== null && age > 5) qualityScore -= 20;
    if (age !== null && age > 8) qualityScore -= 10;
    if (jQueryVersion) {
      const major = parseInt(jQueryVersion.split(".")[0]);
      if (major < 3) qualityScore -= 10;
    }
    if (hasSchemaOrg) qualityScore += 10;
    if (hasSocialMeta) qualityScore += 5;
    if (hasModernImages) qualityScore += 10;
    if (cms === "Wix" || cms === "Jimdo" || cms === "Webnode" || cms === "One.com") qualityScore -= 10;
    qualityScore = Math.max(0, Math.min(100, qualityScore));

    if (qualityScore >= 65) return { tier: "modern", email };
    if (qualityScore >= 35) return { tier: "mediocre", email };
    return { tier: "old", email };
  } catch {
    return { tier: "dead", email: null };
  }
}

export async function POST() {
  try {
    const leads = await getLeads();
    // Only process leads not yet verified — so repeat runs get faster as more get done
    const isSocialUrl = (url: string) => /facebook\.com|instagram\.com|linkedin\.com|twitter\.com|tiktok\.com/i.test(url);
    const allUnverified = leads.filter(l =>
      l.website && l.websiteStatus !== "none" &&
      (!l.websiteQualityTier || isSocialUrl(l.website))
    );
    const withWebsite = allUnverified.slice(0, 200);
    const remaining = Math.max(0, allUnverified.length - withWebsite.length);

    const results: { id: string; name: string; tier: WebsiteQualityTier; newScore: number }[] = [];
    const sheetUpdates: { rowIndex: number; qualityTier: WebsiteQualityTier; adjustedScore: number; email?: string }[] = [];

    // Analyze all websites first (parallel HTTP requests, small concurrency limit)
    const CONCURRENCY = 5;
    for (let i = 0; i < withWebsite.length; i += CONCURRENCY) {
      const batch = withWebsite.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map(async (lead) => {
        const { tier, email } = await analyzeUrl(lead.website);
        const bonus = websiteQualityBonus(tier, lead.websiteStatus);
        const baseScore = Math.min(lead.score, 55);
        const newScore = Math.min(100, baseScore + bonus);
        return { lead, tier, newScore, email };
      }));
      for (const { lead, tier, newScore, email } of batchResults) {
        results.push({ id: lead.id, name: lead.name, tier, newScore });
        sheetUpdates.push({
          rowIndex: parseInt(lead.id) - 2,
          qualityTier: tier,
          adjustedScore: newScore,
          // Only include email if we found one and the lead doesn't already have one
          email: (email && !lead.email) ? email : undefined,
        });
      }
    }

    // Single Sheets API call for everything — scores, tiers, and emails
    await batchUpdateLeadVerifications(sheetUpdates);

    return NextResponse.json({ verified: results.length, remaining, results });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
