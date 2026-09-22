// Postgres-udgave af faktura-lageret i invoices.ts (fase 1, bag DATA_BACKEND=pg).
// Hele Invoice/Subscription-objektet ligger i `data` (loss-frit); de typede
// kolonner findes for at kunne filtrere og for company_id-koblingen, som
// erstatter navne-matchet i fase 4.
import { asc, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client.ts";
import { company, counter, invoice, subscriptionPlan } from "../db/schema.ts";
import { canonicalClientName } from "../client-alias.ts";
import type { Invoice, Subscription } from "../invoices.ts";

// Kunden bag et navn. Kun virksomheder der ER kunder (clientNo sat) — et lead
// med samme navn må ikke få fakturaen hæftet på sig.
async function companyIdFor(db: Db, clientName: string): Promise<string | null> {
  const want = canonicalClientName(clientName);
  const clients = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(isNotNull(company.clientNo));
  return clients.find((c) => canonicalClientName(c.name) === want)?.id ?? null;
}

// Atomisk: UPDATE ... RETURNING tager rækkelåsen, så to samtidige kald aldrig
// får samme nummer, og et slettet nummer genbruges aldrig.
export async function nextInvoiceNumber(_today: string): Promise<string> {
  const db = getDb();
  await db.insert(counter).values({ name: "invoice", value: 0 }).onConflictDoNothing();
  const [row] = await db
    .update(counter)
    .set({ value: sql`${counter.value} + 1` })
    .where(eq(counter.name, "invoice"))
    .returning({ value: counter.value });
  return String(row.value).padStart(3, "0");
}

export async function saveInvoice(inv: Invoice): Promise<void> {
  const db = getDb();
  const companyId = await companyIdFor(db, inv.clientName);
  const cols = {
    companyId,
    clientName: inv.clientName,
    status: inv.status,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    data: inv,
  };
  await db
    .insert(invoice)
    .values({ number: inv.number, ...cols })
    .onConflictDoUpdate({ target: invoice.number, set: cols });
}

export async function deleteInvoiceRow(number: string): Promise<void> {
  await getDb().delete(invoice).where(eq(invoice.number, number));
}

export async function getInvoice(number: string): Promise<Invoice | null> {
  const [row] = await getDb().select({ data: invoice.data }).from(invoice).where(eq(invoice.number, number));
  return (row?.data as Invoice | undefined) ?? null;
}

export async function listInvoices(): Promise<Invoice[]> {
  const rows = await getDb().select({ data: invoice.data }).from(invoice);
  const all = rows.map((r) => r.data as Invoice);
  // Samme sortering som KV-udgaven: nyeste nummer først.
  all.sort((a, b) => (a.number < b.number ? 1 : a.number > b.number ? -1 : 0));
  return all;
}

export async function listInvoicesFor(clientName: string): Promise<Invoice[]> {
  const db = getDb();
  const companyId = await companyIdFor(db, clientName);
  const all = await listInvoices();
  if (!companyId) {
    return all.filter((inv) => canonicalClientName(inv.clientName) === canonicalClientName(clientName));
  }
  const linked = new Set(
    (await db.select({ number: invoice.number }).from(invoice).where(eq(invoice.companyId, companyId))).map((r) => r.number),
  );
  // Også navne-match: fakturaer gemt før kunden fik clientNo har companyId=null.
  return all.filter(
    (inv) => linked.has(inv.number) || canonicalClientName(inv.clientName) === canonicalClientName(clientName),
  );
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const rows = await getDb()
    .select({ data: subscriptionPlan.data })
    .from(subscriptionPlan)
    .orderBy(asc(subscriptionPlan.position));
  return rows.map((r) => r.data as Subscription);
}

// Erstatter hele listen (samme semantik som store.put af arrayet).
export async function saveSubscriptions(subs: Subscription[]): Promise<void> {
  const seen = new Set<string>();
  for (const s of subs) {
    if (seen.has(s.clientName)) throw new Error(`Dobbelt abonnement for "${s.clientName}"`);
    seen.add(s.clientName);
  }
  const db = getDb();
  const ids = await Promise.all(subs.map((s) => companyIdFor(db, s.clientName)));
  await db.transaction(async (tx) => {
    await tx.delete(subscriptionPlan);
    if (subs.length) {
      await tx.insert(subscriptionPlan).values(
        subs.map((s, i) => ({ clientName: s.clientName, companyId: ids[i], position: i, data: s })),
      );
    }
  });
}

// Bruges af migreringen: sæt tælleren så den aldrig kan ramme et eksisterende nummer.
export async function ensureInvoiceCounterAtLeast(value: number): Promise<void> {
  const db = getDb();
  await db
    .insert(counter)
    .values({ name: "invoice", value })
    .onConflictDoUpdate({ target: counter.name, set: { value: sql`greatest(${counter.value}, ${value})` } });
}
