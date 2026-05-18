import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadStatus, updateLeadEmailStatus } from "@/lib/sheets";

export const maxDuration = 120;

// Phrases indicating the recipient does NOT want further contact
const REJECTION_PATTERNS = [
  // Explicit opt-out
  /ikke kontakt/i,
  /stop med at sende/i,
  /fjern mig/i,
  /afmeld/i,
  /unsubscribe/i,
  /ikke skrive til/i,
  /ikke kontakte mig/i,
  /ikke kontakte os/i,
  /lad være/i,
  /ønsker ikke/i,
  // Polite "no"
  /\bnej tak\b/i,
  /tak men nej/i,
  /tak men ellers/i,
  /ellers tak/i,
  /ikke interesseret/i,
  /ingen interesse/i,
  /har ingen interess/i,           // "interesse" partial match
  /det har ingen interesse/i,
  /\bikke aktuelt\b/i,
  /ikke er aktuelt/i,
  /tak for tilbudet/i,
  /vi har allerede/i,
  /vi er glade for/i,
  /tilfreds med vores/i,
  /ny hjemmeside lige nu/i,
  /lige nu/i,                       // mild — often paired with "no" but check context
];

// Phrases indicating ACCEPTING/asking for more — should NOT skip these
const ACCEPT_PATTERNS = [
  /\bring til mig\b/i,
  /\bvelkommen til at ringe\b/i,
  /\bhvad er prisen\b/i,
  /\bgerne se\b/i,
  /\bgerne høre mere\b/i,
  /vil gerne tage et kig/i,
  /lyder spændende/i,
  /lad os tage en snak/i,
  /book et møde/i,
  /møde med/i,
  /\bja tak\b/i,
];

function isRejection(body: string): boolean {
  // Don't classify as rejection if it's clearly accepting
  for (const p of ACCEPT_PATTERNS) if (p.test(body)) return false;
  for (const p of REJECTION_PATTERNS) if (p.test(body)) return true;
  return false;
}

export async function POST() {
  const leads = await getLeads();
  const sentLeads = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
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

  const rejectedRows = new Set<number>();
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
          rejectedRows.add(rowIdx);
          rejectedDetails.push({ email: fromAddr, snippet: body.slice(0, 200).replace(/\s+/g, " ") });
        }
      }
    }
    await client.logout();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Mark each as skip + emailStatus=replied (so they're double-protected)
  for (const rowIdx of rejectedRows) {
    await updateLeadStatus(rowIdx, "skip", "Auto-skip: negative reply detected");
    await updateLeadEmailStatus(rowIdx, { emailStatus: "replied" });
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
