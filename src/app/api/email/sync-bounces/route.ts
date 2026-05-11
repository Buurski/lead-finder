import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

export const maxDuration = 60;

// Gmail sends bounces from these addresses
const BOUNCE_SENDERS = ["mailer-daemon@googlemail.com", "postmaster@gmail.com"];

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

    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim() ?? "";
      const subject = msg.envelope?.subject?.toLowerCase() ?? "";

      // Only process bounce notifications
      const isBounce =
        BOUNCE_SENDERS.includes(from) ||
        subject.includes("delivery status notification") ||
        subject.includes("address not found") ||
        subject.includes("undeliverable") ||
        subject.includes("returned mail");

      if (!isBounce) continue;

      // Scan raw source for any of our lead email addresses
      const source = msg.source?.toString("utf8")?.toLowerCase() ?? "";
      for (const [email, rowIndex] of emailToRow) {
        if (source.includes(email)) {
          bouncedRows.add(rowIndex);
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
