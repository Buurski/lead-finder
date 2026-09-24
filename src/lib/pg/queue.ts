// PG-udgave af kladde-køen (src/lib/queue.ts readQueue/writeQueue) bag DATA_BACKEND=pg.
// draft jsonb er hele QueueDraft-objektet (loss-fri); de typede kolonner findes
// kun for at kunne filtrere/joine (spec §3).
import "server-only";
import { and, asc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { company, contact, outreach } from "../db/schema.ts";
import type { QueueDraft } from "../queue.ts";
import { bizKey } from "../leads/suppress.ts";

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

/** Målrettet stop (ingen hel-kø-omskrivning): åbne kladder for rækkerne → afvist med grund.
 *  Matcher også kladder nøglet på place_id (VPS-leadgen) eller "c:<uuid>" (oprettet i CRM),
 *  som ikke har company_row_no — ellers kunne en ny kunde stadig få en kold mail (Sol 25/9). */
export async function stopOpenForRows(rowNos: number[], reason: string, now: string): Promise<number> {
  if (!rowNos.length) return 0;
  const cos = await getDb().select({ id: company.id, placeId: company.placeId }).from(company).where(inArray(company.rowNo, rowNos));
  const altIds = cos.flatMap((c) => [`c:${c.id}`, ...(c.placeId ? [c.placeId] : [])]);
  const who = altIds.length
    ? or(inArray(outreach.companyRowNo, rowNos), inArray(sql<string>`${outreach.draft}->>'leadId'`, altIds))
    : inArray(outreach.companyRowNo, rowNos);
  const rows = await getDb()
    .update(outreach)
    .set({
      status: "rejected",
      updatedAt: now,
      draft: sql`${outreach.draft} || jsonb_build_object('status', 'rejected', 'stoppedReason', ${reason}::text, 'updatedAt', ${now}::text)`,
    })
    .where(and(who, inArray(outreach.status, ["pending", "edited", "approved"])))
    .returning({ id: outreach.id });
  return rows.length;
}

/** Sendt, under afsendelse eller system-stoppet = endelig for hel-kø-skrivninger.
 *  "sending" flyttes KUN af finishSend (send-ruten) — et forældet snapshot må
 *  hverken overskrive eller slette en kladde mens/efter SMTP har den. */
const FINAL = sql`(${outreach.status} in ('sent', 'sending') or (${outreach.status} = 'rejected' and ${outreach.draft} ? 'stoppedReason'))`;

/** Atomisk reservation: approved/edited → sending, med modtageren låst i kladden.
 *  null = kladden er ændret/afvist/allerede taget → send IKKE. */
export async function reserveForSend(id: string, recipientEmail: string, expectedUpdatedAt: string, now: string): Promise<QueueDraft | null> {
  const rows = await getDb()
    .update(outreach)
    .set({
      status: "sending",
      updatedAt: now,
      draft: sql`${outreach.draft} || jsonb_build_object('status', 'sending', 'recipientEmail', ${recipientEmail}::text, 'sendingAt', ${now}::text, 'updatedAt', ${now}::text)`,
    })
    // Versions-tjek: en redigering (modtager/tekst/afsender) efter den friske læsning ⇒ ingen reservation.
    .where(and(eq(outreach.id, id), inArray(outreach.status, ["approved", "edited"]), eq(outreach.updatedAt, expectedUpdatedAt)))
    .returning({ draft: outreach.draft });
  return rows.length ? (rows[0].draft as QueueDraft) : null;
}

/** Afslut en reservation: sending → sent (mailen gik ud) eller → approved (SMTP afviste
 *  med sikkerhed før accept). false = rækken var ikke længere "sending". */
export async function finishSend(id: string, result: "sent" | "approved", sentBy: string | null, now: string): Promise<boolean> {
  const patch = result === "sent"
    ? sql`jsonb_build_object('status', 'sent', 'sentBy', ${sentBy}::text, 'updatedAt', ${now}::text)`
    : sql`jsonb_build_object('status', 'approved', 'updatedAt', ${now}::text)`;
  const rows = await getDb()
    .update(outreach)
    .set({ status: result, updatedAt: now, ...(result === "sent" ? { sentBy } : {}), draft: sql`(${outreach.draft} - 'sendingAt') || ${patch}` })
    .where(and(eq(outreach.id, id), eq(outreach.status, "sending")))
    .returning({ id: outreach.id });
  return rows.length === 1;
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
          // + versions-guard (Sol R3): et forældet snapshot (queue-enrich/append læser hele
          // køen og skriver minutter senere) må ikke genoplive en kladde der er ændret siden —
          // fx afvist efter snapshottet. Skriveren der selv ændrer en kladde bumper updatedAt.
          setWhere: sql`not ${FINAL} and ${outreach.updatedAt} <= excluded.updated_at`,
        });
      // Endelige kladder slettes aldrig (historik + dobbelt-mail-værn): ellers kunne et
      // forældet snapshot bagefter indsætte et system-stoppet id som "godkendt" (Sol 23/9).
      await tx.delete(outreach).where(and(notInArray(outreach.id, ids), sql`not ${FINAL}`));
    } else {
      await tx.delete(outreach).where(sql`not ${FINAL}`);
    }
  });
}

