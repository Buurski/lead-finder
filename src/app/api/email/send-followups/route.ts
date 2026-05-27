import { NextResponse } from "next/server";
import { getLeads, getPauseStatus, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";
import { isChain, isPublicSector } from "@/lib/chains";

export const maxDuration = 300;

const FOLLOWUP_DAYS = 5;

function isReadyForFollowup(lead: {
  name: string;
  email: string;
  emailSentAt: string;
  emailOpenedAt: string;
  emailStatus: string;
  followupSentAt: string;
  status: string;
  skipReason?: string;
}): boolean {
  if (!lead.email) return false;
  if (!lead.emailSentAt) return false;
  if (lead.emailOpenedAt) return false;
  if (lead.emailStatus === "replied") return false;
  if (lead.emailStatus === "bounced") return false;
  if (lead.followupSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  // Phase 2: review-queue skip flag also blocks follow-ups.
  if (lead.skipReason) return false;
  // Consistency with queue.ts: never follow up a chain or public-sector lead
  // that slipped through before these guards existed.
  if (isChain(lead.name)) return false;
  if (isPublicSector(lead.name)) return false;

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
  // Phase 2 kill switch — paused state blocks all follow-up sends too.
  const pause = await getPauseStatus();
  if (pause.paused) {
    return NextResponse.json({ paused: true, pausedUntil: pause.until, sent: 0, failed: 0, total: 0, done: true });
  }

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

      let processed = 0;
  for (const { lead, rowIndex } of eligible) {
    if (processed > 0 && processed % 5 === 0) {
      const recheck = await getPauseStatus();
      if (recheck.paused) {
        return NextResponse.json({
          paused: true,
          pausedUntil: recheck.until,
          haltedMidRun: true,
          sent,
          failed,
          remaining: eligible.length - processed,
        });
      }
    }
    processed++;
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
