// sync-replies.ts — shared inbound-reply sync (Del 4.x).
//
// Scans the Gmail INBOX over IMAP and marks any lead who has written to us as
// "replied" in the Sheet. Single source of truth for the manual dashboard
// button AND the Vercel cron, so behaviour can never drift between them.
//
// Hybrid afsendere (2026-06-17): scanner BEGGE Gmail-identiteter (Lucas +
// Charlie) i én kørsel. Per-account results merges til et samlet sæt
// replied-rækker. Nye leads tilføjet via Charlie-kontoen fanges også.
//
// IMAP robustness (Vercel cron fix, 2026-06-13):
//   - explicit connect + socket timeouts so a hung Gmail never runs past
//     Vercel's maxDuration. Serverless can kill unhandled hangs at the platform
//     level but the runtime may return an empty body, so cron-log would show
//     "ok" while the inbox was never read. Hard timeouts close that gap.
//   - one automatic retry on transient network failures (ECONNRESET, ETIMEDOUT,
//     EAI_AGAIN, socket hang up).
//   - guaranteed logout in finally so we never leak sockets between runs.
import { ImapFlow } from "imapflow";
import { getLeads, updateLeadEmailStatus, updateLeadEmailStatusBulk } from "./sheets.ts";
import { getActiveSenders, type SenderId } from "./senders.ts";

export interface SyncRepliesResult {
  synced: number;
  checked: number;
  names?: string[];
  // Hybrid: per-account resultat (2026-06-17). Gør det muligt for UI/cron-log
  // at se hvilken konto der fangede hvad — fx hvis Charlie-kontoen har en
  // fejl men Lucas-kontoen virker.
  byAccount?: Record<SenderId, { synced: number; error?: string }>;
}

const FALLBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 60;
const CONNECT_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

function isTransient(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|socket hang up|ENOTFOUND/i.test(m);
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES && isTransient(err)) {
        console.warn(`[sync-replies] ${label} transient (${(err as Error).message}) — retrying in 2s`);
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function scanOneAccount(
  account: { id: SenderId; user: string; appPassword: string },
  candidates: { lead: { email: string; emailStatus?: string }; rowIndex: number; name: string }[],
  since: Date,
  repliedRows: Set<number>,
): Promise<{ synced: number; error?: string }> {
  const emailToRow = new Map(
    candidates.map(({ lead, rowIndex }) => [lead.email.toLowerCase().trim(), rowIndex]),
  );
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    ...(process.env.IMAP_ALLOW_SELFSIGNED === "1" ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: account.user, pass: account.appPassword },
    logger: false,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  const beforeCount = repliedRows.size;
  try {
    await withRetry(() => client.connect(), `imap-connect[${account.id}]`);
    try {
      await client.mailboxOpen("INBOX");
      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
        if (from && emailToRow.has(from)) repliedRows.add(emailToRow.get(from)!);
      }
    } finally {
      try { await client.logout(); } catch { /* already closed */ }
    }
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    return { synced: repliedRows.size - beforeCount, error: String(err) };
  }
  return { synced: repliedRows.size - beforeCount };
}

// ── Sendt-mappe-scan (2026-07-18) ────────────────────────────────────────
// "Virkelig gennemtjekket": mails sendt UDEN OM systemet (manuelt fra Gmail)
// skal også tælle som kontakt. Scanner begge kontis Sendt-mappe og stempler
// leads i Sheets: første manuelle mail → emailSentAt + emailStatus="sent";
// senere mail end sidste kendte kontakt → followupSentAt. Dermed fanger
// isContactable/dedup-gaten og kø-badgen dem automatisk.

export interface SyncSentResult {
  stamped: number;
  checked: number;
  names?: string[];
  byAccount?: Record<SenderId, { matched: number; error?: string }>;
}

async function scanSentOneAccount(
  account: { id: SenderId; user: string; appPassword: string },
  emailToRow: Map<string, number>,
  since: Date,
  latestByRow: Map<number, Date>,
): Promise<{ matched: number; error?: string }> {
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    ...(process.env.IMAP_ALLOW_SELFSIGNED === "1" ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: account.user, pass: account.appPassword },
    logger: false,
    connectionTimeout: CONNECT_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });
  let matched = 0;
  try {
    await withRetry(() => client.connect(), `imap-connect-sent[${account.id}]`);
    try {
      // Locale-sikkert: find Sendt-mappen via special-use-flag, ikke navnet
      // ("[Gmail]/Sent Mail" hedder "[Gmail]/Sendte mails" på dansk konto).
      const boxes = await client.list();
      const sent = boxes.find((b) => b.specialUse === "\\Sent");
      if (!sent) return { matched: 0, error: "ingen \\Sent-mappe fundet" };
      await client.mailboxOpen(sent.path, { readOnly: true });
      for await (const msg of client.fetch({ since }, { envelope: true })) {
        const date = msg.envelope?.date ? new Date(msg.envelope.date) : null;
        if (!date || Number.isNaN(date.getTime())) continue;
        const rcpts = [...(msg.envelope?.to ?? []), ...(msg.envelope?.cc ?? [])];
        for (const r of rcpts) {
          const addr = r?.address?.toLowerCase().trim();
          if (!addr) continue;
          const row = emailToRow.get(addr);
          if (row === undefined) continue;
          matched++;
          const prev = latestByRow.get(row);
          if (!prev || date > prev) latestByRow.set(row, date);
        }
      }
    } finally {
      try { await client.logout(); } catch { /* already closed */ }
    }
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    return { matched, error: String(err) };
  }
  return { matched };
}