/** Én kladde, ét betinget UPDATE (ingen hel-kø-omskrivning fra et forældet snapshot).
 *  null = findes ikke eller er endelig (sendt/under afsendelse/system-stoppet). */
export async function updateDraftRow(id: string, patch: Partial<QueueDraft>, now: string): Promise<QueueDraft | null> {
  const merged = { ...patch, updatedAt: now };
  const rows = await getDb()
    .update(outreach)
    .set({
      updatedAt: now,
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.sender !== undefined ? { sender: patch.sender ?? null } : {}),
      ...(patch.sentBy !== undefined ? { sentBy: patch.sentBy ?? null } : {}),
      draft: sql`${outreach.draft} || ${JSON.stringify(merged)}::jsonb`,
    })
    .where(and(eq(outreach.id, id), sql`not ${FINAL}`))
    .returning({ draft: outreach.draft });
  return rows.length ? (rows[0].draft as QueueDraft) : null;
}

/** CRM-sandheden på send-tidspunktet: er virksomheden bag kladden kunde? Matcher på
 *  række/place_id/c:<uuid> OG på navn+by eller modtager-mail mod kundelisten — en manuelt
 *  oprettet kunde har ofte hverken rækkenummer eller place_id fælles med en leadgen-kladde (Sol R3). */
export async function customerForDraft(d: { leadId: string; name?: string; city?: string }, recipient: string): Promise<boolean> {
  if (await customerForLead(d.leadId)) return true;
  const isCustomer = or(and(sql`${company.clientNo} is not null`, eq(company.clientRemoved, false)), eq(company.leadStatus, "client"));
  const customers = await getDb().select({ id: company.id, name: company.name, city: company.city, email: company.email }).from(company).where(isCustomer);
  const key = bizKey(d.name, d.city);
  const to = recipient.trim().toLowerCase();
  if (customers.some((c) => (key && bizKey(c.name, c.city) === key) || (to && c.email.trim().toLowerCase() === to))) return true;
  if (!to || !customers.length) return false;
  // Kontaktpersoner hos kunder (onboarding kan have mailen KUN på kontakten).
  const hit = await getDb().select({ id: contact.id }).from(contact)
    .where(and(inArray(contact.companyId, customers.map((c) => c.id)), sql`lower(trim(${contact.email})) = ${to}`)).limit(1);
  return hit.length > 0;
}

async function customerForLead(leadId: string): Promise<boolean> {
  const where = /^\d+$/.test(leadId)
    ? eq(company.rowNo, Number(leadId))
    : leadId.startsWith("c:")
      ? eq(company.id, leadId.slice(2))
      : eq(company.placeId, leadId);
  if (leadId.startsWith("c:") && !/^[0-9a-f-]{36}$/i.test(leadId.slice(2))) return false;
  const [c] = await getDb().select({ clientNo: company.clientNo, removed: company.clientRemoved, leadStatus: company.leadStatus }).from(company).where(where).limit(1);
  return Boolean(c && ((c.clientNo !== null && !c.removed) || c.leadStatus === "client"));
}
