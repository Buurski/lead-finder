import { NextResponse } from "next/server";
import { runScraper, scoreLead, detectWebsiteStatus, BRANCHES, CITIES, REGION_PRESETS, BRANCH_PRESETS, buildQueries } from "@/lib/apify";
import { appendLeads, getLeadNames, getLeadPhones } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { compositeScore } from "@/lib/leads/composite-score";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Support ?region=aarhus&branch=craft for targeted scraping (avoids Vercel timeout)
    const url = new URL(req.url);
    const region = url.searchParams.get("region")?.toLowerCase();
    const branch = url.searchParams.get("branch")?.toLowerCase();
    const cities = region && REGION_PRESETS[region] ? REGION_PRESETS[region] : CITIES;
    const branches = branch && BRANCH_PRESETS[branch] ? BRANCH_PRESETS[branch] : BRANCHES;
    const queries = buildQueries(branches, cities);
    const places = await runScraper(queries);

    // Skip duplicates already in sheet (by name or phone)
    const [existing, existingPhones] = await Promise.all([getLeadNames(), getLeadPhones()]);
    const existingSet = new Set(existing.map((n) => n.toLowerCase()));
    const existingPhoneSet = new Set(existingPhones);

    const now = new Date().toISOString();
    const newLeads = places
      .filter((p) => {
        if (!p.title || existingSet.has(p.title.toLowerCase())) return false;
        if (p.phone && existingPhoneSet.has(p.phone)) return false;
        const branch = (p.categoryName ?? "").toLowerCase();
        if (
          ((branch === "restaurant" || branch === "café") && (p.reviewsCount ?? 0) < 30) ||
          ((branch === "skønhedsklinik" || branch === "hudklinik" ||
            branch === "negle & vippeextensions salon") &&
           (p.reviewsCount ?? 0) < 15) ||
          (branch === "frisørsalon" && (p.reviewsCount ?? 0) < 25)
        ) return false;
        return true;
      })
      .map((p) => {
        const base = {
          name: p.title,
          branch: p.categoryName ?? "",
          phone: p.phone ?? "",
          city: p.city ?? "",
          score: scoreLead(p),
          source: "Google Maps",
          website: p.website ?? "",
          websiteStatus: detectWebsiteStatus(p.website),
          status: "new" as const,
          notes: "",
          lastUpdated: now,
          websiteQualityTier: "" as const,
          enrichedInfo: "",
          email: p.email ?? "",
          emailSentAt: "",
          emailOpenedAt: "",
          emailClickedAt: "",
          emailStatus: "",
          followupSentAt: "",
          reviewsCount: p.reviewsCount ?? 0,
          callbackDate: "",
        };
        // "Vælg de bedste": store the composite score (base + review-velocity +
        // branch-relevance + sleeping-beauty…) so the feed/engine rank by quality,
        // not raw Google stars. rating derived from the place.
        const rating = (p as { rating?: number; totalScore?: number }).rating ?? (p as { totalScore?: number }).totalScore;
        base.score = compositeScore(base as unknown as Lead, undefined, { rating: typeof rating === "number" ? rating : undefined }).score;
        return base;
      });

    if (newLeads.length > 0) {
      await appendLeads(newLeads);
    }

    return NextResponse.json({ added: newLeads.length, total: places.length, region: region ?? "all", branch: branch ?? "all", queriesRun: queries.length });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