export async function syncSentFolders(lookbackDays = FALLBACK_DAYS): Promise<SyncSentResult> {
  const leads = await getLeads();
  const candidates = leads
    .map((lead, rowIndex) => ({ lead, rowIndex, name: lead.name }))
    .filter(({ lead }) => lead.email && lead.email.includes("@"));
  if (candidates.length === 0) return { stamped: 0, checked: 0, names: [] };

  const emailToRow = new Map(candidates.map(({ lead, rowIndex }) => [lead.email.toLowerCase().trim(), rowIndex]));
  const since = new Date();
  since.setDate(since.getDate() - Math.min(lookbackDays, MAX_LOOKBACK_DAYS));

  const latestByRow = new Map<number, Date>();
  const byAccount: Record<SenderId, { matched: number; error?: string }> = {
    lucas: { matched: 0 },
    charlie: { matched: 0 },
  };
  const accounts = getActiveSenders();
  for (const account of accounts) {
    byAccount[account.id] = await scanSentOneAccount(account, emailToRow, since, latestByRow);
  }

  const rowToLead = new Map(candidates.map(({ lead, rowIndex }) => [rowIndex, lead]));
  const rowToName = new Map(candidates.map(({ rowIndex, name }) => [rowIndex, name]));
  // Ét samlet batchUpdate (council-fund 2026-07-18): første kørsel kan matche
  // 100+ rækker — én Sheets-write i stedet for én pr. række.
  const names: string[] = [];
  const writes: { rowIndex: number; fields: { emailSentAt?: string; emailStatus?: string; followupSentAt?: string } }[] = [];
  for (const [rowIndex, date] of latestByRow) {
    const lead = rowToLead.get(rowIndex)!;
    const iso = date.toISOString();
    const known = [lead.emailSentAt, lead.followupSentAt]
      .map((s) => (s && s.trim() ? new Date(s) : null))
      .filter((d): d is Date => d !== null && !Number.isNaN(d.getTime()));
    const latestKnown = known.length ? new Date(Math.max(...known.map((d) => d.getTime()))) : null;
    if (!lead.emailSentAt || !lead.emailSentAt.trim()) {
      writes.push({
        rowIndex,
        fields: {
          emailSentAt: iso,
          ...(lead.emailStatus && lead.emailStatus.trim() ? {} : { emailStatus: "sent" }),
        },
      });
      names.push(rowToName.get(rowIndex)!);
    } else if (!latestKnown || date.getTime() > latestKnown.getTime() + 60_000) {
      // Manuel mail NYERE end sidste kendte kontakt → registrér som follow-up.
      // 60s-slæk så systemets egen send (som allerede stemplede emailSentAt)
      // ikke dobbelt-stemples af sit eget spor i Sendt-mappen.
      writes.push({ rowIndex, fields: { followupSentAt: iso } });
      names.push(rowToName.get(rowIndex)!);
    }
  }
  await updateLeadEmailStatusBulk(writes);
  return { stamped: writes.length, checked: candidates.length, names, byAccount };
}

export async function syncReplies(): Promise<SyncRepliesResult> {
  const leads = await getLeads();
  const candidates = leads
    .map((lead, rowIndex) => ({ lead, rowIndex, name: lead.name }))
    .filter(({ lead }) => lead.email && lead.emailStatus !== "replied");
  if (candidates.length === 0) return { synced: 0, checked: 0, names: [] };

  const sendDates = candidates
    .map(({ lead }) => lead.emailSentAt).filter(Boolean)
    .map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()));

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

  const repliedRows = new Set<number>();
  const byAccount: Record<SenderId, { synced: number; error?: string }> = {
    lucas: { synced: 0 },
    charlie: { synced: 0 },
  };

  // Hybrid: scan begge konti med creds. Fejl i én konto stopper ikke den anden.
  const accounts = getActiveSenders();
  if (accounts.length === 0) {
    return { synced: 0, checked: candidates.length, names: [], byAccount };
  }

  const rowToName = new Map(candidates.map(({ rowIndex, name }) => [rowIndex, name]));

  for (const account of accounts) {
    const r = await scanOneAccount(account, candidates, since, repliedRows);
    byAccount[account.id] = r;
  }

  for (const rowIndex of repliedRows) {
    await updateLeadEmailStatus(rowIndex, { emailStatus: "replied" });
  }
  return {
    synced: repliedRows.size,
    checked: candidates.length,
    names: [...repliedRows].map((r) => rowToName.get(r)!).filter(Boolean),
    byAccount,
  };
}
