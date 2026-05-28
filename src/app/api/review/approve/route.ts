import { NextResponse } from "next/server";
import { getLeads, getPauseStatus, enqueueSend } from "@/lib/sheets";
import { buildLeadEmail, NoMatchingTemplateError } from "@/lib/email";

// POST /api/review/approve
//   body: {
//     leadId: string,
//     kind: "cold" | "followup",
//     subjectOverride?: string,
//     bodyOverride?: string,        // plain text only — html mirrors it
//   }
//
// Renders the lead's template, optionally overrides subject / body with
// Lucas's edits, and enqueues into SendQueue with the appropriate kind.
// The actual Gmail dispatch happens in scripts/send.mjs.
//
// Pause-check is scoped to the kind: cold respects the cold pause, followup
// the followup pause; both also fold in the master kill.

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const leadId: string = body?.leadId;
    const kind: "cold" | "followup" = body?.kind === "followup" ? "followup" : "cold";
    const subjectOverride: string | undefined = body?.subjectOverride;
    const bodyOverride: string | undefined = body?.bodyOverride;

    if (!leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

    const pause = await getPauseStatus(kind);
    if (pause.paused) {
      return NextResponse.json(
        { error: "paused", scope: kind, pausedUntil: pause.until, masterActive: pause.masterActive },
        { status: 423 }
      );
    }

    const leads = await getLeads();
    const rowIndex = parseInt(leadId, 10) - 2;
    const lead = leads[rowIndex];
    if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
    if (!lead.email) return NextResponse.json({ error: "lead has no email" }, { status: 400 });

    let subject: string;
    let textBody: string;
    let htmlBody: string;
    try {
      const tpl = buildLeadEmail(lead, kind);
      subject = subjectOverride && subjectOverride.trim() ? subjectOverride : tpl.subject;
      textBody = bodyOverride && bodyOverride.trim() ? bodyOverride : tpl.text;
      // If body was overridden, regenerate the HTML wrapping by escaping the
      // text into a <pre>-like block with the existing template's HTML head.
      // Keep it simple — Lucas's edits are plain-text; render as preformatted.
      if (bodyOverride && bodyOverride.trim()) {
        const escaped = bodyOverride
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        htmlBody = `<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">${escaped}</body></html>`;
      } else {
        htmlBody = tpl.html;
      }
    } catch (err) {
      if (err instanceof NoMatchingTemplateError) {
        return NextResponse.json(
          {
            error: "no matching template — pass bodyOverride+subjectOverride to send a custom message anyway",
            branch: err.branch,
            leadName: err.leadName,
          },
          { status: 422 }
        );
      }
      throw err;
    }

    const queueId = await enqueueSend({
      leadId: lead.id,
      toEmail: lead.email,
      kind,
      subject,
      body: textBody,
      htmlBody,
    });

    return NextResponse.json({
      ok: true,
      enqueued: true,
      queueId,
      kind,
      override: {
        subject: !!subjectOverride,
        body: !!bodyOverride,
      },
    });
  } catch (err) {
    console.error("review/approve failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
