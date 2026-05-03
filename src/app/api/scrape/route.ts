import { NextResponse } from "next/server";
import { runScraper, scoreLead, detectWebsiteStatus } from "@/lib/apify";
import { appendLeads, getLeadNames } from "@/lib/sheets";

export const maxDuration = 300;

export async function POST() {
  try {
    const places = await runScraper();

    // Skip duplicates already in sheet
    const existing = await getLeadNames();
    const existingSet = new Set(existing.map((n) => n.toLowerCase()));

    const now = new Date().toISOString();
    const newLeads = places
      .filter((p) => p.title && !existingSet.has(p.title.toLowerCase()))
      .map((p) => ({
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
      }));

    if (newLeads.length > 0) {
      await appendLeads(newLeads);
    }

    return NextResponse.json({ added: newLeads.length, total: places.length });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
