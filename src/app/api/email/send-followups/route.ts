import { NextResponse } from "next/server";
import { getLeads, getPauseStatus, updateLeadEmailStatus, updateLeadStatus, updateLeadSkipReason, logSkipReason } from "@/lib/sheets";
import { sendLeadEmail, NoMatchingTemplateError } from "@/lib/email";
import { isEligibleForFollowup } from "@/lib/eligibility";

export const maxDuration = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const leads = await getLeads();
  const eligible = leads.filter((l) => isEligibleForFollowup(l));

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
    .filter(({ lead }) => isEligibleForFollowup(lead))
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
        } catch (err) {
          if (err instanceof NoMatchingTemplateError) {
            try {
              await updateLeadSkipReason(rowIndex, "wrong_template");
              await logSkipReason(lead.id, "wrong_template", `no matching followup template for branch="${lead.branch}" name="${lead.name}"`);
            } catch {}
          }
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
