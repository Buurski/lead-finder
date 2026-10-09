// "Har svaret"-listen: leads der selv har svaret på en mail og stadig er åbne.
// Samme WHERE som forsidens tal (repliedLeadsWhere i summary.ts) — aldrig en egen definition.
import "server-only";
import { sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company } from "../db/schema.ts";
import { repliedLeadsWhere } from "./summary.ts";

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
export async function listRepliedLeads(db: Db, limit = 300): Promise<RepliedLead[]> {
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
    .orderBy(sql`${lastContact} asc nulls last`, company.name)
    .limit(limit);
  return rows.map((r) => ({ ...r, lastContactAt: r.lastContactAt ? new Date(r.lastContactAt).toISOString() : null }));
}
