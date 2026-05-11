import { NextResponse } from "next/server";
import { runScraper, scoreLead, detectWebsiteStatus } from "@/lib/apify";
import { appendLeads, getLeadNames, getLeadPhones } from "@/lib/sheets";

export const maxDuration = 300;

export async function POST() {
  try {
    const places = await runScraper();

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
        reviewsCount: p.reviewsCount ?? 0,
        callbackDate: "",
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
