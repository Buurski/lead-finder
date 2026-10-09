import { leadRowIndex } from "@/lib/lead-row";
import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadStatus, updateLeadEmailStatus } from "@/lib/sheets";
import { isOptOut, isRejection } from "@/lib/rejections";

export const maxDuration = 120;

export async function POST() {
  const leads = await getLeads();
  const sentLeads = leads
    .map((lead) => ({ lead, rowIndex: leadRowIndex(lead) }))
    .filter(({ lead }) => lead.emailSentAt && lead.email && lead.status !== "skip" && lead.status !== "client");

  if (sentLeads.length === 0) {
    return NextResponse.json({ scanned: 0, marked_skip: 0 });
  }

  const emailToRow = new Map(
    sentLeads.map(({ lead, rowIndex }) => [lead.email.toLowerCase().trim(), rowIndex])
  );

  const earliestSend = sentLeads
    .map(({ lead }) => new Date(lead.emailSentAt))
    .reduce((a, b) => (a < b ? a : b));
  const since = new Date(earliestSend);
  since.setDate(since.getDate() - 1);

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER!, pass: process.env.GMAIL_APP_PASSWORD! },
    logger: false,
  });

  const rejectedRows = new Map<number, boolean>(); // rowIdx → eksplicit opt-out
  const rejectedDetails: { email: string; snippet: string }[] = [];

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (!fromAddr || !emailToRow.has(fromAddr)) continue;
      const source = msg.source?.toString("utf8") ?? "";
      // Extract body text — very lightweight, only first part
      const body = source.slice(0, 8000);
      if (isRejection(body)) {
        const rowIdx = emailToRow.get(fromAddr)!;
        if (!rejectedRows.has(rowIdx)) {
          rejectedRows.set(rowIdx, isOptOut(body));
          rejectedDetails.push({ email: fromAddr, snippet: body.slice(0, 200).replace(/\s+/g, " ") });
        }
      }
    }
    await client.logout();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Mark each as skip + emailStatus (double-protected). Eksplicit opt-out ⇒ "afmeldt" så
  // alle send-veje (også preview-send) ser det; høfligt nej ⇒ "replied" som før.
  for (const [rowIdx, optOut] of rejectedRows) {
    await updateLeadStatus(rowIdx, "skip", optOut ? "Auto-skip: afmeldt via svar" : "Auto-skip: negative reply detected");
    await updateLeadEmailStatus(rowIdx, { emailStatus: optOut ? "afmeldt" : "replied" });
    await new Promise((r) => setTimeout(r, 100));
  }

  return NextResponse.json({
    scanned: sentLeads.length,
    marked_skip: rejectedRows.size,
    details: rejectedDetails.slice(0, 50),
  });
}

export async function GET() {
  const leads = await getLeads();
  const skipped = leads.filter((l) => l.status === "skip").length;
  return NextResponse.json({ totalSkipped: skipped });
}
