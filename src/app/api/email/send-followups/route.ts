import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

const FOLLOWUP_DAYS = 5;

function isReadyForFollowup(lead: {
  email: string;
  emailSentAt: string;
  emailOpenedAt: string;
  followupSentAt: string;
  status: string;
}): boolean {
  if (!lead.email) return false;
  if (!lead.emailSentAt) return false;
  if (lead.emailOpenedAt) return false;
  if (lead.followupSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;

  const sentDate = new Date(lead.emailSentAt);
  const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= FOLLOWUP_DAYS;
}

export async function GET() {
  const leads = await getLeads();
  const count = leads.filter((l) => isReadyForFollowup(l)).length;
  return NextResponse.json({ count });
}

export async function POST() {
  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isReadyForFollowup(lead));

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "followup");
      await updateLeadEmailStatus(rowIndex, {
        followupSentAt: new Date().toISOString(),
      });
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
