// Manuel oprettelse af en virksomhed/lead fra CRM'et ("+ Ny" → Ny virksomhed).
// Samme negative row_no-mønster som addClientManual i pg/clients.ts: en
// virksomhed uden Sheets-lead-række får et row_no der aldrig kan kollidere
// med en rigtig lead-række (row_no > 0), og som ikke dukker op i getLeads().
//
// Egen fejlklasse i stedet for HqInputError fra ./api.ts (som andre domæne-
// libs som deals.ts/billing.ts også gør) — api.ts trækker "next/server" ind,
// som ikke kan resolves under node:test's rene ESM-kørsel. Ruten pakker den
// om til HqInputError.
import "server-only";
import { and, eq, min, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company } from "../db/schema.ts";

export class CreateCompanyError extends Error {}

export interface NewCompanyInput {
  name: string;
  city?: string;
  phone?: string;
  email?: string;
  website?: string;
}

type Queryable = Pick<Db, "select" | "insert" | "execute">;

async function nextNonLeadRowNo(db: Queryable): Promise<number> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('company_row_no'))`);
  const [{ value }] = await db.select({ value: min(company.rowNo) }).from(company);
  return Math.min(value ?? 0, 0) - 1;
}

export async function createLeadCompany(db: Db, input: NewCompanyInput): Promise<{ id: string }> {
  const name = input.name.trim();
  if (!name) throw new CreateCompanyError("navn mangler");
  if (name.length > 200) throw new CreateCompanyError("navn er for langt");
  const city = input.city?.trim() ?? "";
  return db.transaction(async (tx) => {
    const rowNo = await nextNonLeadRowNo(tx); // tager også låsen, så dublet-tjekket er sikkert
    // Dublet: samme navn (uden mellemrum/tegn) i samme by — eller hvor én af byerne mangler.
    const compact = name.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
    if (compact) {
      const [dupe] = await tx
        .select({ name: company.name, city: company.city })
        .from(company)
        .where(and(
          eq(company.archived, false),
          sql`regexp_replace(lower(${company.name}), '[^a-z0-9æøå]', '', 'g') = ${compact}`,
          city ? sql`(${company.city} = '' or lower(${company.city}) = ${city.toLowerCase()})` : sql`true`,
        ))
        .limit(1);
      if (dupe) throw new CreateCompanyError(`"${dupe.name}"${dupe.city ? ` i ${dupe.city}` : ""} findes allerede — søg efter den i stedet.`);
    }
    const [c] = await tx
      .insert(company)
      .values({
        rowNo,
        name,
        city,
        phone: input.phone?.trim() ?? "",
        email: input.email?.trim() ?? "",
        website: input.website?.trim() ?? "",
      })
      .returning({ id: company.id });
    return { id: c.id };
  });
}
