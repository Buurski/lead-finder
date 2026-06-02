import { NextResponse } from "next/server";
import { promises as dns } from "dns";
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

// Real browser UA — the old "LeadBot/1.0" token tripped bot-blocks (Cloudflare,
// 403/429), and a blocked fetch was then mislabelled "dead", so live sites got
// "din hjemmeside har tekniske udfordringer" mails. Never conclude "dead" from a
// block/timeout: retry, try a reader fallback, and only DNS failure counts as dead.
const REAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_HEADERS = {
  "User-Agent": REAL_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "da-DK,da;q=0.9,en;q=0.8",
};

async function fetchHtml(fullUrl: string): Promise<{ ok: boolean; status: number; html: string }> {
  const tryOnce = async (timeout: number) => {
    try {
      const res = await fetch(fullUrl, { signal: AbortSignal.timeout(timeout), headers: FETCH_HEADERS, redirect: "follow" });
      const html = await res.text();
      return { ok: res.ok, status: res.status, html };
    } catch {
      return { ok: false, status: 0, html: "" };
    }
  };
  let r = await tryOnce(11000);
  // Retry once on transient/anti-bot responses before drawing any conclusion.
  if (!r.ok && (r.status === 0 || r.status === 403 || r.status === 429 || r.status === 503 || r.status === 520 || r.status === 522)) {
    await new Promise((s) => setTimeout(s, 800));
    r = await tryOnce(11000);
  }
  if (r.ok && r.html.length > 400) return r;
  // Reader fallback renders JS + bypasses many bot blocks — a second opinion.
  try {
    const jres = await fetch(`https://r.jina.ai/${fullUrl}`, { signal: AbortSignal.timeout(16000), headers: { "User-Agent": REAL_UA } });
    if (jres.ok) {
      const jhtml = await jres.text();
      if (jhtml.length > 300) return { ok: true, status: 200, html: jhtml };
    }
  } catch { /* fall through */ }
  return r;
}

async function dnsResolves(host: string): Promise<boolean> {
  try { await dns.resolve4(host); return true; } catch {
    try { await dns.resolveMx(host); return true; } catch { return false; }
  }
}

// Returns tier=null when the site could not be confidently classified (blocked /
// timeout / uncertain). The caller SKIPS null tiers — the lead stays unverified
// and is retried next run, rather than being mislabelled and cold-mailed.
async function analyzeUrl(url: string): Promise<{ tier: WebsiteQualityTier | null; email: string | null }> {
  const fullUrl = url.startsWith("http") ? url : `https://${url}`;
  // Social pages aren't real websites — leave unverified (null) rather than "dead",
  // so no "your site is broken" claim is ever generated from a Facebook/Instagram URL.
  if (/facebook\.com|instagram\.com|linkedin\.com|twitter\.com|tiktok\.com/i.test(fullUrl)) {
    return { tier: null, email: null };
  }
  try {
    const res = await fetchHtml(fullUrl);
    if (!res.ok || res.html.length < 400) {
      // Only a genuine DNS failure is real evidence the site is gone.
      let host: string | null = null;
      try { host = new URL(fullUrl).hostname; } catch { host = null; }
      if (host && !(await dnsResolves(host))) return { tier: "dead", email: null };
      return { tier: null, email: null }; // blocked / uncertain → do NOT guess
    }

    const html = res.html;
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
    // Unexpected error — uncertain, never assume "dead".
    return { tier: null, email: null };
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
        if (tier === null) return { lead, tier: null as WebsiteQualityTier | null, newScore: lead.score, email };
        const bonus = websiteQualityBonus(tier, lead.websiteStatus);
        const baseScore = Math.min(lead.score, 55);
        const newScore = Math.min(100, baseScore + bonus);
        return { lead, tier, newScore, email };
      }));
      for (const { lead, tier, newScore, email } of batchResults) {
        // tier === null → site was blocked/uncertain. Leave the lead UNVERIFIED so it
        // is retried next run; never write a guessed tier (this is the false-"dead" fix).
        if (tier === null) continue;
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
