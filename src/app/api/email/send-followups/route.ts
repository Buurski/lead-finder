import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";
import { FOLLOWUP_DAYS } from "@/lib/tone-mixer";

export const maxDuration = 300;

// Single source of truth (OUTREACH_ANALYSIS: default 7 dage, not 12).

function isReadyForFollowup(lead: {
  email: string;
  emailSentAt: string;
  emailOpenedAt: string;
  emailStatus: string;
  followupSentAt: string;
  status: string;
}): boolean {
  if (!lead.email) return false;
  if (!lead.emailSentAt) return false;
  if (lead.emailOpenedAt) return false;
  if (lead.emailStatus === "replied") return false;
  if (lead.emailStatus === "bounced") return false;
  if (lead.followupSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;

  const sentDate = new Date(lead.emailSentAt);
  const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= FOLLOWUP_DAYS;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leads = await getLeads();
  const eligible = leads.filter((l) => isReadyForFollowup(l));

  if (searchParams.get("list") === "1") {
    const now = Date.now();
    const list = eligible.map((lead) => ({
      id: lead.id,
      name: lead.name,
      email: lead.email,
      branch: lead.branch,
      city: lead.city,
      emailSentAt: lead.emailSentAt,
      daysSince: Math.floor((now - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24)),
    }));
    return NextResponse.json({ count: eligible.length, leads: list });
  }

  return NextResponse.json({ count: eligible.length });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const leadIds: string[] | undefined = body.leadIds;

  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isReadyForFollowup(lead))
    .filter(({ lead }) => !leadIds || leadIds.includes(lead.id));

  const total = eligible.length;
  const encoder = new TextEncoder();

  // Stream progress back so the browser connection stays alive regardless of how many leads.
  // Each line is a JSON object terminated by \n (newline-delimited JSON).
  const stream = new ReadableStream({
    async start(controller) {
      let sent = 0;
      let failed = 0;

      for (const { lead, rowIndex } of eligible) {
        try {
          await sendLeadEmail(lead, "followup");
          await updateLeadEmailStatus(rowIndex, { followupSentAt: new Date().toISOString() });
          if (lead.status === "new") await updateLeadStatus(rowIndex, "called");
          sent++;
        } catch {
          failed++;
        }
        controller.enqueue(
          encoder.encode(JSON.stringify({ sent, failed, total, done: false }) + "\n")
        );
        await new Promise((r) => setTimeout(r, 150));
      }

      controller.enqueue(
        encoder.encode(JSON.stringify({ sent, failed, total, done: true }) + "\n")
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson" },
  });
}
