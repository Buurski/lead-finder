// sync-replies.ts — shared inbound-reply sync (Del 4.x).
//
// Scans the Gmail INBOX over IMAP and marks any lead who has written to us as
// "replied" in the Sheet. This is the single source of truth used by BOTH the
// manual dashboard button (POST /api/email/sync-replies) AND the Vercel cron
// (GET /api/cron/sync-replies), so the behaviour can never drift between them.
//
// Coverage note (the RR Studio fix): we no longer require emailSentAt. ANY lead
// that has an email address is a candidate — so a prospect we contacted manually
// from Gmail (and later added as a lead) gets their reply caught too, not just
// leads the engine emailed. We still skip leads already marked "replied".
//
// Strip-safe: no Next.js imports, so node CLIs / cron can import it directly.
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadEmailStatus } from "./sheets.ts";

export interface SyncRepliesResult {
  synced: number;   // number of leads newly flipped to "replied"
  checked: number;  // number of candidate leads scanned against
  names?: string[]; // names of the newly-replied leads (for journaling / brief)
}

// How far back to scan when we have no send-date to anchor on, and the hard
// ceiling so a stray old lead can never make us scan years of INBOX.
const FALLBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 60;

export async function syncReplies(): Promise<SyncRepliesResult> {
  const leads = await getLeads();

  // Candidates: any lead with an email that isn't already marked replied.
  const candidates = leads
    .map((lead, rowIndex) => ({ lead, rowIndex }))
    .filter(({ lead }) => lead.email && lead.emailStatus !== "replied");

  if (candidates.length === 0) {
    return { synced: 0, checked: 0, names: [] };
  }

  const emailToRow = new Map(
    candidates.map(({ lead, rowIndex }) => [lead.email.toLowerCase().trim(), rowIndex])
  );
  const rowToName = new Map(candidates.map(({ lead, rowIndex }) => [rowIndex, lead.name]));

  // Anchor the scan window on the earliest real send date when we have one,
  // otherwise fall back to a bounded recent window.
  const sendDates = candidates
    .map(({ lead }) => lead.emailSentAt)
    .filter(Boolean)
    .map((d) => new Date(d))
    .filter((d) => !Number.isNaN(d.getTime()));

  const now = new Date();
  const floor = new Date(now);
  floor.setDate(floor.getDate() - MAX_LOOKBACK_DAYS);

  let since: Date;
  if (sendDates.length > 0) {
    since = new Date(sendDates.reduce((a, b) => (a < b ? a : b)));
    since.setDate(since.getDate() - 1);
  } else {
    since = new Date(now);
    since.setDate(since.getDate() - FALLBACK_DAYS);
  }
  if (since < floor) since = floor;

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

  await client.connect();
  try {
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (from && emailToRow.has(from)) {
        repliedRows.add(emailToRow.get(from)!);
      }
    }
  } finally {
    await client.logout();
  }

  for (const rowIndex of repliedRows) {
    await updateLeadEmailStatus(rowIndex, { emailStatus: "replied" });
  }

  return {
    synced: repliedRows.size,
    checked: candidates.length,
    names: [...repliedRows].map((r) => rowToName.get(r)!).filter(Boolean),
  };
}
