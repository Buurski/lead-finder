// inbox-live.ts — the live, deterministic inbox scan used as a FALLBACK when no
// Cowork digest exists yet. Scans the Gmail INBOX over IMAP for lead-matched
// replies, decodes them cleanly, classifies (reply.ts), and returns an
// InboxDigest. Shared by /api/replies (on-demand), /api/inbox/scan (manual "kør
// nu") and /api/cron/inbox-triage (hybrid fallback). NEVER sends mail.
//
// Hybrid afsendere (2026-06-17): scanner BEGGE Gmail-identiteter (Lucas +
// Charlie). Per-account items merges til ét InboxDigest, men hvert item
// bærer et `account`-tag så UI'et kan vise hvilken konto der modtog svaret.

import { ImapFlow } from "imapflow";
import { getLeads } from "./sheets.ts";
import type { Lead } from "./sheets.ts";
import { classifyReply, draftReply } from "./reply.ts";
import { decodeMailBody } from "./mail-decode.ts";
import { scoreImportance, isActionable } from "./inbox-digest.ts";
import type { InboxDigest, InboxItem, InboxCategory } from "./inbox-digest.ts";
import { getActiveSenders, type SenderId } from "./senders.ts";

function previewOf(text: string, n = 280): string {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, n);
}
function gmailSearchLink(email: string, account?: string) {
  // Per-account Gmail-søgning: hvis senderAccount er kendt, hop direkte
  // ind på denne konto ellers default (u/0).
  const idx = account ? (account === "charlie" ? 1 : 0) : 0;
  return `https://mail.google.com/mail/u/${idx}/#search/from:${encodeURIComponent(email)}`;
}
function toInboxCategory(c: string, becameClient: boolean): InboxCategory {
  if (becameClient) return "client";
  switch (c) {
    case "interested": return "interested";
    case "question": return "question";
    case "objection": return "objection";
    case "not-interested": return "not-interested";
    case "auto-reply": return "auto-reply";
    case "unsubscribe": return "not-interested";
    default: return "other";
  }
}

export interface LiveScanResult {
  ok: boolean;
  digest: InboxDigest | null;
  error?: string;
}

interface AccountScanResult {
  account: SenderId;
  items: Map<string, { lead: Lead; subject: string; date: string; text: string }>;
  error?: string;
}

async function scanOneAccount(
  account: { id: SenderId; user: string; appPassword: string },
  byEmail: Map<string, Lead>,
  since: Date,
): Promise<AccountScanResult> {
  const items = new Map<string, { lead: Lead; subject: string; date: string; text: string }>();
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    ...(process.env.IMAP_ALLOW_SELFSIGNED === "1" ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: account.user, pass: account.appPassword },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (!from || !byEmail.has(from)) continue;
      const lead = byEmail.get(from)!;
      const when = msg.envelope?.date?.toISOString() ?? "";
      const prev = items.get(lead.id);
      if (prev && prev.date >= when) continue;
      const raw = msg.source ? msg.source.toString("utf-8") : "";
      items.set(lead.id, { lead, subject: msg.envelope?.subject ?? "(intet emne)", date: when, text: decodeMailBody(raw) || raw });
    }
    await client.logout();
  } catch (err) {
    try { await client.logout(); } catch { /* ignore */ }
    return { account: account.id, items, error: `imap[${account.id}]: ${String(err)}` };
  }
  return { account: account.id, items };
}

export async function liveScanDigest(): Promise<LiveScanResult> {
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch (err) {
    return { ok: false, digest: null, error: `sheets: ${String(err)}` };
  }

  const emailed = leads.filter((l) => l.email);
  if (emailed.length === 0) {
    return {
      ok: true,
      digest: {
        generatedAt: new Date().toISOString(),
        generatedBy: "live-fallback",
        account: process.env.GMAIL_USER || "lucas",
        items: [],
      },
    };
  }

  // Hybrid: kræv mindst ÉN aktiv konto. Tom queue uden creds = tydelig fejl.
  const accounts = getActiveSenders();
  if (accounts.length === 0) {
    return { ok: false, digest: null, error: "imap not configured (ingen GMAIL_USER eller CHARLIE_GMAIL_USER)" };
  }

  const byEmail = new Map(emailed.map((l) => [l.email.toLowerCase().trim(), l]));
  const sendDates = emailed.map((l) => new Date(l.emailSentAt)).filter((d) => !Number.isNaN(d.getTime()));
  const since = new Date();
  if (sendDates.length > 0) {
    const earliest = sendDates.reduce((a, b) => (a < b ? a : b));
    since.setTime(earliest.getTime());
    since.setDate(since.getDate() - 1);
  } else {
    since.setDate(since.getDate() - 30);
  }
  const floor = new Date();
  floor.setDate(floor.getDate() - 60);
  if (since < floor) since.setTime(floor.getTime());

  // Per-account scan; én fejler ikke de andre. Seneste svar pr lead vinder.
  const perAccount = await Promise.all(
    accounts.map((a) => scanOneAccount(a, byEmail, since)),
  );
  const latest = new Map<string, { lead: Lead; subject: string; date: string; text: string; account: SenderId }>();
  for (const r of perAccount) {
    for (const [leadId, item] of r.items) {
      const prev = latest.get(leadId);
      if (prev && prev.date >= item.date) continue;
      latest.set(leadId, { ...item, account: r.account });
    }
  }

  // Første fejl (hvis nogen) rapporteres i digestens `note`, men ok:true
  // så længe vi fik mindst ÉT svar ind — UI'et kan vise advarslen.
  const errors = perAccount.filter((r) => r.error).map((r) => r.error);
  if (latest.size === 0 && errors.length > 0) {
    return { ok: false, digest: null, error: errors.join("; ") };
  }

  const items: InboxItem[] = [];
  for (const { lead, subject, date, text, account } of latest.values()) {
    const draft = await draftReply(text, { leadName: lead.name, branch: lead.branch, city: lead.city }, "", { useAI: false });
    const cls = draft.classification ?? classifyReply(text);
    const category = toInboxCategory(cls.category, cls.becameClient);
    items.push({
      id: lead.id, account, from: lead.email, fromName: lead.name, subject,
      snippet: previewOf(text), date, category,
      importance: scoreImportance(category, true),
      needsReply: cls.isInterested || isActionable(category),
      reason: cls.becameClient ? "Eksplicit ja — blev kunde" : cls.isInterested ? "Viste interesse" : "Svar fra lead",
      gmailLink: gmailSearchLink(lead.email, account), leadId: lead.id, suggestedReply: draft.suggestedReply,
    });
  }
  items.sort((a, b) => b.importance - a.importance);

  return {
    ok: true,
    digest: {
      generatedAt: new Date().toISOString(),
      generatedBy: "live-fallback",
      account: process.env.GMAIL_USER || "lucas",
      items,
      windowDays: 30,
      note:
        errors.length > 0
          ? `live scan — ${items.length} svar; fejl: ${errors.join("; ")}`
          : `live scan — ${items.length} lead-matchede svar (kun kendte leads, ${perAccount.length} konti).`,
    },
  };
}
