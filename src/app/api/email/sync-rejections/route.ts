import { leadRowIndex } from "@/lib/lead-row";
import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadStatus, updateLeadEmailStatus } from "@/lib/sheets";
import { isOptOut, isRejection, wantsContact } from "@/lib/rejections";
import { decodeMailBody } from "@/lib/mail-decode";
import { isSuppressed } from "@/lib/canSendTo";

export const maxDuration = 120;

export async function POST() {
  const leads = await getLeads();
  const sentLeads = leads
    .map((lead) => ({ lead, rowIndex: leadRowIndex(lead) }))
    // Skip-leads scannes stadig, så et senere "afmeld" kan opgradere et tidligere "nej tak" (Astra 9/10);
    // allerede afmeldte/bounced springes over.
    .filter(({ lead }) => lead.emailSentAt && lead.email && lead.status !== "client" && !isSuppressed(lead));
  const wasSkip = new Set(sentLeads.filter(({ lead }) => lead.status === "skip").map(({ rowIndex }) => rowIndex));

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

  const rejectedRows = new Map<number, { optOut: boolean; skip: boolean }>();
  const rejectedDetails: { email: string; snippet: string }[] = [];

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (!fromAddr || !emailToRow.has(fromAddr)) continue;
      // Kun selve svaret: dekodet, uden headers og citeret historik (vores egen "afmeld"-tekst tæller ikke, Astra 9/10).
      const body = decodeMailBody(msg.source?.toString("utf8") ?? "").slice(0, 4000);
      const optOut = isOptOut(body);
      const rejection = isRejection(body);
      if (!optOut && !rejection) continue;
      const rowIdx = emailToRow.get(fromAddr)!;
      if (wasSkip.has(rowIdx) && !optOut) continue; // allerede frasorteret; kun en afmelding ændrer noget
      const prev = rejectedRows.get(rowIdx);
      // Akkumulér over alle svar: en senere afmelding vinder over et tidligere "nej tak".
      rejectedRows.set(rowIdx, { optOut: !!prev?.optOut || optOut, skip: !!prev?.skip || rejection || (optOut && !wantsContact(body)) });
      if (!prev) rejectedDetails.push({ email: fromAddr, snippet: body.slice(0, 200).replace(/\s+/g, " ") });
    }
    await client.logout();
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }

  // Mark each as skip + emailStatus (double-protected). Eksplicit opt-out ⇒ "afmeldt" så
  // alle send-veje (også preview-send) ser det; høfligt nej ⇒ "replied" som før.
  // Afmelding med "ring til mig": mailen spærres, men leadet bliver stående til opkald (skip = false).
  for (const [rowIdx, { optOut, skip }] of rejectedRows) {
    if (skip && !wasSkip.has(rowIdx)) {
      await updateLeadStatus(rowIdx, "skip", optOut ? "Auto-skip: afmeldt via svar" : "Auto-skip: negative reply detected");
    }
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
