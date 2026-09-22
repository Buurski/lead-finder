// PG-udgave af kladde-køen (src/lib/queue.ts readQueue/writeQueue) bag DATA_BACKEND=pg.
// draft jsonb er hele QueueDraft-objektet (loss-fri); de typede kolonner findes
// kun for at kunne filtrere/joine (spec §3).
import "server-only";
import { asc, notInArray, sql } from "drizzle-orm";
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
            status: excluded("status"),
            sender: excluded("sender"),
            sentBy: excluded("sent_by"),
            draft: excluded("draft"),
            createdAt: excluded("created_at"),
            updatedAt: excluded("updated_at"),
          },
        });
      await tx.delete(outreach).where(notInArray(outreach.id, ids));
    } else {
      await tx.delete(outreach);
    }
  });
}
