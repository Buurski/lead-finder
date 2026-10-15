// DB-siden af svar-indsamlingen (spec 2026-10-15-har-svaret-kontekst-design.md §4-5): hvem skal vi lytte efter,
// idempotent gem, og opbevaringsfrist. IMAP-delen bor i lib/capture-replies.ts. Intet sendes.
import "server-only";
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, contact, leadReply } from "../db/schema.ts";

export const SNIPPET_RETENTION_DAYS = 180;

// Afmeldte/bouncede lytter vi ikke efter: deres svar skal ikke ligge i vores DB (samme sæt som isSuppressed).
const SUPPRESSED_EMAIL_STATUS = ["unsubscribed", "unsubscribe", "afmeldt", "bounced", "complained"];

/** Lowercased afsender-adresse → company.id. Lead-mailen vinder over en kontakts mail ved samme adresse. */
export async function replyCandidates(db: Db): Promise<Map<string, string>> {
  const live = and(eq(company.archived, false), sql`lower(trim(${company.emailStatus})) not in (${sql.join(SUPPRESSED_EMAIL_STATUS.map((s) => sql`${s}`), sql`, `)})`);
  const viaContact = await db
    .select({ email: contact.email, companyId: company.id })
    .from(contact)
    .innerJoin(company, eq(contact.companyId, company.id))
    .where(and(live, sql`${contact.email} like '%@%'`));
  const own = await db.select({ email: company.email, companyId: company.id }).from(company).where(and(live, sql`${company.email} like '%@%'`));
  const map = new Map<string, string>();
  for (const r of [...viaContact, ...own]) map.set(r.email.trim().toLowerCase(), r.companyId);
  return map;
}

export interface NewLeadReply {
  companyId: string;
  account: string;
  messageId: string;
  threadId: string | null;
  receivedAt: Date;
  subject: string;
  snippet: string;
  category: string;
  asksCall: boolean;
}

export async function existingMessageIds(db: Db, ids: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await db.select({ id: leadReply.messageId }).from(leadReply).where(inArray(leadReply.messageId, ids.slice(i, i + 500)));
    for (const r of rows) found.add(r.id);
  }
  return found;
}

/** Idempotent: samme Message-ID to gange giver én række. Returnerer antal NYE rækker. */
export async function saveLeadReplies(db: Db, rows: NewLeadReply[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const out = await db.insert(leadReply).values(rows.slice(i, i + 100)).onConflictDoNothing({ target: leadReply.messageId }).returning({ id: leadReply.id });
    inserted += out.length;
  }
  return inserted;
}

/** Nulstiller svar-uddraget efter opbevaringsfristen; metadata (dato, kategori, afsender-konto) bliver. */
export async function expireOldSnippets(db: Db, days = SNIPPET_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const out = await db
    .update(leadReply)
    .set({ snippet: null })
    .where(and(isNotNull(leadReply.snippet), lt(leadReply.receivedAt, cutoff)))
    .returning({ id: leadReply.id });
  return out.length;
}
