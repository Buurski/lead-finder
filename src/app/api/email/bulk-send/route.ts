import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";
import { isChain } from "@/lib/chains";

export const maxDuration = 300;

const PROFESSIONAL_BRANCHES = ["advokat", "revisor", "fysioterapeut", "tandlæge", "optiker"];

function isEligible(lead: { score: number; branch: string; email: string; emailSentAt: string; status: string; websiteQualityTier: string; name: string }): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!lead.email || !emailRegex.test(lead.email)) return false;
  if (lead.emailSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  if (lead.websiteQualityTier === "modern") return false;
  if (isChain(lead.name)) return false;
  const isProfessional = PROFESSIONAL_BRANCHES.some((b) => lead.branch.toLowerCase().includes(b));
  const minScore = isProfessional ? 70 : 40;
  return lead.score >= minScore;
}

export async function GET() {
  const leads = await getLeads();
  const eligible = leads
    .filter(isEligible)
    .sort((a, b) => b.score - a.score);
  return NextResponse.json({
    eligible: eligible.length,
    leads: eligible.map((l) => ({
      id: l.id,
      name: l.name,
      score: l.score,
      branch: l.branch,
      city: l.city,
      email: l.email,
      websiteQualityTier: l.websiteQualityTier,
    })),
  });
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isEligible(lead))
    .sort((a, b) => b.lead.score - a.lead.score);

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      if (lead.status === "new") {
        await updateLeadStatus(rowIndex, "called");
      }
      results.push({ name: lead.name, email: lead.email, ok: true });
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
