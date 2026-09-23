import { and, eq, or } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, companyRelation } from "../db/schema.ts";

export class RelationError extends Error {}

export function relationPair(first: string, second: string): { aId: string; bId: string } {
  if (first === second) throw new RelationError("En virksomhed kan ikke knyttes til sig selv");
  return first < second ? { aId: first, bId: second } : { aId: second, bId: first };
}

export async function addRelation(db: Db, companyId: string, otherId: string, label = "") {
  const pair = relationPair(companyId, otherId);
  const [a] = await db.select({ id: company.id }).from(company).where(and(eq(company.id, pair.aId), eq(company.archived, false)));
  const [b] = await db.select({ id: company.id }).from(company).where(and(eq(company.id, pair.bId), eq(company.archived, false)));
  if (!a || !b) throw new RelationError("Virksomheden findes ikke");
  const [row] = await db.insert(companyRelation).values({ ...pair, label: label.trim().slice(0, 80) })
    .onConflictDoUpdate({ target: [companyRelation.aId, companyRelation.bId], set: { label: label.trim().slice(0, 80) } }).returning();
  return row;
}

export async function removeRelation(db: Db, companyId: string, relationId: string) {
  const [row] = await db.delete(companyRelation)
    .where(and(eq(companyRelation.id, relationId), or(eq(companyRelation.aId, companyId), eq(companyRelation.bId, companyId))))
    .returning({ id: companyRelation.id });
  if (!row) throw new RelationError("Relationen findes ikke");
  return row;
}

export async function listRelations(db: Db, companyId: string) {
  const rows = await db.select().from(companyRelation)
    .where(or(eq(companyRelation.aId, companyId), eq(companyRelation.bId, companyId)));
  const result: Array<{ id: string; otherId: string; name: string; label: string }> = [];
  for (const row of rows) {
    const otherId = row.aId === companyId ? row.bId : row.aId;
    const [other] = await db.select({ name: company.name }).from(company).where(and(eq(company.id, otherId), eq(company.archived, false)));
    if (other) result.push({ id: row.id, otherId, name: other.name, label: row.label });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, "da"));
}
