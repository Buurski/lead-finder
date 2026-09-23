// Arbejdslog → faktura (spec §6): fakturerbare "arbejde"-aktiviteter uden
// invoiced_at samles til én faktura-kladde for kunden. Alt i én transaktion:
// aktiviteterne stemples kun hvis kladden gemmes, og en aktivitet kan aldrig
// komme på to fakturaer (invoiced_at is null i WHERE + rækkelås).
import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, counter, invoice } from "../db/schema.ts";
import { addDays, validInvoiceLines, type Invoice } from "../invoices.ts";

export class BillingError extends Error {}

export interface UnbilledItem {
  id: string;
  summary: string;
  amount: number;
  at: string;
  actor: string;
}

export async function unbilledWork(db: Db, companyId: string): Promise<UnbilledItem[]> {
  const rows = await db
    .select({ id: activity.id, summary: activity.summary, amount: activity.billableDkk, at: activity.at, actor: activity.actor })
    .from(activity)
    .where(and(eq(activity.companyId, companyId), gt(activity.billableDkk, 0), isNull(activity.invoicedAt)))
    .orderBy(desc(activity.at));
  return rows.map((r) => ({ ...r, amount: r.amount ?? 0, at: r.at.toISOString() }));
}

/** Laver faktura-kladden af de valgte aktiviteter. Returnerer fakturaen. */
export async function invoiceFromWork(
  db: Db,
  companyId: string,
  activityIds: string[],
  opts: { today: string; payerType: Invoice["payerType"] },
): Promise<Invoice> {
  const ids = [...new Set(activityIds)];
  if (!ids.length) throw new BillingError("vælg mindst ét arbejde");
  return db.transaction(async (tx) => {
    const [co] = await tx.select().from(company).where(eq(company.id, companyId));
    if (!co) throw new BillingError("virksomheden findes ikke");

    const now = new Date();
    const taken = await tx
      .update(activity)
      .set({ invoicedAt: now })
      .where(and(inArray(activity.id, ids), eq(activity.companyId, companyId), gt(activity.billableDkk, 0), isNull(activity.invoicedAt)))
      .returning({ id: activity.id, summary: activity.summary, amount: activity.billableDkk, at: activity.at });
    // Alle eller ingen: en aktivitet der allerede er faktureret (eller hører til en
    // anden kunde) ruller det hele tilbage, så to klik aldrig giver to fakturaer.
    if (taken.length !== ids.length) throw new BillingError("noget af arbejdet er allerede faktureret — genindlæs");

    const lines = taken
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .map((r) => ({ description: r.summary.trim() || "Arbejde", amount: r.amount ?? 0 }));
    if (!validInvoiceLines(lines)) throw new BillingError("et beløb er ugyldigt");

    await tx.insert(counter).values({ name: "invoice", value: 0 }).onConflictDoNothing();
    const [c] = await tx
      .update(counter)
      .set({ value: sql`${counter.value} + 1` })
      .where(eq(counter.name, "invoice"))
      .returning({ value: counter.value });
    const number = String(c.value).padStart(3, "0");

    const inv: Invoice = {
      number,
      clientName: co.name,
      recipient: { name: co.name }, // adresse/CVR udfyldes på kladden før afsendelse
      issueDate: opts.today,
      dueDate: addDays(opts.today, 14),
      lines,
      vatRate: 0,
      status: "kladde",
      payerType: opts.payerType,
      note: "Samlet fra arbejdsloggen",
    };
    await tx.insert(invoice).values({
      number,
      companyId,
      clientName: inv.clientName,
      status: inv.status,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      data: inv,
    });
    await tx
      .update(activity)
      .set({ payload: sql`coalesce(${activity.payload}, '{}'::jsonb) || jsonb_build_object('invoiceNumber', ${number}::text)` })
      .where(inArray(activity.id, ids));
    await tx.insert(activity).values({
      companyId,
      clientName: co.name,
      actor: "system",
      type: "faktura",
      summary: `Faktura ${number} oprettet som kladde af ${taken.length} arbejde`,
    });
    return inv;
  });
}
