import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

export const maxDuration = 60;

export async function POST() {
  const leads = await getLeads();

  const sentLeads = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => lead.emailSentAt && lead.email && lead.emailStatus !== "replied");

  if (sentLeads.length === 0) {
    return NextResponse.json({ synced: 0, checked: 0 });
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
    auth: {
      user: process.env.GMAIL_USER!,
      pass: process.env.GMAIL_APP_PASSWORD!,
    },
    logger: false,
  });

  const repliedRows = new Set<number>();

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    for await (const msg of client.fetch({ since }, { envelope: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (from && emailToRow.has(from)) {
        repliedRows.add(emailToRow.get(from)!);
      }
    }

    await client.logout();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  for (const rowIndex of repliedRows) {
    await updateLeadEmailStatus(rowIndex, { emailStatus: "replied" });
  }

  return NextResponse.json({ synced: repliedRows.size, checked: sentLeads.length });
}
