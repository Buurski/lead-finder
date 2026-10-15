// "Har svaret"-listen: leads der selv har svaret på en mail og stadig er åbne.
// Samme WHERE som forsidens tal (repliedLeadsWhere i summary.ts) — aldrig en egen definition.
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, leadReply, outreach } from "../db/schema.ts";
import { repliedLeadsWhere } from "./summary.ts";
import { isMissingTable } from "./lead-replies.ts";
import { bucketFor, type ReplyBucket } from "./reply-bucket.ts";

export interface RepliedLead {
  id: string;
  rowNo: number;
  name: string;
  city: string;
  branch: string;
  phone: string;
  email: string;
  jevGrade: string | null;
  owner: string | null;
  lifecycle: string;
  /** Seneste kontakt fra vores side: seneste mail/opfølgning eller opkald/møde/note/udfald. null = ingen dato. */
  lastContactAt: string | null;
}

// "company"."id" står skrevet ud: drizzle udelader tabelnavnet i en select med én tabel, og et bart "id"
// ville inde i underforespørgslen betyde activity.id (aldrig lig company_id).
// Menneskelig kontakt: opkald, møde, note (ikke systemets egne) og svar-udfald (payload.replyOutcome).
const lastContact = sql<string | null>`greatest(
  nullif(${company.emailSentAt}, '')::timestamptz,
  nullif(${company.followupSentAt}, '')::timestamptz,
  (select max(a.at) from activity a where a.company_id = "company"."id"
    and (a.type in ('opkald', 'moede') or (a.type = 'note' and a.actor not in ('system', 'claude', 'codex')) or a.payload ? 'replyOutcome'))
)`;

/** Ældst kontakt først (de mest forsømte øverst); leads uden nogen dato til sidst. */
export async function listRepliedLeads(db: Db): Promise<RepliedLead[]> {
  const rows = await db
    .select({
      id: company.id,
      rowNo: company.rowNo,
      name: company.name,
      city: company.city,
      branch: company.branch,
      phone: company.phone,
      email: company.email,
      jevGrade: company.jevGrade,
      owner: company.owner,
      lifecycle: company.lifecycle,
      lastContactAt: lastContact,
    })
    .from(company)
    .where(repliedLeadsWhere())
    .orderBy(sql`${lastContact} asc nulls last`, company.name);
  return rows.map((r) => ({ ...r, lastContactAt: r.lastContactAt ? new Date(r.lastContactAt).toISOString() : null }));
}

export interface RepliedLeadReply {
  receivedAt: string;
  account: string;
  category: string;
  asksCall: boolean;
  subject: string;
  /** Adressen svaret kom fra; null = ældre række (så bruges virksomhedens adresse). */
  fromEmail: string | null;
  /** null efter opbevaringsfristen (180 dage) */
  snippet: string | null;
}

export interface RepliedLeadContext extends RepliedLead {
  /** Seneste svar-mail fra leadet; null = ingen hentet (indsamlingen er ikke kørt, eller mailen kom fra en anden adresse). */
  reply: RepliedLeadReply | null;
  /** Vores seneste mail/opfølgning (fra company), uafhængig af menneskelig kontakt. */
  lastMailAt: string | null;
  /** Antal afsendte mails vi kender i outreach-tabellen (0 = hvad vi skrev er ikke registreret her). */
  mailsSent: number;
  /** Status "called" fra Sheets-tiden uden et eneste logget opkald i CRM. */
  calledNoLog: boolean;
  cvrUnchecked: boolean;
  bucket: ReplyBucket;
  why: string;
}

const iso = (v: string) => {
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};

/**
 * "Har svaret" med kontekst: hvert lead + dets seneste svar-uddrag (lead_reply), hvad vi selv har skrevet og en kanal-bucket.
 * `captureReady` er false når lead_reply ikke findes endnu (migration 0017) — siden virker, men alle står som "Tjek først".
 */
export async function listRepliedLeadsWithContext(db: Db, now: Date = new Date()): Promise<{ leads: RepliedLeadContext[]; captureReady: boolean }> {
  const base = await listRepliedLeads(db);
  if (base.length === 0) return { leads: [], captureReady: true };
  const ids = base.map((l) => l.id);
  const rowNos = base.map((l) => l.rowNo);

  let captureReady = true;
  const latest = new Map<string, RepliedLeadReply>();
  try {
    const replies = await db.select().from(leadReply).where(inArray(leadReply.companyId, ids)).orderBy(leadReply.companyId, desc(leadReply.receivedAt));
    for (const r of replies) {
      if (latest.has(r.companyId)) continue; // sorteret nyeste først pr. virksomhed
      latest.set(r.companyId, { receivedAt: r.receivedAt.toISOString(), account: r.account, category: r.category, asksCall: r.asksCall, subject: r.subject, fromEmail: r.fromEmail, snippet: r.snippet });
    }
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    captureReady = false;
  }

  const [sent, extra, called] = await Promise.all([
    db.select({ rowNo: outreach.companyRowNo, n: sql<number>`count(*)::int` }).from(outreach).where(and(eq(outreach.status, "sent"), inArray(outreach.companyRowNo, rowNos))).groupBy(outreach.companyRowNo),
    db.select({ id: company.id, leadStatus: company.leadStatus, notes: company.notes, emailSentAt: company.emailSentAt, followupSentAt: company.followupSentAt }).from(company).where(inArray(company.id, ids)),
    db.select({ id: activity.companyId }).from(activity).where(and(eq(activity.type, "opkald"), inArray(activity.companyId, ids))).groupBy(activity.companyId),
  ]);
  const sentBy = new Map(sent.map((s) => [s.rowNo, s.n]));
  const extraBy = new Map(extra.map((e) => [e.id, e]));
  const hasCall = new Set(called.map((c) => c.id));

  const leads = base.map((l): RepliedLeadContext => {
    const reply = latest.get(l.id) ?? null;
    const e = extraBy.get(l.id);
    const mails = [e?.emailSentAt, e?.followupSentAt].map((v) => (v ? iso(v) : null)).filter((v): v is string => v !== null).sort();
    const { bucket, why } = bucketFor({ category: reply?.category ?? null, asksCall: reply?.asksCall ?? false, receivedAt: reply ? new Date(reply.receivedAt) : null, hasSnippet: Boolean(reply?.snippet) }, now);
    return {
      ...l,
      reply,
      lastMailAt: mails.at(-1) ?? null,
      mailsSent: sentBy.get(l.rowNo) ?? 0,
      calledNoLog: (e?.leadStatus ?? "").trim().toLowerCase() === "called" && !hasCall.has(l.id),
      cvrUnchecked: /cvr_unchecked/i.test(e?.notes ?? ""),
      bucket,
      why,
    };
  });
  return { leads, captureReady };
}
