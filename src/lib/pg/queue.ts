// PG-udgave af kladde-køen (src/lib/queue.ts readQueue/writeQueue) bag DATA_BACKEND=pg.
// draft jsonb er hele QueueDraft-objektet (loss-fri); de typede kolonner findes
// kun for at kunne filtrere/joine (spec §3).
import "server-only";
import { and, asc, inArray, ne, notInArray, sql } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { outreach } from "../db/schema.ts";
import type { QueueDraft } from "../queue.ts";

export async function readQueue(): Promise<QueueDraft[]> {
  const db = getDb();
  // Samme rækkefølge som arrayet blev skrevet i (KV-udgaven gemte et array).
  const rows = await db.select().from(outreach).orderBy(asc(outreach.position), asc(outreach.id));
  return rows.map((row) => row.draft as QueueDraft);
}

// "excluded.<col>" is Postgres upsert syntax for the row proposed by INSERT;
// onConflictDoUpdate's `set` needs it to copy the incoming value over.
function excluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

/** Målrettet stop (ingen hel-kø-omskrivning): åbne kladder for rækkerne → afvist med grund. */
export async function stopOpenForRows(rowNos: number[], reason: string, now: string): Promise<number> {
  if (!rowNos.length) return 0;
  const rows = await getDb()
    .update(outreach)
    .set({
      status: "rejected",
      updatedAt: now,
      draft: sql`${outreach.draft} || jsonb_build_object('status', 'rejected', 'stoppedReason', ${reason}::text, 'updatedAt', ${now}::text)`,
    })
    .where(and(inArray(outreach.companyRowNo, rowNos), inArray(outreach.status, ["pending", "edited", "approved"])))
    .returning({ id: outreach.id });
  return rows.length;
}

export async function writeQueue(drafts: QueueDraft[]): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    // Serialisér hele erstatningen: to samtidige skrivninger må ikke efterlade foreningen af begge sæt.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('outreach_queue'))`);
    const ids = drafts.map((d) => d.id);
    if (drafts.length > 0) {
      const values = drafts.map((d, position) => ({
        id: d.id,
        position,
        step: d.step ?? 1,
        angle: d.angle ?? null,
        companyRowNo: /^\d+$/.test(d.leadId) ? Number(d.leadId) : null,
        status: d.status,
        sender: d.sender ?? null,
        sentBy: d.sentBy ?? null,
        draft: d,
        createdAt: d.createdAt ?? "",
        updatedAt: d.updatedAt ?? "",
      }));
      await tx
        .insert(outreach)
        .values(values)
        .onConflictDoUpdate({
          target: outreach.id,
          set: {
            companyRowNo: excluded("company_row_no"),
            position: excluded("position"),
            step: excluded("step"),
            angle: excluded("angle"),
            status: excluded("status"),
            sender: excluded("sender"),
            sentBy: excluded("sent_by"),
            draft: excluded("draft"),
            createdAt: excluded("created_at"),
            updatedAt: excluded("updated_at"),
          },
          // En sendt eller system-stoppet kladde er endelig: et forældet snapshot
          // (fx queue-enrich der holder køen i minutter) må aldrig gøre den
          // "godkendt" igen — så kunne den blive sendt en gang til (Opus 22/9).
          setWhere: sql`not (${outreach.status} = 'sent' or (${outreach.status} = 'rejected' and ${outreach.draft} ? 'stoppedReason'))`,
        });
      // Sendte kladder slettes aldrig (historik + dobbelt-mail-værn).
      await tx.delete(outreach).where(and(notInArray(outreach.id, ids), ne(outreach.status, "sent")));
    } else {
      await tx.delete(outreach).where(ne(outreach.status, "sent"));
    }
  });
}
