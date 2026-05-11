import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST() {
  const leads = await getLeads();

  const sentLeads = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => lead.emailSentAt && lead.email && lead.emailStatus !== "bounced");

  if (sentLeads.length === 0) {
    return NextResponse.json({ bounced: 0, checked: 0 });
  }

  // Map lowercase email → rowIndex for fast lookup
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
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  const bouncedRows = new Set<number>();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Search for bounce messages only — avoids downloading all mail
    const bounceUids: number[] = (await client.search(
      {
        since,
        or: [
          { from: "mailer-daemon" },
          { from: "postmaster" },
        ],
      },
      { uid: true }
    )) || [];

    if (bounceUids.length > 0) {
      // Only fetch source for the (few) bounce messages found
      for await (const msg of client.fetch(bounceUids, { source: true }, { uid: true })) {
        const source = msg.source?.toString("utf8")?.toLowerCase() ?? "";
        for (const [email, rowIndex] of emailToRow) {
          if (source.includes(email)) {
            bouncedRows.add(rowIndex);
          }
        }
      }
    }

    await client.logout();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  for (const rowIndex of bouncedRows) {
    await updateLeadEmailStatus(rowIndex, { emailStatus: "bounced" });
  }

  return NextResponse.json({ bounced: bouncedRows.size, checked: sentLeads.length });
}
