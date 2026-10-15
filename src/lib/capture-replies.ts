// capture-replies.ts — gemmer leads' svar-mails (uddrag + kategori) i lead_reply, så HQ kan vise hvad de skrev.
// Spec: docs/superpowers/specs/2026-10-15-har-svaret-kontekst-design.md §5.
// Læser kun Gmail (INBOX, begge konti). Sender intet, ændrer ikke lead_status, og rører ikke syncReplies.
import { ImapFlow } from "imapflow";
import { getDb, type Db } from "./db/client.ts";
import { getActiveSenders } from "./senders.ts";
import { parseReply } from "./hq/reply-parse.ts";
import { existingMessageIds, expireOldSnippets, isMissingTable, replyCandidates, safeError, saveLeadReplies, type NewLeadReply } from "./hq/lead-replies.ts";

const CONNECT_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;

/** En svar-mail som den kommer fra IMAP, før parsing. */
export interface RawReply {
  account: string;
  messageId: string;
  threadId: string | null;
  receivedAt: Date;
  subject: string;
  from: string;
  source: string;
}

export interface CaptureResult {
  matched: number; // svar-mails fra kendte leads/kontakter i vinduet
  existing: number; // allerede gemt (samme Message-ID)
  inserted: number; // nye (0 ved dryRun: der skrives intet)
  wouldInsert: number; // matched - existing
  companies: number; // antal virksomheder de nye svar hører til
  byCategory: Record<string, number>; // kun nye svar
  expired: number; // uddrag nulstillet efter 180 dage
  errors: Record<string, string>;
}

/** Parser, dedupér og gem. Ingen IMAP: kernen testes uden netværk. */
export async function saveCaptured(db: Db, raws: RawReply[], byEmail: Map<string, string>, opts: { dryRun?: boolean } = {}): Promise<Omit<CaptureResult, "errors" | "expired">> {
  const unique = new Map(raws.map((r) => [r.messageId, r])); // samme mail i begge konti tæller én gang
  // Dry-run før migration 0017 er kørt: tabellen findes ikke endnu, så intet er "allerede gemt".
  const known = await existingMessageIds(db, [...unique.keys()]).catch((err) => {
    if (opts.dryRun && isMissingTable(err)) return new Set<string>();
    throw err;
  });
  const fresh = [...unique.values()].filter((r) => !known.has(r.messageId));

  const rows: NewLeadReply[] = [];
  const byCategory: Record<string, number> = {};
  for (const r of fresh) {
    const companyId = byEmail.get(r.from);
    if (!companyId) continue;
    const p = parseReply(r.source, r.subject);
    byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;
    rows.push({ companyId, account: r.account, messageId: r.messageId, threadId: r.threadId, receivedAt: r.receivedAt, subject: r.subject.slice(0, 300), snippet: p.snippet, category: p.category, asksCall: p.asksCall });
  }
  const inserted = opts.dryRun ? 0 : await saveLeadReplies(db, rows);
  return {
    matched: unique.size,
    existing: known.size,
    inserted,
    wouldInsert: rows.length,
    companies: new Set(rows.map((r) => r.companyId)).size,
    byCategory,
  };
}

async function scanAccount(
  account: { id: string; user: string; appPassword: string },
  emails: Set<string>,
  since: Date,
): Promise<RawReply[]> {
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
  await client.connect();
  try {
    await client.mailboxOpen("INBOX", { readOnly: true });
    // Runde 1: kun envelope for alt i vinduet; runde 2: fuld kilde kun for de matchede.
    const hits: { uid: number; messageId: string; subject: string; from: string; date: Date }[] = [];
    for await (const msg of client.fetch({ since }, { uid: true, envelope: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      const date = msg.envelope?.date;
      if (!from || !emails.has(from) || !date) continue;
      hits.push({ uid: msg.uid, messageId: msg.envelope?.messageId || `${account.id}:uid:${msg.uid}`, subject: msg.envelope?.subject ?? "", from, date: new Date(date) });
    }
    if (hits.length === 0) return [];
    const byUid = new Map(hits.map((h) => [h.uid, h]));
    const out: RawReply[] = [];
    for await (const msg of client.fetch(hits.map((h) => h.uid).join(","), { uid: true, source: true, threadId: true }, { uid: true })) {
      const h = byUid.get(msg.uid);
      if (!h || !msg.source) continue;
      out.push({ account: account.id, messageId: h.messageId, threadId: msg.threadId ?? null, receivedAt: h.date, subject: h.subject, from: h.from, source: msg.source.toString("utf-8") });
    }
    return out;
  } finally {
    try { await client.logout(); } catch { /* allerede lukket */ }
  }
}

/** Læser svar-mails fra begge konti siden `since` (kun Gmail, intet gemmes). En kontos fejl stopper ikke den anden. */
export async function collectReplies(db: Db, since: Date): Promise<{ raws: RawReply[]; byEmail: Map<string, string>; errors: Record<string, string> }> {
  const byEmail = await replyCandidates(db);
  const emails = new Set(byEmail.keys());
  const errors: Record<string, string> = {};
  const raws: RawReply[] = [];
  for (const account of getActiveSenders()) {
    try {
      raws.push(...(await scanAccount(account, emails, since)));
    } catch (err) {
      errors[account.id] = safeError(err);
    }
  }
  return { raws, byEmail, errors };
}

/** Scan INBOX på begge konti siden `since` og gem nye svar. `dryRun`: læser Gmail + DB, skriver intet. */
export async function captureReplies(opts: { since: Date; dryRun?: boolean; db?: Db }): Promise<CaptureResult> {
  const db = opts.db ?? getDb();
  const { raws, byEmail, errors } = await collectReplies(db, opts.since);
  const saved = await saveCaptured(db, raws, byEmail, { dryRun: opts.dryRun });
  const expired = opts.dryRun ? 0 : await expireOldSnippets(db);
  return { ...saved, expired, errors };
}
