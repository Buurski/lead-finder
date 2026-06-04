import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { classifyReply, draftReply } from "@/lib/reply";
import type { ReplyClassification } from "@/lib/reply";

// GET /api/replies — read-only inbox triage for the Replies panel.
//
// Scans the Gmail INBOX over IMAP for messages whose sender matches a lead we
// have emailed, pulls the latest reply text, classifies it with reply.ts, and
// pre-drafts a suggested response. NOTHING is sent and NOTHING is written back —
// flipping a lead's status is a separate, explicit Fase B action.
//
// Network/credential failures degrade gracefully to { ok:false, replies:[] } so
// the panel can show a calm "couldn't reach inbox" state instead of crashing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ReplyRow {
  leadId: string;
  name: string;
  branch: string;
  city: string;
  from: string;
  subject: string;
  date: string;
  preview: string;
  classification: ReplyClassification;
  suggestedReply: string;
  source: "ai" | "deterministic";
}

function previewOf(text: string, n = 280): string {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

export async function GET() {
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, replies: [] }, { status: 200 });
  }

  // Only leads we have actually emailed are candidates for an inbound reply.
  const emailed = leads.filter((l) => l.emailSentAt && l.email);
  if (emailed.length === 0) {
    return NextResponse.json({ ok: true, replies: [], checked: 0 });
  }

  const byEmail = new Map(emailed.map((l) => [l.email.toLowerCase().trim(), l]));
  const earliest = emailed
    .map((l) => new Date(l.emailSentAt))
    .reduce((a, b) => (a < b ? a : b));
  const since = new Date(earliest);
  since.setDate(since.getDate() - 1);

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, error: "imap not configured", replies: [] }, { status: 200 });
  }

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  // Keep only the newest message per lead.
  const latest = new Map<string, { lead: Lead; subject: string; date: string; text: string }>();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (!from || !byEmail.has(from)) continue;
      const lead = byEmail.get(from)!;
      const when = msg.envelope?.date?.toISOString() ?? "";
      const prev = latest.get(lead.id);
      if (prev && prev.date >= when) continue;
      const raw = msg.source ? msg.source.toString("utf-8") : "";
      // Crude body extraction: text after the first blank line, headers stripped.
      const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n\n");
      latest.set(lead.id, {
        lead,
        subject: msg.envelope?.subject ?? "(intet emne)",
        date: when,
        text: body || raw,
      });
    }
    await client.logout();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `imap: ${String(err)}`, replies: [] }, { status: 200 });
  }

  const replies: ReplyRow[] = [];
  for (const { lead, subject, date, text } of latest.values()) {
    const draft = await draftReply(
      text,
      { leadName: lead.name, branch: lead.branch, city: lead.city },
      "",
      { useAI: false } // read-only triage stays deterministic + fast; AI lift is a Fase B action
    );
    replies.push({
      leadId: lead.id,
      name: lead.name,
      branch: lead.branch,
      city: lead.city,
      from: lead.email,
      subject,
      date,
      preview: previewOf(text),
      classification: draft.classification ?? classifyReply(text),
      suggestedReply: draft.suggestedReply,
      source: draft.source,
    });
  }

  // Most interesting first: interested/becameClient, then questions, then rest.
  replies.sort((a, b) => Number(b.classification.isInterested) - Number(a.classification.isInterested));

  return NextResponse.json({ ok: true, replies, checked: emailed.length });
}
