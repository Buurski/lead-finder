// Modtager-forslag + company-link for fakturaer (fase 2 bølge 3). Ren læsning —
// ingen skrivning her. Kæde: primær kontakt med mail → company.email → seneste
// modtager-mail brugt på en tidligere faktura til samme kunde.
import "server-only";
import { and, asc, desc, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { company, contact, invoice } from "../db/schema.ts";
import type { Invoice } from "../invoices.ts";

/** Faktura-nummer → company-id, kun for fakturaer koblet på en virksomhed. */
export async function invoiceCompanyMap(): Promise<Record<string, string>> {
  const rows = await getDb()
    .select({ number: invoice.number, companyId: invoice.companyId })
    .from(invoice)
    .where(isNotNull(invoice.companyId));
  const out: Record<string, string> = {};
  for (const r of rows) if (r.companyId) out[r.number] = r.companyId;
  return out;
}

export interface RecipientGuess {
  to: string;
  source: "kontakt" | "virksomhed" | "tidligere-faktura" | "ingen";
}

/**
 * Bedste gæt på modtager-mail til send-dialogen. Fejler aldrig hørbart — kaldes
 * kun for at forudfylde et felt, brugeren kan altid rette det.
 * ponytail: "primær kontakt" = første oprettede kontakt med en mail — der er
 * ikke et isPrimary-flag på contact endnu.
 */
export async function resolveInvoiceRecipient(invoiceNumber: string): Promise<RecipientGuess> {
  const db = getDb();
  const [inv] = await db.select({ companyId: invoice.companyId }).from(invoice).where(eq(invoice.number, invoiceNumber));
  if (!inv?.companyId) return { to: "", source: "ingen" };
  const companyId = inv.companyId;

  const [primaryContact] = await db
    .select({ email: contact.email })
    .from(contact)
    .where(and(eq(contact.companyId, companyId), ne(contact.email, "")))
    .orderBy(asc(contact.createdAt))
    .limit(1);
  if (primaryContact?.email) return { to: primaryContact.email, source: "kontakt" };

  const [co] = await db.select({ email: company.email }).from(company).where(eq(company.id, companyId));
  if (co?.email) return { to: co.email, source: "virksomhed" };

  const prior = await db
    .select({ data: invoice.data })
    .from(invoice)
    .where(eq(invoice.companyId, companyId))
    .orderBy(desc(invoice.issueDate));
  for (const row of prior) {
    const sentTo = (row.data as Invoice).sentTo;
    if (sentTo) return { to: sentTo, source: "tidligere-faktura" };
  }
  return { to: "", source: "ingen" };
}
