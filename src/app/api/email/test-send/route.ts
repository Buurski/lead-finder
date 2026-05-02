import { NextResponse } from "next/server";
import { sendLeadEmail } from "@/lib/email";
import type { Lead } from "@/lib/sheets";

// Fake lead for test sends
function fakeLead(email: string): Lead {
  return {
    id: "test",
    name: "Lucas",
    branch: "tømrer",
    phone: "",
    city: "Aarhus",
    score: 75,
    source: "test",
    website: "https://example.com",
    websiteStatus: "old",
    status: "new",
    notes: "",
    lastUpdated: new Date().toISOString(),
    websiteQualityTier: "old",
    enrichedInfo: "",
    email,
    emailSentAt: "",
    emailOpenedAt: "",
    emailClickedAt: "",
    emailStatus: "",
    followupSentAt: "",
  };
}

export async function POST(req: Request) {
  const { emails, type }: { emails: string[]; type: "cold" | "followup" } = await req.json();

  const results: { email: string; ok: boolean; error?: string }[] = [];

  for (const email of emails) {
    try {
      await sendLeadEmail(fakeLead(email), type);
      results.push({ email, ok: true });
    } catch (err) {
      results.push({ email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
