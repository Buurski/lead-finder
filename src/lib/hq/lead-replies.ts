// DB-siden af svar-indsamlingen (spec 2026-10-15-har-svaret-kontekst-design.md §4-5): hvem skal vi lytte efter,
// idempotent gem, og opbevaringsfrist. IMAP-delen bor i lib/capture-replies.ts. Intet sendes.
import "server-only";
import { and, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, contact, leadReply } from "../db/schema.ts";
import { isSuppressed } from "../canSendTo.ts";

export const SNIPPET_RETENTION_DAYS = 180;

export const CAPTURE_DEFAULT_DAYS = 30;
export const CAPTURE_MAX_DAYS = 365;

/** Vinduet for "Opdatér svar": body.days som helt tal 1-365, ellers 30. Ugyldigt input giver 30, aldrig et større vindue. */
export function captureWindowDays(body: unknown): number {
  const d = (body as { days?: unknown } | null)?.days;
  return typeof d === "number" && Number.isInteger(d) && d >= 1 && d <= CAPTURE_MAX_DAYS ? d : CAPTURE_DEFAULT_DAYS;
}

// Postgres 42P01 = undefined_table (lead_reply før migration 0017); drizzle pakker driverfejlen ind i `cause`.
export function isMissingTable(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "42P01" || e?.cause?.code === "42P01";
}

// Fejltekst uden SQL-parametre: drizzle-fejl rummer hele forespørgslen inkl. svar-uddrag, og den må ikke i logs.
export function safeError(err: unknown): string {
  const e = err as { name?: string; code?: string; cause?: { code?: string; message?: string }; message?: string };
  const code = e?.code ?? e?.cause?.code;
  const msg = e?.cause?.message ?? (e?.name === "DrizzleQueryError" ? "" : e?.message) ?? "";
  return [e?.name ?? "Error", code, msg.split("\n")[0].slice(0, 120)].filter(Boolean).join(" ");
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Lowercased afsender-adresse → company.id. Afmeldt/bounced (emailStatus ELLER leadStatus, som send-gaten) lytter vi
 * ikke efter, og adressen er spærret globalt: står den på en afmeldt virksomhed, tæller den ikke som match for en anden.
 * Lead-mailen vinder over en kontakts mail; deler flere virksomheder adressen, kan svaret ikke henføres, så den udelades.
 */
export async function replyCandidates(db: Db): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: company.id, email: company.email, emailStatus: company.emailStatus, leadStatus: company.leadStatus, archived: company.archived })
    .from(company);
  const contacts = await db.select({ companyId: contact.companyId, email: contact.email }).from(contact).where(sql`${contact.email} like '%@%'`);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const blocked = new Set<string>();
  const own = new Map<string, Set<string>>();
  const viaContact = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, email: string, id: string) => m.set(email, (m.get(email) ?? new Set<string>()).add(id));
  const entries = [
    ...rows.filter((r) => r.email?.includes("@")).map((r) => ({ id: r.id, email: norm(r.email!), isOwn: true })),
    ...contacts.flatMap((c) => (c.companyId && c.email && byId.has(c.companyId) ? [{ id: c.companyId, email: norm(c.email), isOwn: false }] : [])),
  ];
  for (const e of entries) {
    const c = byId.get(e.id)!;
    if (isSuppressed({ emailStatus: c.emailStatus ?? "", status: c.leadStatus ?? "" })) blocked.add(e.email);
    else if (!c.archived) add(e.isOwn ? own : viaContact, e.email, e.id);
  }
  const map = new Map<string, string>();
  for (const email of new Set([...own.keys(), ...viaContact.keys()])) {
    if (blocked.has(email)) continue;
    const ids = own.get(email) ?? viaContact.get(email)!;
    if (ids.size === 1) map.set(email, [...ids][0]);
  }
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
